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

  const created = await call(
    "POST",
    "/events",
    { name: "겨울 캠퍼스 팝업", date: "2026-12-05", people: "500명", types: ["제품", "기타"] },
    token,
  )
  assert.equal(created.status, 201)
  assert.deepEqual(created.data.event.types, ["제품"])

  const listed = await call("GET", "/events", undefined, token)
  assert.equal(listed.data.events[0].name, "겨울 캠퍼스 팝업")
  assert.equal((await call("DELETE", `/events/${created.data.event.id}`, undefined, token)).status, 204)

  const proposed = await call("POST", "/proposals", { matchId: "syu-muse" }, token)
  assert.deepEqual(proposed.data.proposals, ["syu-muse"])
  assert.equal((await call("POST", "/proposals", { matchId: "freshon" }, token)).status, 404)
  const cancelled = await call("DELETE", "/proposals/syu-muse", undefined, token)
  assert.deepEqual(cancelled.data.proposals, [])
})

test("metrics count QR scans, coupons and visits", async () => {
  const initial = (await call("GET", "/metrics")).data.metrics
  const updated = (await call("POST", "/metrics/scans")).data.metrics
  assert.equal(updated.scans, initial.scans + 1)
  assert.equal((await call("POST", "/metrics/likes")).status, 404)
})
