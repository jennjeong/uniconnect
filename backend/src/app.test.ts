import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

// Each run starts from a fresh seed in a temp file, never the real data/db.json.
const dataDir = await mkdtemp(path.join(tmpdir(), "uniconnect-api-"))
process.env.DATA_FILE = path.join(dataDir, "db.json")
process.env.EXPOSE_EMAIL_CODES = "true"

const { createApp } = await import("./app.js")
const { loadDatabase } = await import("./store.js")
const { DEMO_PASSWORD } = await import("./data/seed.js")

let server: Server
let baseUrl = ""

before(async () => {
  await loadDatabase()
  server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
})

async function call(method: string, route: string, body?: unknown, token?: string) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, data: text ? JSON.parse(text) : null }
}

test("health check and unknown routes", async () => {
  assert.deepEqual((await call("GET", "/health")).data, { ok: true })
  assert.equal((await call("GET", "/nope")).status, 404)
})

test("visitors get matches and demo events for the role they preview", async () => {
  const brands = await call("GET", "/matches?role=학생단체")
  assert.equal(brands.data.matches[0].name, "오후의 커피")
  const groups = await call("GET", "/matches?role=브랜드")
  assert.equal(groups.data.matches[0].name, "삼육대 뮤즈")
  const events = await call("GET", "/events?role=학생단체")
  assert.equal(events.data.events.length, 2)
  assert.equal((await call("GET", "/matches")).status, 400)
})

test("login checks the password and the picked role", async () => {
  const wrongPassword = await call("POST", "/auth/login", {
    role: "학생단체",
    email: "muse@syu.ac.kr",
    password: "wrong-password",
  })
  assert.equal(wrongPassword.status, 401)

  const wrongRole = await call("POST", "/auth/login", {
    role: "브랜드",
    email: "muse@syu.ac.kr",
    password: DEMO_PASSWORD,
  })
  assert.equal(wrongRole.status, 403)

  const login = await call("POST", "/auth/login", {
    role: "학생단체",
    email: "MUSE@syu.ac.kr",
    password: DEMO_PASSWORD,
  })
  assert.equal(login.status, 200)
  assert.equal(login.data.account.name, "삼육대 뮤즈")
  assert.equal(login.data.account.passwordHash, undefined)

  const me = await call("GET", "/auth/me", undefined, login.data.token)
  assert.equal(me.data.account.email, "muse@syu.ac.kr")

  assert.equal((await call("POST", "/auth/logout", undefined, login.data.token)).status, 204)
  assert.equal((await call("GET", "/auth/me", undefined, login.data.token)).status, 401)
})

test("sign-up requires a verified school or company email", async () => {
  const personal = await call("POST", "/auth/email-code", {
    role: "학생단체",
    email: "club@gmail.com",
  })
  assert.equal(personal.status, 400)

  const schoolForSponsor = await call("POST", "/auth/email-code", {
    role: "브랜드",
    email: "team@syu.ac.kr",
  })
  assert.equal(schoolForSponsor.status, 400)

  const taken = await call("POST", "/auth/email-code", {
    role: "학생단체",
    email: "muse@syu.ac.kr",
  })
  assert.equal(taken.status, 409)

  const form = {
    role: "학생단체",
    name: "테스트 동아리",
    type: "공연 동아리",
    school: "삼육대학교",
    email: "club@syu.ac.kr",
    password: "club-pass-123",
    agreedToTerms: true,
  }
  const unverified = await call("POST", "/auth/signup", { ...form, verificationToken: "x" })
  assert.equal(unverified.status, 400)

  const sent = await call("POST", "/auth/email-code", { role: "학생단체", email: form.email })
  assert.equal(sent.status, 200)
  assert.match(sent.data.devCode, /^\d{6}$/)

  const wrongCode = await call("POST", "/auth/email-code/verify", {
    email: form.email,
    code: sent.data.devCode === "000000" ? "111111" : "000000",
  })
  assert.equal(wrongCode.status, 400)

  const verified = await call("POST", "/auth/email-code/verify", {
    email: form.email,
    code: sent.data.devCode,
  })
  assert.equal(verified.status, 200)

  const signup = await call("POST", "/auth/signup", {
    ...form,
    verificationToken: verified.data.verificationToken,
  })
  assert.equal(signup.status, 201)
  assert.equal(signup.data.account.school, "삼육대학교")

  const again = await call("POST", "/auth/login", {
    role: "학생단체",
    email: form.email,
    password: form.password,
  })
  assert.equal(again.status, 200)
})

test("events and proposals belong to the logged-in account", async () => {
  assert.equal((await call("POST", "/events", { name: "x", date: "y" })).status, 401)

  const { data } = await call("POST", "/auth/login", {
    role: "브랜드",
    email: "hello@afternoon-coffee.kr",
    password: DEMO_PASSWORD,
  })
  const token = data.token as string

  const badDate = await call("POST", "/events", { name: "팝업", date: "다음 주 금요일" }, token)
  assert.equal(badDate.status, 400)

  const noTypes = await call("POST", "/events", { name: "팝업", date: "2026-12-05" }, token)
  assert.equal(noTypes.status, 400)
  const otherWithoutNote = await call(
    "POST",
    "/events",
    { name: "팝업", date: "2026-12-05", types: ["기타"] },
    token,
  )
  assert.equal(otherWithoutNote.status, 400)

  const withNote = await call(
    "POST",
    "/events",
    { name: "팝업", date: "2026-12-06", types: ["기타"], typeNote: "공연장 대관" },
    token,
  )
  assert.equal(withNote.status, 201)
  assert.equal(withNote.data.event.typeNote, "공연장 대관")
  await call("DELETE", `/events/${withNote.data.event.id}`, undefined, token)

  const created = await call(
    "POST",
    "/events",
    {
      name: "겨울 캠퍼스 팝업",
      date: "2026. 12. 5.",
      people: "500명",
      types: ["제품", "모름"],
      typeNote: "쓰이지 않는 메모",
    },
    token,
  )
  assert.equal(created.status, 201)
  assert.equal(created.data.event.date, "2026-12-05")
  assert.deepEqual(created.data.event.types, ["제품"])
  assert.equal(created.data.event.typeNote, undefined)

  const listed = await call("GET", "/events", undefined, token)
  assert.equal(listed.data.events[0].name, "겨울 캠퍼스 팝업")
  assert.equal((await call("DELETE", `/events/${created.data.event.id}`, undefined, token)).status, 204)

  const proposed = await call("POST", "/proposals", { matchId: "syu-muse" }, token)
  assert.deepEqual(proposed.data.proposals, ["syu-muse"])
  assert.equal((await call("POST", "/proposals", { matchId: "freshon" }, token)).status, 404)
  const cancelled = await call("DELETE", "/proposals/syu-muse", undefined, token)
  assert.deepEqual(cancelled.data.proposals, [])
})

test("metrics count QR scans, coupons and visits with a history", async () => {
  const initial = (await call("GET", "/metrics")).data.metrics
  const recorded = (await call("POST", "/metrics/scans")).data
  assert.equal(recorded.metrics.scans, initial.scans + 1)
  assert.equal(recorded.entry.participant, `참여자 #${initial.scans + 1}`)

  const scans = (await call("GET", "/metrics/log?kind=scans")).data.entries
  assert.equal(scans[0].id, recorded.entry.id)
  assert.ok(scans.every((entry: { kind: string }) => entry.kind === "scans"))
  assert.ok((await call("GET", "/metrics/log")).data.entries.length > scans.length)

  assert.equal((await call("POST", "/metrics/likes")).status, 404)
  assert.equal((await call("GET", "/metrics/log?kind=likes")).status, 404)
})

test("student groups browse the brand catalog and propose to any brand", async () => {
  const { brands } = (await call("GET", "/brands")).data
  assert.equal(brands.length, 12)
  assert.ok(brands.every((brand: { popularity?: number }) => typeof brand.popularity === "number"))
  assert.deepEqual(
    brands.slice(0, 3).map((brand: { id: string }) => brand.id),
    (await call("GET", "/matches?role=학생단체")).data.matches.map((match: { id: string }) => match.id),
  )

  const { data } = await call("POST", "/auth/login", {
    role: "학생단체",
    email: "muse@syu.ac.kr",
    password: DEMO_PASSWORD,
  })
  const proposed = await call("POST", "/proposals", { matchId: "glowlab" }, data.token)
  assert.equal(proposed.status, 201)
  assert.ok(proposed.data.proposals.includes("glowlab"))
})

test("the report has the event's goals", async () => {
  const { report } = (await call("GET", "/report")).data
  assert.equal(report.eventName, "가을 버스킹 데이")
  assert.equal(report.targets.roas, 170)
  assert.equal(
    report.valueBreakdown.reduce((sum: number, part: { value: number }) => sum + part.value, 0),
    report.sponsorValue,
  )
})

test("older data files gain the new collections and calendar dates", async () => {
  const { upgradeDatabase } = await import("./store.js")
  const old = {
    events: { someone: [{ date: "2026. 11. 27." }, { date: "미정" }] },
  } as unknown as Parameters<typeof upgradeDatabase>[0]
  const upgraded = upgradeDatabase(old)
  assert.equal(upgraded.brands.length, 12)
  assert.ok(upgraded.metricLog.length > 0)
  assert.equal(upgraded.report.targets.reach, 1100)
  assert.deepEqual(
    upgraded.events.someone.map((event) => event.date),
    ["2026-11-27", "미정"],
  )
})
