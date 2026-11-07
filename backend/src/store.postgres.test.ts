import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"

import { PGlite } from "@electric-sql/pglite"

// Vercel처럼 Postgres에 얹은 데이터 저장소다. 프로세스 안의 데이터베이스가
// Neon을 대신하며, 시드를 한 번만 넣는 것, 읽은 버전을 바탕으로 쓰는 것, 다른
// 복사본의 쓰기가 들어오는 것, 한 시간마다 하는 복사, 행으로 저장하는 사진,
// 동시에 시작해 모두 테이블을 만드는 복사본을 검사한다.
const dataDir = await mkdtemp(path.join(tmpdir(), "uniconnect-pg-"))
// JSON 파일이 놓일 자리다. 데이터베이스를 쓰면 이 파일에는 쓰지 않는다.
process.env.DATA_FILE = path.join(dataDir, "db.json")

const db = new PGlite()
const sql = async (text: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(text, params)).rows
const { useSql } = await import("./lib/sql.js")
useSql(sql)
const store = await import("./store.js")
const { photos } = await import("./lib/photos.js")

after(async () => {
  await db.close()
  await rm(dataDir, { recursive: true, force: true })
})

const stored = async () => {
  const [row] = await sql("select data, version from uniconnect_store where id = 1")
  type Data = { proposals: Record<string, string[]>; agreements: { items: { photos: string[] }[] }[] }
  return { data: JSON.parse(String(row.data)) as Data, version: Number(row.version) }
}

// API의 다른 복사본이 이 복사본 몰래 쓴다.
async function writeAsAnotherCopy(change: (data: { proposals: Record<string, string[]> }) => void) {
  const { data } = await stored()
  change(data)
  await sql("update uniconnect_store set data = $1, version = version + 1 where id = 1", [JSON.stringify(data)])
}

test("the first copy seeds the database, and a later one reads it", async () => {
  const database = await store.loadDatabase()
  assert.ok(database.accounts.length > 0)
  assert.equal((await stored()).version, 1)
  assert.equal(existsSync(process.env.DATA_FILE!), false)
  // 지금 시작한 복사본은 데이터를 찾아 버전을 그대로 둔다.
  await store.loadDatabase()
  assert.equal((await stored()).version, 1)
})

test("each save moves the version on", async () => {
  store.getDatabase().proposals["copy-a"] = ["afternoon-coffee"]
  await store.saveDatabase()
  const after = await stored()
  assert.equal(after.version, 2)
  assert.deepEqual(after.data.proposals["copy-a"], ["afternoon-coffee"])
})

test("another copy's save comes in on the next request", async () => {
  await writeAsAnotherCopy((data) => {
    data.proposals["copy-b"] = ["moment-studio"]
  })
  store.freshness.everyMs = 0
  await store.refreshDatabase()
  assert.deepEqual(store.getDatabase().proposals["copy-b"], ["moment-studio"])
})

test("a save over an older version is undone, the newer data comes in, and saving again works", async () => {
  await writeAsAnotherCopy((data) => {
    data.proposals["late"] = ["brewing-lab"]
  })
  // 이 복사본은 읽어 보지 않고 저장한다.
  store.getDatabase().proposals["mine"] = ["glowlab"]
  await assert.rejects(store.saveDatabase(), (error: { status?: number }) => error.status === 503)
  assert.equal(store.getDatabase().proposals["mine"], undefined)
  assert.deepEqual(store.getDatabase().proposals["late"], ["brewing-lab"])

  store.getDatabase().proposals["mine"] = ["glowlab"]
  await store.saveDatabase()
  const after = await stored()
  assert.deepEqual([after.data.proposals["late"], after.data.proposals["mine"]], [["brewing-lab"], ["glowlab"]])
})

test("a save pushed back by another copy runs again on the newer data and keeps both", async () => {
  let tries = 0
  await store.retryConflicts(async () => {
    tries += 1
    store.getDatabase().proposals["retry-mine"] = ["brewing-lab"]
    if (tries === 1) {
      await writeAsAnotherCopy((data) => {
        data.proposals["retry-theirs"] = ["moment-studio"]
      })
    }
    await store.saveDatabase()
  })
  assert.equal(tries, 2)
  const { proposals } = (await stored()).data
  assert.deepEqual([proposals["retry-mine"], proposals["retry-theirs"]], [["brewing-lab"], ["moment-studio"]])

  // 계속 밀리면 정해진 횟수만큼만 하고 503으로 답한다.
  let pushed = 0
  await assert.rejects(
    store.retryConflicts(async () => {
      pushed += 1
      await writeAsAnotherCopy(() => {})
      await store.saveDatabase()
    }),
    (error: { status?: number }) => error.status === 503,
  )
  assert.equal(pushed, store.conflictRetry.attempts)
  await store.refreshDatabase({ force: true })

  // 다른 오류는 다시 하지 않는다.
  let once = 0
  await assert.rejects(store.retryConflicts(async () => {
    once += 1
    throw new Error("not a conflict")
  }))
  assert.equal(once, 1)
})

test("a write comes in on the newest data, and a session made on another copy is found at once", async () => {
  const { createApp } = await import("./app.js")
  const { hashToken } = await import("./middleware/session.js")
  const { DEMO_PASSWORD } = await import("./data/seed.js")
  const everyMs = store.freshness.everyMs
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  try {
    store.freshness.everyMs = 60_000
    await store.refreshDatabase({ force: true })
    const account = store.getDatabase().accounts.find((item) => item.email === "hello@afternoon-coffee.kr")!

    // 다른 복사본의 로그인. 주기를 기다리지 않고 찾으므로 401이 아니다.
    const token = "made-on-another-copy"
    await writeAsAnotherCopy((data) => {
      const session = { tokenHash: hashToken(token), accountId: account.id, expiresAt: Date.now() + 60_000, device: "test", createdAt: Date.now(), lastUsedAt: Date.now() }
      ;(data as unknown as { sessions: unknown[] }).sessions.push(session)
    })
    const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(me.status, 200)
    assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: "Bearer nobody" } })).status, 401)

    // 다른 복사본이 쓴 직후의 쓰기도 밀리지 않는다.
    await writeAsAnotherCopy((data) => {
      data.proposals["before-login"] = ["moment-studio"]
    })
    const login = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "브랜드", email: account.email, password: DEMO_PASSWORD }),
    })
    assert.equal(login.status, 200)
    assert.deepEqual((await stored()).data.proposals["before-login"], ["moment-studio"])
  } finally {
    store.freshness.everyMs = everyMs
    await new Promise((resolve) => server.close(resolve))
  }
})

// 합의한 목표(#315)다. 한 행사 9,000명, 가장 몰릴 때 1분에 200명이며, 여기서는 그
// 200명이 행사장 와이파이 하나에서 같은 브라우저로 한꺼번에 스캔한다. 프로세스
// 하나에서는 저장 사이에 다른 쓰기가 거의 끼어들지 못하므로, 저장 다섯 번에 한
// 번은 바로 앞에서 다른 복사본이 먼저 쓰게 해 충돌을 실제로 만든다.
test("the agreed peak of 200 scans from one address all count when another copy writes first", async () => {
  const { createApp } = await import("./app.js")
  const { useSql } = await import("./lib/sql.js")
  const { eventOf } = await import("./lib/measurements.js")
  const { todayInKorea } = await import("./lib/dates.js")
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const rivalEvery = 5
  let saves = 0
  let rivals = 0
  let bytes = 0
  const demoAccountIds = store.getDatabase().demoAccountIds
  const code = store.getDatabase().measurements[0].code
  const measurement = () => store.getDatabase().measurements.find((item) => item.code === code)!
  try {
    // 데모가 아닌 실제 행사처럼 한도와 기간을 그대로 적용한다.
    store.getDatabase().demoAccountIds = {} as typeof demoAccountIds
    measurement().goals.expectedAudience = 9000
    eventOf(store.getDatabase(), measurement())!.date = todayInKorea()
    await store.saveDatabase()
    useSql(async (text, params = []) => {
      if (text.startsWith("update uniconnect_store set data")) {
        bytes += String(params[0]).length
        if ((saves += 1) % rivalEvery === 0) {
          await writeAsAnotherCopy(() => {})
          rivals += 1
        }
      }
      return sql(text, params)
    })
    const before = measurement().metrics.scans
    const startedAt = Date.now()
    const answers = await Promise.all(
      Array.from({ length: 200 }, () =>
        fetch(`${base}/check-in/${code}/scans`, { method: "POST" }).then(async (response) => ({
          status: response.status,
          pass: ((await response.json()) as { pass?: string }).pass,
        })),
      ),
    )
    const succeeded = answers.filter((answer) => answer.status === 200)
    const failed = answers.length - succeeded.length
    console.log(`[qr] 200 scans, ${saves} saves, ${rivals} conflicts, ${failed} failed, ${Date.now() - startedAt}ms, ${Math.round(bytes / 1024 / 1024)}MB written`)
    // 성공이라고 답한 스캔은 빠짐없이 한 번씩만 저장된다.
    const { foldCounts } = await import("./lib/passRows.js")
    useSql(sql)
    await foldCounts({ force: true })
    await store.refreshDatabase({ force: true })
    assert.equal(measurement().metrics.scans - before, succeeded.length)
    assert.equal(new Set(succeeded.map((answer) => answer.pass)).size, succeeded.length)
    const rows = await sql("select pass from uniconnect_passes where code = $1", [code])
    const stored = new Set(rows.map((row) => String(row.pass)))
    assert.ok(succeeded.every((answer) => stored.has(answer.pass!)))
    // 스캔마다 문서를 쓰지 않는다. 합칠 때만 쓴다.
    assert.ok(saves < 20, `${saves} saves`)
    assert.deepEqual(measurement().passes, {})
    assert.equal(failed, 0)
  } finally {
    useSql(sql)
    await store.refreshDatabase({ force: true })
    store.getDatabase().demoAccountIds = demoAccountIds
    await store.saveDatabase()
    await new Promise((resolve) => server.close(resolve))
  }
})

test("a login pushed back by another copy still opens a session that's stored", async () => {
  const { createApp } = await import("./app.js")
  const { useSql } = await import("./lib/sql.js")
  const { DEMO_PASSWORD } = await import("./data/seed.js")
  const { hashToken } = await import("./middleware/session.js")
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  let rivals = 0
  try {
    await store.refreshDatabase({ force: true })
    // 로그인의 첫 저장 바로 앞에서 다른 복사본이 먼저 쓴다.
    useSql(async (text, params = []) => {
      if (text.startsWith("update uniconnect_store set data") && rivals === 0) {
        rivals += 1
        await writeAsAnotherCopy(() => {})
      }
      return sql(text, params)
    })
    const login = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "브랜드", email: "hello@afternoon-coffee.kr", password: DEMO_PASSWORD }),
    })
    assert.equal(login.status, 200)
    assert.equal(rivals, 1)
    const { token } = (await login.json()) as { token: string }
    const { sessions } = (await stored()).data as unknown as { sessions: { tokenHash: string }[] }
    assert.ok(sessions.some((session) => session.tokenHash === hashToken(token)))
  } finally {
    useSql(sql)
    await new Promise((resolve) => server.close(resolve))
  }
})

test("an hourly copy is kept for 24 hours, whatever their number, and another copy doesn't overwrite it", async () => {
  await sql("delete from uniconnect_backups")
  const hoursAgo = (hours: number) => new Date(Math.floor(Date.now() / 3_600_000 - hours) * 3_600_000).toISOString()
  for (const hours of [30, 26, 5, 2]) {
    await sql("insert into uniconnect_backups (taken_at, data) values ($1, '{}')", [hoursAgo(hours)])
  }
  store.backups.lastAt = 0
  await store.saveDatabase()
  const rows = await sql("select taken_at, data from uniconnect_backups order by taken_at")
  // 스물네 시간이 지난 것만 지운다.
  assert.equal(rows.length, 3)
  assert.equal(new Date(rows[0].taken_at as string).toISOString(), hoursAgo(5))
  const newest = String(rows.at(-1)!.data)
  assert.ok(newest.includes("accounts"))
  // 같은 시간에 다른 복사본이 찍어도 그 시간의 첫 복사본이 남는다.
  store.getDatabase().proposals["after-backup"] = ["moment-studio"]
  store.backups.lastAt = 0
  await store.saveDatabase()
  const [latest] = await sql("select data from uniconnect_backups order by taken_at desc limit 1")
  assert.equal(String(latest.data), newest)
})

test("agreement photos are rows that go with their agreement", async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3])
  await photos().put("agreement-1", "a.png", bytes)
  await photos().put("agreement-1", "b.png", bytes)
  await photos().put("agreement-2", "c.png", bytes)
  assert.deepEqual(await photos().get("agreement-1", "a.png"), bytes)
  await photos().remove("agreement-1", ["a.png"])
  assert.equal(await photos().get("agreement-1", "a.png"), undefined)
  await photos().removeAll(["agreement-1", "agreement-2"])
  const [{ count }] = await sql("select count(*)::int as count from uniconnect_photos")
  assert.equal(count, 0)
  assert.equal(existsSync(path.join(dataDir, "uploads")), false)
})

test("through the API, an agreement photo goes into the database, is served to its sides and goes on deletion", async () => {
  const { createApp } = await import("./app.js")
  const { DEMO_PASSWORD } = await import("./data/seed.js")
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const count = async () =>
    Number((await sql("select count(*)::int as count from uniconnect_photos where agreement_id = 'req-runners'"))[0].count)
  try {
    const login = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "브랜드", email: "hello@afternoon-coffee.kr", password: DEMO_PASSWORD }),
    })
    const auth = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` }
    type Item = { id: string; side: string; photos: string[] }
    const opened = (await (await fetch(`${base}/agreements/req-runners`, { headers: auth })).json()) as { agreement: { items: Item[] } }
    const item = opened.agreement.items.find((entry) => entry.side === "brand")!
    const image = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64")}`
    const added = await fetch(`${base}/agreements/req-runners/items/${item.id}/photos`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    })
    assert.equal(added.status, 201)
    const photo = ((await added.json()) as { agreement: { items: Item[] } }).agreement.items.find((entry) => entry.id === item.id)!.photos[0]
    assert.equal(await count(), 1)
    const served = await fetch(`${base}/agreements/req-runners/photos/${photo}`, { headers: auth })
    assert.equal(served.status, 200)
    assert.equal(served.headers.get("content-type"), "image/png")
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), Buffer.from(image.split(",")[1], "base64"))
    // 그것을 가리키는 데이터도 데이터베이스에 있다.
    assert.ok((await stored()).data.agreements.some((entry) => entry.items.some((each) => each.photos.includes(photo))))
    const removed = await fetch(`${base}/agreements/req-runners/items/${item.id}/photos/${photo}`, { method: "DELETE", headers: auth })
    assert.equal(removed.status, 200)
    assert.equal(await count(), 0)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

// 동시에 시작한 API 복사본이 모두 테이블을 만든다. Postgres는 지는 쪽에
// 카탈로그의 중복 키(23505)나 이미 있는 테이블(42P07)로 답하는데, 그때쯤에는
// 테이블이 이미 있다.
test("errors for the operators are rows of their own, never written beside the data", async () => {
  const { clearErrorLog, recentErrors, recordError } = await import("./lib/errorLog.js")
  await clearErrorLog()
  for (const message of ["첫 오류", "둘째 오류"]) {
    await recordError({ source: "server", message, where: "GET /api/test", path: "/api/test?token=1" })
  }
  const errors = await recentErrors()
  assert.deepEqual(errors.map((entry) => entry.message).sort(), ["둘째 오류", "첫 오류"])
  assert.ok(errors.every((entry) => entry.path === "/api/test"))
  assert.equal(existsSync(path.join(dataDir, "errors.json")), false)
})

test("a copy that loses the race to make the tables still loads the data", async () => {
  const lost = new Set<string>()
  const racing = async (text: string, params: unknown[] = []) => {
    if (text.startsWith("create table") && !lost.has(text)) {
      lost.add(text)
      throw Object.assign(new Error("another copy made the table at the same moment"), {
        code: lost.size % 2 ? "23505" : "42P07",
      })
    }
    return sql(text, params)
  }
  useSql(racing)
  try {
    assert.ok((await store.loadDatabase()).accounts.length > 0)
    // 데이터, 백업, 사진, 오류, 참여 기록 넷, 속도 제한 테이블을 각각 한 번씩 잃는다.
    assert.equal(lost.size, 9)
  } finally {
    useSql(sql)
  }
})

test("any other error while making the tables still fails the load", async () => {
  const denied = async (text: string, params: unknown[] = []) => {
    if (text.startsWith("create table")) {
      throw Object.assign(new Error("permission denied for schema public"), { code: "42501" })
    }
    return sql(text, params)
  }
  useSql(denied)
  try {
    await assert.rejects(store.loadDatabase(), { code: "42501" })
  } finally {
    useSql(sql)
  }
})

test("copies of the API share rate limits through the database, and memory counts when it doesn't answer", async () => {
  const { createRateLimit, sharedLimits } = await import("./lib/rateLimit.js")
  // API의 두 복사본이 각자 모듈을 불러오므로 같은 제한을 각자 만든다.
  const settings = { limit: 3, windowMs: 60_000, message: "너무 많이 보냈어요." }
  const first = createRateLimit(settings)
  const second = createRateLimit(settings)
  await first.take("1.2.3.4")
  await second.take("1.2.3.4")
  await first.take("1.2.3.4")
  await assert.rejects(second.take("1.2.3.4"), { status: 429 })
  await assert.rejects(first.check("1.2.3.4"), { status: 429 })
  // 다른 키와 다른 제한은 따로 센다.
  await second.take("5.6.7.8")
  await createRateLimit({ ...settings, message: "다른 한도예요." }).take("1.2.3.4")
  // 키는 해시로만 보관하며 주소나 이메일은 두지 않는다.
  const rows = await sql("select key from uniconnect_limits")
  assert.ok(rows.length >= 3)
  assert.ok(rows.every((row) => /^[0-9a-f]{64}$/.test(String(row.key))))
  // 어느 복사본에서 초기화하든 둘 다 초기화된다.
  await first.reset("1.2.3.4")
  await second.check("1.2.3.4")

  // 응답하지 않는 데이터베이스는 세기를 메모리에 맡기고 요청은 계속 처리한다.
  const saved = sharedLimits.waitMs
  sharedLimits.waitMs = 50
  useSql(() => new Promise(() => undefined))
  try {
    const started = Date.now()
    const stalled = createRateLimit({ ...settings, limit: 1 })
    await stalled.take("9.9.9.9")
    await assert.rejects(stalled.take("9.9.9.9"), { status: 429 })
    assert.ok(Date.now() - started < 1000)
    useSql(async () => {
      throw new Error("connection refused")
    })
    await createRateLimit(settings).take("9.9.9.9")
  } finally {
    sharedLimits.waitMs = saved
    useSql(sql)
  }
})

test("rows keep participation out of the document, and counts reach it exactly once", async () => {
  const { createApp } = await import("./app.js")
  const passRows = await import("./lib/passRows.js")
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const send = async (route: string, body?: unknown) => {
    const response = await fetch(base + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
    return { status: response.status, data: (await response.json()) as Record<string, never> }
  }
  try {
    const database = store.getDatabase()
    const demo = new Set(Object.values(database.demoAccountIds))
    const measurement = () =>
      store.getDatabase().measurements.find((item) => demo.has(item.accountId) && item.sponsors.length === 0) ??
      store.getDatabase().measurements.find((item) => demo.has(item.accountId))!
    const code = measurement().code
    const sponsored = measurement().sponsors.length > 0
    const start = structuredClone(measurement().metrics)
    const responses = measurement().survey?.responses ?? 0
    const passCount = async () => (await sql("select pass from uniconnect_passes where code = $1", [code])).length
    const passesBefore = await passCount()

    // 문서에 남은 기록(이전 버전)은 행으로 옮겨지고 번호와 방문, 설문이 그대로다.
    measurement().passes = {
      moved: { coupon: "UC-MOVEDA", visit: true, surveyed: true },
      old: { coupon: true },
      plain: {},
    }
    await store.saveDatabase()
    await passRows.movePassesToRows()
    assert.deepEqual(measurement().passes, {})
    const moved = await passRows.readPass(sql, code, "moved")
    assert.deepEqual(moved, {
      surveyed: true,
      coupons: [{ couponId: "event", number: "UC-MOVEDA", visited: true, issuedAt: moved!.coupons[0].issuedAt }],
    })
    // 다시 옮겨도 그대로다.
    measurement().passes = { plain: {} }
    await store.saveDatabase()
    await passRows.movePassesToRows()
    assert.equal(await passCount(), passesBefore + 3)

    const version = (await stored()).version
    const scan = await send(`/check-in/${code}/scans`)
    assert.equal(scan.status, 200)
    const pass = scan.data.pass as string
    assert.equal(scan.data.entry["participant"], `참여자 #${passesBefore + 4}`)
    const offered = (await fetch(`${base}/check-in/${code}`).then((item) => item.json())) as { coupons: { id: string }[] }
    const couponId = offered.coupons[0].id
    const coupon = await send(`/check-in/${code}/coupons`, { pass, couponId })
    assert.equal(coupon.status, 200)
    assert.match(coupon.data.coupon, /^UC-/)
    // 같은 쿠폰은 한 번이고, 없는 패스는 받지 못한다.
    assert.equal((await send(`/check-in/${code}/coupons`, { pass, couponId })).status, 409)
    assert.equal((await send(`/check-in/${code}/coupons`, { pass: "none", couponId })).status, 403)
    const state = (await fetch(`${base}/check-in/${code}/passes/${pass}`).then((item) => item.json())) as {
      coupons: Record<string, { number: string | null; visited: boolean }>
    }
    assert.deepEqual(state.coupons[couponId], { number: coupon.data.coupon, visited: false })
    assert.equal((await fetch(`${base}/check-in/${code}/passes/none`)).status, 404)
    // 설문도 패스마다 한 번이다.
    assert.equal((await send(`/check-in/${code}/survey`, { pass, grade: "1학년" })).status, 201)
    assert.equal((await send(`/check-in/${code}/survey`, { pass, grade: "1학년" })).status, 409)
    assert.equal((await send(`/check-in/${code}/survey`, { pass: "none", grade: "1학년" })).status, 403)

    // 여기까지 문서는 그대로다.
    assert.equal((await stored()).version, version)

    // 방문은 한 번이고, 다른 쿠폰으로는 확인하지 못한다.
    const sponsorId = sponsored ? couponId : undefined
    const number = coupon.data.coupon as string
    assert.equal((await passRows.markVisit(sql, code, number, "other", undefined)).marked, false)
    assert.equal((await passRows.markVisit(sql, code, number, couponId, sponsorId)).marked, true)
    assert.equal((await passRows.markVisit(sql, code, number, couponId, sponsorId)).marked, false)

    // 합치면 집계가 한 번씩만 오른다.
    await passRows.foldCounts({ force: true })
    const after = measurement()
    assert.equal(after.metrics.scans, start.scans + 1)
    assert.equal(after.metrics.coupons, start.coupons + 1)
    assert.equal(after.metrics.visits, start.visits + 1)
    assert.equal(after.survey?.responses, responses + 1)
    assert.equal((await sql("select id from uniconnect_counts")).length, 0)

    // 저장한 뒤 지우기 전에 멈춰도 다시 세지 않는다.
    await sql("insert into uniconnect_counts (code, kind) values ($1, 'scans')", [code])
    const [row] = await sql("select id::text as id from uniconnect_counts")
    store.getDatabase().foldedCounts = [String(row.id)]
    await store.saveDatabase()
    assert.equal(await passRows.foldCounts({ force: true }), 0)
    assert.equal(measurement().metrics.scans, start.scans + 1)
    assert.equal((await sql("select id from uniconnect_counts")).length, 0)

    // 협찬사가 들어오면 행사의 쿠폰이 그 협찬사의 것이 된다.
    await sql("insert into uniconnect_coupons (code, number, pass, coupon_id) values ($1, 'UC-TAKENA', 'plain', 'event')", [code])
    measurement().eventCouponsTo = "sponsor-a"
    await store.saveDatabase()
    await passRows.foldCounts({ force: true })
    assert.equal(measurement().eventCouponsTo, undefined)
    const taken = (await passRows.readPass(sql, code, "plain"))?.coupons
    assert.deepEqual(taken?.map(({ couponId, number, visited }) => ({ couponId, number, visited })), [{ couponId: "sponsor-a", number: "UC-TAKENA", visited: false }])

    // 행사가 없어진 측정의 행은 지워진다.
    await sql("insert into uniconnect_passes (code, pass) values ('gone', 'a')")
    await sql("insert into uniconnect_coupons (code, number, pass, coupon_id) values ('gone', 'UC-GONEAA', 'a', 'event')")
    assert.ok((await passRows.prunePassRows()) >= 1)
    assert.equal((await sql("select pass from uniconnect_passes where code = 'gone'")).length, 0)
    assert.equal((await sql("select number from uniconnect_coupons where code = 'gone'")).length, 0)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test("an always-on campaign keeps each coupon for 7 days in rows", async () => {
  const { createApp } = await import("./app.js")
  const passRows = await import("./lib/passRows.js")
  const { openCampaign } = await import("./lib/local.js")
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const send = async (route: string, body?: unknown) => {
    const response = await fetch(base + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
    return { status: response.status, data: (await response.json()) as Record<string, never> }
  }
  try {
    const database = store.getDatabase()
    const demo = new Set(Object.values(database.demoAccountIds))
    const demoBrand = database.accounts.find((item) => item.role === "브랜드" && demo.has(item.id))!
    const brand = { ...demoBrand, id: "local-rows-brand" }
    database.accounts.push(brand)
    const measurement = openCampaign(database, brand, { store: "행 카페", title: "아메리카노 1잔" })
    ;(database.payments ??= []).push({
      id: "local-rows",
      accountId: brand.id,
      accountName: brand.name,
      kind: "local",
      targetId: "",
      orderName: "Campus Local 30일",
      amount: 79_000,
      status: "paid",
      requestedAt: new Date().toISOString(),
      periodEnd: addDays(todayInKorea(), 29),
    } as NonNullable<typeof database.payments>[number])
    await store.saveDatabase()
    const code = measurement.code

    const take = async () => {
      const scan = await send(`/check-in/${code}/scans`)
      assert.equal(scan.status, 200, JSON.stringify(scan.data))
      const coupon = await send(`/check-in/${code}/coupons`, { pass: scan.data.pass })
      assert.equal(coupon.status, 200, JSON.stringify(coupon.data))
      return { pass: scan.data.pass as string, number: coupon.data.coupon as string }
    }
    const fresh = await take()
    const stale = await take()
    await sql("update uniconnect_coupons set issued_at = now() - interval '8 days' where number = $1", [stale.number])
    await sql("update uniconnect_passes set issued_at = now() - interval '8 days' where pass = $1", [stale.pass])
    // 쿠폰 없이 스캔만 한 사람도 7일 뒤에 지워진다.
    const scanOnly = (await send(`/check-in/${code}/scans`)).data.pass as string
    await sql("update uniconnect_passes set issued_at = now() - interval '8 days' where pass = $1", [scanOnly])

    const state = (await fetch(`${base}/check-in/${code}/passes/${fresh.pass}`).then((item) => item.json())) as {
      coupons: Record<string, { expiresAt?: string }>
    }
    assert.ok(Date.parse(state.coupons.event.expiresAt!) > Date.now() + 6 * 24 * 60 * 60 * 1000)

    // 기한이 지난 쿠폰은 확인되지 않고, 이유를 알려 준다. 안 지난 쿠폰은 된다.
    const pin = measurement.staffPin
    const late = await send(`/check-in/${code}/staff/visits`, { pin, coupon: stale.number })
    assert.deepEqual([late.status, late.data.error], [409, "쿠폰 사용 기간이 지났어요."])
    assert.equal((await send(`/check-in/${code}/staff/visits`, { pin, coupon: fresh.number })).status, 200)
    const twice = await send(`/check-in/${code}/staff/visits`, { pin, coupon: fresh.number })
    assert.deepEqual([twice.status, twice.data.error], [409, "이미 방문이 확인된 쿠폰이에요."])

    // 집계는 달로 묶이고 시간별, 날짜별 칸은 생기지 않는다.
    await passRows.foldCounts({ force: true })
    const after = store.getDatabase().measurements.find((item) => item.code === code)!
    const month = todayInKorea().slice(0, 7)
    assert.deepEqual(after.monthly?.[month], { scans: 3, coupons: 2, visits: 1 })
    assert.deepEqual(after.hourlyScans, [])
    assert.equal(after.daily, undefined)

    // 7일 지난 것만 지운다. 기간이 끝나지 않아도 지우고, 지운 뒤 집계는 그대로다.
    await passRows.prunePassRows()
    const left = await sql("select pass from uniconnect_passes where code = $1", [code])
    assert.deepEqual(left.map((row) => row.pass), [fresh.pass])
    const coupons = await sql("select number from uniconnect_coupons where code = $1", [code])
    assert.deepEqual(coupons.map((row) => row.number), [fresh.number])
    assert.equal(after.metrics.scans, 3)
    const gone = await send(`/check-in/${code}/staff/visits`, { pin, coupon: stale.number })
    assert.equal(gone.status, 404)

    // 다음 시험에 남기지 않는다.
    delete store.getDatabase().localCampaigns?.[brand.id]
    store.getDatabase().measurements = store.getDatabase().measurements.filter((item) => item.code !== code)
    store.getDatabase().payments = store.getDatabase().payments?.filter((item) => item.id !== "local-rows")
    store.getDatabase().accounts = store.getDatabase().accounts.filter((item) => item.id !== brand.id)
    await store.saveDatabase()
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test("a 2FA code pushed back by another copy still logs in, and the used code doesn't work twice", async () => {
  const { createApp } = await import("./app.js")
  const { useSql } = await import("./lib/sql.js")
  const { DEMO_PASSWORD } = await import("./data/seed.js")
  const { codeAt, newSecret, stepAt } = await import("./lib/totp.js")
  const server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const post = (route: string, body: unknown) =>
    fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const email = "hello@afternoon-coffee.kr"
  const secret = newSecret()
  let rivals = 0
  try {
    await store.refreshDatabase({ force: true })
    const account = store.getDatabase().accounts.find((item) => item.email === email)!
    account.twoFactor = { secret, enabledAt: new Date().toISOString(), recoveryHashes: [] }
    await store.saveDatabase()
    const { ticket } = (await (await post("/auth/login", { role: "브랜드", email, password: DEMO_PASSWORD })).json()) as { ticket: string }
    assert.ok(ticket)
    const code = codeAt(secret, stepAt(Date.now()))
    await store.refreshDatabase({ force: true })
    useSql(async (text, params = []) => {
      if (text.startsWith("update uniconnect_store set data") && rivals === 0) {
        rivals += 1
        await writeAsAnotherCopy(() => {})
      }
      return sql(text, params)
    })
    const opened = await post("/auth/login/code", { email, ticket, code })
    assert.equal(opened.status, 200, await opened.clone().text())
    assert.equal(rivals, 1)
    const again = await post("/auth/login", { role: "브랜드", email, password: DEMO_PASSWORD })
    const next = (await again.json()) as { ticket: string }
    assert.equal((await post("/auth/login/code", { email, ticket: next.ticket, code })).status, 401)
  } finally {
    useSql(sql)
    await store.refreshDatabase({ force: true })
    delete store.getDatabase().accounts.find((item) => item.email === email)!.twoFactor
    delete store.getDatabase().accounts.find((item) => item.email === email)!.loginTicket
    await store.saveDatabase()
    await new Promise((resolve) => server.close(resolve))
  }
})
