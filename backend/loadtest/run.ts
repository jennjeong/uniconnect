// 참여 기록을 문서 하나에 두는 구조가 실제 Neon에서 버티는지 잰다(docs/ARCHITECTURE.md).
// API 복사본 여러 개를 프로세스로 띄워 QR 스캔을 정해진 속도로 보낸다.
//
//   npx tsx backend/loadtest/run.ts <연결 문자열이 든 파일>
//
// 연결 문자열은 출력하지 않는다. 데이터를 덮어쓰므로 빈 측정용 브랜치에서만 돈다.
// uniconnect_store에 행이 있는데 이 스크립트가 남긴 표시가 없으면 멈춘다.
import { fork, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { neon } from "@neondatabase/serverless"

type Scenario = { name: string; passes: number; copies: number; perMinute?: number; burst?: number; seconds?: number }

const scenarios: Scenario[] = [
  { name: "no passes yet, 1 copy", passes: 0, copies: 1, perMinute: 200 },
  { name: "9,000 passes, 1 copy", passes: 9_000, copies: 1, perMinute: 200 },
  { name: "9,000 passes, 4 copies", passes: 9_000, copies: 4, perMinute: 200 },
  { name: "9,000 passes, 8 copies", passes: 9_000, copies: 8, perMinute: 200 },
  { name: "9,000 passes, 4 copies, 500/min", passes: 9_000, copies: 4, perMinute: 500 },
  { name: "9,000 passes, 4 copies, 200 at once", passes: 9_000, copies: 4, burst: 200 },
  // 상한(passLimit 20,000)을 채우면 전부 409라, 상한 바로 아래에서 잰다.
  { name: "19,000 passes, 4 copies", passes: 19_000, copies: 4, perMinute: 200 },
]

type Usage = { queries: number; sentBytes: number; receivedBytes: number; firstLoadMs: number }

// ---- 복사본 하나: 실제 앱을 띄우고 SQL 사용량을 센다.
async function copy() {
  const { useSql, neonSql } = await import("../src/lib/sql.js")
  const usage: Usage = { queries: 0, sentBytes: 0, receivedBytes: 0, firstLoadMs: 0 }
  const real = neonSql(process.env.DATABASE_URL!)
  useSql(async (text, params = []) => {
    usage.queries += 1
    usage.sentBytes += text.length + params.reduce<number>((sum, item) => sum + String(item).length, 0)
    const rows = await real(text, params)
    usage.receivedBytes += JSON.stringify(rows).length
    return rows
  })
  const { createApp } = await import("../src/app.js")
  const { loadDatabase } = await import("../src/store.js")
  const started = Date.now()
  await loadDatabase()
  usage.firstLoadMs = Date.now() - started
  const server = createApp().listen(0, "127.0.0.1", () => {
    process.send!({ port: (server.address() as { port: number }).port })
  })
  process.on("message", () => {
    process.send!({ usage })
    server.close()
    process.exit(0)
  })
}

// ---- 측정
const percentile = (sorted: number[], at: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))] ?? 0

async function measure() {
  const file = process.argv[2]
  if (!file) throw new Error("Pass the file that holds the connection string.")
  const url = readFileSync(file, "utf8").trim()
  const sql = neon(url)
  await sql.query("select 1")
  const [{ exists }] = (await sql.query("select to_regclass('uniconnect_store') is not null as exists")) as { exists: boolean }[]
  const rows = exists ? ((await sql.query("select count(*)::int as count from uniconnect_store")) as { count: number }[])[0].count : 0
  const [{ marked }] = (await sql.query("select to_regclass('uniconnect_loadtest_marker') is not null as marked")) as { marked: boolean }[]
  if (rows > 0 && !marked) throw new Error("This database already holds data and is not a load test branch. Stopping.")
  await sql.query("create table if not exists uniconnect_loadtest_marker (at timestamptz default now())")

  const env = {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: "development",
    EXPOSE_EMAIL_CODES: "false",
    RESEND_API_KEY: "",
    LOADTEST_COPY: "1",
  }
  const start = async (count: number) => {
    const children: { child: ChildProcess; port: number }[] = []
    // 첫 복사본이 시드하게 하나씩 띄운다.
    for (let index = 0; index < count; index += 1) {
      const child = fork(fileURLToPath(import.meta.url), [], { env, execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"] })
      const port = await new Promise<number>((resolve, reject) => {
        child.once("message", (message: { port: number }) => resolve(message.port))
        child.once("exit", (code) => reject(new Error(`A copy stopped with ${code}.`)))
      })
      children.push({ child, port })
    }
    return children
  }
  const stop = async (children: { child: ChildProcess }[]) => {
    const usage = await Promise.all(
      children.map(({ child }) =>
        new Promise<Usage>((resolve) => {
          child.removeAllListeners("exit")
          child.once("message", (message: { usage: Usage }) => resolve(message.usage))
          child.send("stop")
        }),
      ),
    )
    return usage
  }

  // 시드를 만들고 측정할 행사(시드의 데모 행사라 기간과 한도 검사를 건너뛴다)를 고른다.
  await stop(await start(1))

  const prepare = async (passes: number) => {
    const [row] = (await sql.query("select data, version from uniconnect_store where id = 1")) as { data: string; version: number }[]
    const database = JSON.parse(row.data)
    const demo = new Set(Object.values(database.demoAccountIds))
    const measurement = database.measurements.find((item: { accountId: string }) => demo.has(item.accountId))
    measurement.passes = {}
    const code = measurement.code as string
    await sql.query("create table if not exists uniconnect_counts (id bigserial primary key, code text not null, kind text not null, sponsor_id text, answers text, at timestamptz not null default now())")
    await sql.query("delete from uniconnect_counts")
    await sql.query("delete from uniconnect_coupons where code = $1", [code])
    await sql.query("delete from uniconnect_passes where code = $1", [code])
    // 쿠폰을 받은 사람이 60%인 실제에 가까운 모양이다.
    for (let start = 0; start < passes; start += 2000) {
      const rows = Array.from({ length: Math.min(2000, passes - start) }, (_, index) => ({
        pass: randomBytes(16).toString("hex"),
        number: (start + index) % 5 < 3 ? `UC-${randomBytes(4).toString("hex").toUpperCase()}` : null,
      }))
      await sql.query("insert into uniconnect_passes (code, pass) select $1, pass from jsonb_to_recordset($2::jsonb) as item(pass text)", [code, JSON.stringify(rows)])
      await sql.query(
        "insert into uniconnect_coupons (code, number, pass, coupon_id) select $1, number, pass, 'event' from jsonb_to_recordset($2::jsonb) as item(number text, pass text) where number is not null on conflict do nothing",
        [code, JSON.stringify(rows)],
      )
    }
    const data = JSON.stringify(database)
    await sql.query("update uniconnect_store set data = $1, version = version + 1 where id = 1", [data])
    return { code: measurement.code as string, bytes: Buffer.byteLength(data), version: Number(row.version) + 1 }
  }

  const results = []
  for (const scenario of scenarios) {
    const { code, bytes, version } = await prepare(scenario.passes)
    const children = await start(scenario.copies)
    const latencies: number[] = []
    const statuses: Record<string, number> = {}
    let next = 0
    const scan = async () => {
      const { port } = children[next++ % children.length]
      const started = Date.now()
      let status = "failed"
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/check-in/${code}/scans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(60_000),
        })
        status = String(response.status)
        await response.arrayBuffer()
      } catch {
        // 아래 집계에 "failed"로 남는다.
      }
      statuses[status] = (statuses[status] ?? 0) + 1
      latencies.push(Date.now() - started)
    }
    const started = Date.now()
    const sends: Promise<void>[] = []
    if (scenario.burst) {
      for (let index = 0; index < scenario.burst; index += 1) sends.push(scan())
    } else {
      const total = Math.round((scenario.perMinute! * (scenario.seconds ?? 60)) / 60)
      const gap = 60_000 / scenario.perMinute!
      for (let index = 0; index < total; index += 1) {
        sends.push(scan())
        await new Promise((resolve) => setTimeout(resolve, gap))
      }
    }
    await Promise.all(sends)
    const elapsedMs = Date.now() - started
    const usage = await stop(children)
    const [after] = (await sql.query("select version from uniconnect_store where id = 1")) as { version: number }[]
    const [rowCount] = (await sql.query("select count(*)::int as count from uniconnect_passes where code = $1", [code])) as { count: number }[]
    const [waiting] = (await sql.query("select count(*)::int as count from uniconnect_counts")) as { count: number }[]
    latencies.sort((a, b) => a - b)
    const result = {
      scenario: scenario.name,
      docMB: +(bytes / 1_000_000).toFixed(2),
      requests: latencies.length,
      statuses,
      documentWrites: Number(after.version) - version,
      passesAdded: rowCount.count - scenario.passes,
      countsWaiting: waiting.count,
      p50ms: percentile(latencies, 0.5),
      p95ms: percentile(latencies, 0.95),
      p99ms: percentile(latencies, 0.99),
      maxMs: latencies.at(-1) ?? 0,
      elapsedS: +(elapsedMs / 1000).toFixed(1),
      firstLoadMs: Math.max(...usage.map((item) => item.firstLoadMs)),
      queries: usage.reduce((sum, item) => sum + item.queries, 0),
      sentMB: +(usage.reduce((sum, item) => sum + item.sentBytes, 0) / 1_000_000).toFixed(1),
      receivedMB: +(usage.reduce((sum, item) => sum + item.receivedBytes, 0) / 1_000_000).toFixed(1),
    }
    results.push(result)
    console.log(JSON.stringify(result))
  }
}

if (process.env.LOADTEST_COPY) await copy()
else await measure()
