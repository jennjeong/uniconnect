import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, beforeEach, test } from "node:test"

// Each run starts from a fresh seed in a temp file, never the real data/db.json.
const dataDir = await mkdtemp(path.join(tmpdir(), "uniconnect-api-"))
process.env.DATA_FILE = path.join(dataDir, "db.json")
// A stand-in built frontend, so the server serves pages as in production.
process.env.FRONTEND_DIST = path.join(dataDir, "dist")
await mkdir(process.env.FRONTEND_DIST)
await writeFile(path.join(process.env.FRONTEND_DIST, "index.html"), "<!doctype html><title>uniconnect</title>")
process.env.EXPOSE_EMAIL_CODES = "true"
process.env.ADMIN_TOKEN = "test-admin-token"

const { createApp } = await import("./app.js")
const { config, emailCodesExposed } = await import("./config.js")
const { clearRateLimits } = await import("./lib/rateLimit.js")
const { getDatabase, loadDatabase, saveDatabase } = await import("./store.js")
const { DEMO_PASSWORD } = await import("./data/seed.js")

let server: Server
let baseUrl = ""

before(async () => {
  await loadDatabase()
  server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

// Every request comes from 127.0.0.1, so each case starts with fresh limits.
beforeEach(() => clearRateLimits())

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
})

async function login(role: "학생단체" | "브랜드") {
  const email = role === "학생단체" ? "muse@syu.ac.kr" : "hello@afternoon-coffee.kr"
  const { data } = await call("POST", "/auth/login", { role, email, password: DEMO_PASSWORD })
  return data.token as string
}

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

test("pages load for every screen's address, and others answer 404", async () => {
  const page = async (route: string) => {
    const response = await fetch(baseUrl.replace(/\/api$/, "") + route)
    return { status: response.status, html: (await response.text()).includes("<title>uniconnect") }
  }
  const screens = [
    "/",
    "/matches",
    "/matches/cafe-1",
    "/offers",
    "/campaigns",
    "/new?date=2026-12-01",
    "/me/edit",
    "/messages/abc",
    "/check-in/20261012",
    "/check-in/20261012/staff",
    "/terms",
    "/privacy",
    "/admin",
  ]
  for (const route of screens) {
    assert.deepEqual(await page(route), { status: 200, html: true }, route)
  }
  for (const route of ["/nope", "/events/x", "/matches/a/b", "/me/other"]) {
    assert.deepEqual(await page(route), { status: 404, html: true }, route)
  }
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
    over14: true,
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
  // Brands propose to any group in the catalog, never to another brand.
  assert.equal((await call("POST", "/proposals", { matchId: "kw-code" }, token)).status, 201)
  await call("DELETE", "/proposals/kw-code", undefined, token)
  assert.equal((await call("POST", "/proposals", { matchId: "freshon" }, token)).status, 404)
  const cancelled = await call("DELETE", "/proposals/syu-muse", undefined, token)
  assert.deepEqual(cancelled.data.proposals, [])
})

test("each event counts its own QR scans, coupons and visits", async () => {
  const busking = "/measurements/event-busking-day"
  const initial = (await call("GET", busking)).data.metrics
  const page = (await call("GET", "/check-in/20261012")).data
  assert.equal(page.eventName, "가을 버스킹 데이")
  assert.equal(page.groupName, "삼육대 뮤즈")
  // The busking day's only sponsor took over its coupon.
  assert.deepEqual(page.coupons, [{ id: "sp-busking", store: "오후의 커피 공릉점", title: "아메리카노 1+1" }])

  const recorded = (await call("POST", "/check-in/20261012/scans")).data
  assert.equal(recorded.entry.participant, `참여자 #${initial.scans + 1}`)
  assert.match(recorded.pass, /^[0-9a-f]{32}$/)
  assert.equal((await call("GET", busking)).data.metrics.scans, initial.scans + 1)

  // A coupon needs the scan's pass and comes once, with a number; the visit
  // is confirmed on the store staff's device with that number and the PIN,
  // never from the participant's phone.
  const { pass } = recorded
  const record = (kind: string, body?: unknown) => call("POST", `/check-in/20261012/${kind}`, body)
  assert.equal((await record("coupons")).status, 403)
  assert.equal((await record("coupons", { pass: "constructor" })).status, 403)
  assert.equal((await record("visits", { pass, pin: "1012" })).status, 403)
  const coupon = (await record("coupons", { pass })).data
  assert.equal(coupon.entry.detail, "아메리카노 1+1")
  assert.match(coupon.coupon, /^UC-[A-HJ-NP-Z2-9]{6}$/)
  assert.equal((await record("coupons", { pass })).status, 409)
  const passState = () => call("GET", `/check-in/20261012/passes/${pass}`)
  assert.deepEqual((await passState()).data, { coupons: { "sp-busking": { number: coupon.coupon, visited: false } } })
  const staff = (body: unknown) => call("POST", "/check-in/20261012/staff/visits", body)
  const wrongPin = await staff({ pin: "0000", coupon: coupon.coupon })
  assert.equal(wrongPin.status, 403)
  assert.match(wrongPin.data.error, /직원 PIN/)
  assert.equal((await staff({ pin: "1012", coupon: "UC-ZZZZZZ" })).status, 404)
  assert.equal((await staff({ pin: "1012", coupon: coupon.coupon.toLowerCase() })).status, 200)
  assert.equal((await staff({ pin: "1012", coupon: coupon.coupon })).status, 409)
  assert.deepEqual((await passState()).data, { coupons: { "sp-busking": { number: coupon.coupon, visited: true } } })
  // The PIN is for the group that owns the event, not for visitors.
  assert.equal((await call("GET", busking)).data.report.staffPin, undefined)
  const owner = await login("학생단체")
  const owned = (await call("GET", busking, undefined, owner)).data.report
  assert.equal(owned.staffPin, "1012")
  assert.equal(owned.sponsors[0].staffPin, "1012")

  const scans = (await call("GET", `${busking}/log?kind=scans`)).data.entries
  assert.equal(scans[0].id, recorded.entry.id)
  assert.ok(scans.every((entry: { kind: string }) => entry.kind === "scans"))
  assert.ok((await call("GET", `${busking}/log`)).data.entries.length > scans.length)

  // Another event of the group starts from zero with a code of its own.
  const list = (await call("GET", "/measurements")).data.measurements
  assert.deepEqual(
    list.map((item: { eventId: string }) => item.eventId),
    ["event-muse-concert", "event-busking-day"],
  )
  const concert = list[0]
  assert.deepEqual(concert.metrics, { scans: 0, coupons: 0, visits: 0 })
  assert.match(concert.report.code, /^[0-9a-f]{8}$/)
  assert.equal(concert.report.expectedAudience, 120)
  await call("POST", `/check-in/${concert.report.code}/scans`)
  assert.equal((await call("GET", "/measurements/event-muse-concert")).data.metrics.scans, 1)
  assert.equal((await call("GET", busking)).data.metrics.scans, initial.scans + 1)

  assert.equal((await call("GET", "/check-in/nope")).status, 404)
  assert.equal((await call("POST", "/check-in/nope/scans")).status, 404)
  assert.equal((await call("POST", "/check-in/20261012/likes")).status, 404)
  assert.equal((await call("GET", `${busking}/log?kind=likes`)).status, 404)
  assert.equal((await call("GET", "/measurements/event-unknown")).status, 404)
  // Brands measure their own campaigns, not the groups' events.
  const brand = await login("브랜드")
  const campaigns = (await call("GET", "/measurements", undefined, brand)).data.measurements
  assert.deepEqual(campaigns.map((item: { eventId: string }) => item.eventId), ["event-coffee-tasting"])
  assert.equal((await call("GET", busking, undefined, brand)).status, 404)
  const preview = (await call("GET", "/measurements?role=브랜드")).data.measurements
  assert.equal(preview[0].report.eventName, "가을 신메뉴 캠퍼스 시음회")
  const tasting = await call("POST", `/check-in/${campaigns[0].report.code}/scans`)
  assert.equal(tasting.status, 200)
})

test("student groups browse the brand catalog and propose to any brand", async () => {
  const { brands } = (await call("GET", "/brands")).data
  assert.equal(brands.length, 12)
  assert.ok(brands.every((brand: { popularity?: number }) => typeof brand.popularity === "number"))
  assert.ok(
    brands.every(
      (brand: { intro?: string; facts?: unknown[] }) => brand.intro && brand.facts?.length === 4,
    ),
  )
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

test("an event's report follows its goals and live counts", async () => {
  const { metrics, report } = (await call("GET", "/measurements/event-busking-day")).data
  assert.equal(report.eventName, "가을 버스킹 데이")
  assert.equal(report.code, "20261012")
  assert.equal(report.targets.roas, 170)
  assert.equal(
    report.valueBreakdown.reduce((sum: number, part: { value: number }) => sum + part.value, 0),
    report.sponsorValue,
  )
  // Reach is the QR scans plus the reach beyond the venue; ROAS is the
  // estimated sales (visits × average spend) over the sponsorship's value.
  assert.equal(report.reach, metrics.scans + report.snsReach)
  assert.equal(report.roas, Math.round(((metrics.visits * report.averageSpend) / report.sponsorValue) * 100))
  assert.equal(
    report.hourlyScans.reduce((sum: number, slot: { scans: number }) => sum + slot.scans, 0),
    metrics.scans,
  )
})

test("brands browse every student group with its next event", async () => {
  const { groups } = (await call("GET", "/groups")).data
  assert.equal(groups.length, 8)
  assert.equal(groups[0].id, "syu-muse")
  assert.equal(groups[0].school, "삼육대학교")
  assert.match(groups[0].eventDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(groups.every((group: { audience?: number }) => typeof group.audience === "number"))
  // Every group has what its detail page shows.
  assert.ok(
    groups.every(
      (group: { intro?: string; facts?: unknown[] }) => group.intro && group.facts?.length === 4,
    ),
  )
})

test("brands answer the proposals in their inbox", async () => {
  const preview = (await call("GET", "/requests")).data.requests
  assert.equal(preview.length, 4)
  assert.equal(preview[0].id, "req-nowon")

  const brand = await login("브랜드")
  const accepted = await call("POST", "/requests/req-nowon/accept", undefined, brand)
  assert.equal(accepted.status, 200)
  assert.equal(accepted.data.request.status, "수락")
  assert.ok(accepted.data.request.respondedAt)
  assert.equal((await call("POST", "/requests/req-nowon/decline", undefined, brand)).status, 409)
  assert.equal((await call("POST", "/requests/req-movement/maybe", undefined, brand)).status, 404)
  assert.equal((await call("POST", "/requests/req-unknown/accept", undefined, brand)).status, 404)

  const declined = await call("POST", "/requests/req-movement/decline", undefined, brand)
  assert.equal(declined.data.request.status, "거절")

  const student = await login("학생단체")
  assert.equal((await call("POST", "/requests/req-nowon/accept", undefined, student)).status, 403)
  assert.deepEqual((await call("GET", "/requests", undefined, student)).data.requests, [])
})

test("a student group's proposal reaches the brand, and the answer comes back", async () => {
  const student = await login("학생단체")
  const brand = await login("브랜드")

  const sent = await call("POST", "/proposals", { matchId: "afternoon-coffee" }, student)
  assert.equal(sent.status, 201)
  assert.equal(sent.data.statuses["afternoon-coffee"], "검토 중")
  // Sending twice does not file a second request.
  await call("POST", "/proposals", { matchId: "afternoon-coffee" }, student)

  const inbox = (await call("GET", "/requests", undefined, brand)).data.requests
  const fromMuse = inbox.filter((request: { groupName: string }) => request.groupName === "삼육대 뮤즈")
  assert.equal(fromMuse.length, 1)
  const [request] = fromMuse
  assert.equal(request.status, "검토 중")
  assert.equal(request.ask, "쿠폰 150장 + 현금 20만원")

  // The proposal is about the group's next event, if there is one.
  const today = new Date().toISOString().slice(0, 10)
  const events = (await call("GET", "/events", undefined, student)).data.events
  const next = events
    .filter((event: { date: string }) => event.date >= today)
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))[0]
  assert.equal(request.eventName, next?.name ?? "행사 일정 협의")

  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const answered = (await call("GET", "/proposals", undefined, student)).data
  assert.equal(answered.statuses["afternoon-coffee"], "수락")
  if (next) {
    const updated = (await call("GET", "/events", undefined, student)).data.events
    assert.equal(updated.find((event: { id: string }) => event.id === next.id).status, "집행 예정")
  }
  assert.equal((await call("DELETE", "/proposals/afternoon-coffee", undefined, student)).status, 409)

  // The accepted proposal becomes one of the brand's sponsorships, linked to
  // the event; it shows in the analytics once the event's day has come.
  const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id
  const record = getDatabase().sponsorships[brandId].find((item) => item.id === `sp-${request.id}`)
  assert.ok(record)
  assert.equal(record.groupName, "삼육대 뮤즈")
  assert.equal(record.eventId, next?.id)
  const analytics = async () => (await call("GET", "/analytics", undefined, brand)).data.sponsorships
  // Its day has not come yet.
  assert.equal((await analytics()).some((item: { id: string }) => item.id === record.id), false)
  if (next) {
    const day = record.date
    record.date = "2026-10-01"
    const shown = (await analytics()).find((item: { id: string }) => item.id === record.id)
    const { metrics, report } = (await call("GET", `/measurements/${next.id}`, undefined, student)).data
    assert.equal(shown.visits, metrics.visits)
    assert.equal(shown.targetRoas, report.targets.roas)
    record.date = day
  }

  // Proposals to brands without an account have no answer to show.
  const other = await call("POST", "/proposals", { matchId: "studymate" }, student)
  assert.equal(other.data.statuses.studymate, undefined)
  const withdrawn = await call("DELETE", "/proposals/studymate", undefined, student)
  assert.ok(!withdrawn.data.proposals.includes("studymate"))
})

test("brand analytics follow the live measurement", async () => {
  const { sponsorships } = (await call("GET", "/analytics")).data
  assert.equal(sponsorships.length, 3)
  assert.deepEqual(
    sponsorships.map((sponsorship: { date: string }) => sponsorship.date),
    ["2026-10-12", "2026-06-10", "2026-05-20"],
  )
  assert.deepEqual(
    sponsorships.map((sponsorship: { targetRoas: number }) => sponsorship.targetRoas),
    [170, 200, 200],
  )
  const { metrics, report } = (await call("GET", "/measurements/event-busking-day")).data
  assert.equal(sponsorships[0].coupons, metrics.coupons)
  assert.equal(sponsorships[0].visits, metrics.visits)
  assert.equal(sponsorships[0].sales, metrics.visits * report.averageSpend)

  const student = await login("학생단체")
  assert.deepEqual((await call("GET", "/analytics", undefined, student)).data.sponsorships, [])
})

test("check-ins count only on the event's days, and records go once they are not needed", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { prunePasses } = await import("./lib/measurements.js")
  const today = todayInKorea()
  const student = await signUpMember("window@syu.ac.kr", "window-pass-123")
  const create = async (date: string) => {
    const { event } = (await call("POST", "/events", { name: `${date} 행사`, date, types: ["현금"] }, student)).data
    const { report } = (await call("GET", `/measurements/${event.id}`, undefined, student)).data
    return { event, report }
  }

  // Not yet: tests before the day do not count.
  const later = await create(addDays(today, 3))
  const early = await call("POST", `/check-in/${later.report.code}/scans`)
  assert.equal(early.status, 409)
  assert.match(early.data.error, /아직 참여를 받지 않는/)

  // On the day: a scan by the day and hour, and a coupon.
  const now = await create(today)
  const code = now.report.code
  const { pass } = (await call("POST", `/check-in/${code}/scans`)).data
  const { coupon } = (await call("POST", `/check-in/${code}/coupons`, { pass })).data
  await call("POST", `/check-in/${code}/scans`)
  const measured = (await call("GET", `/measurements/${now.event.id}`, undefined, student)).data.report
  assert.equal(measured.hourlyScans.length, 1)
  assert.equal(measured.hourlyScans[0].date, today)
  assert.equal(measured.hourlyScans[0].scans, 2)

  // Three days on, no more scans, but the coupon still brings a visit.
  const event = Object.values(getDatabase().events).flat().find((item) => item.id === now.event.id)!
  event.date = addDays(today, -3)
  const over = await call("POST", `/check-in/${code}/scans`)
  assert.equal(over.status, 409)
  assert.match(over.data.error, /참여 기간이 끝난/)
  assert.equal((await call("POST", `/check-in/${code}/coupons`, { pass })).status, 409)
  const measurement = getDatabase().measurements.find((item) => item.eventId === now.event.id)!
  assert.equal(Object.keys(measurement.passes).length, 2)
  // Records without a coupon are no longer needed.
  assert.equal(prunePasses(getDatabase(), measurement, event), true)
  assert.deepEqual(Object.keys(measurement.passes), [pass])
  const visit = await call("POST", `/check-in/${code}/staff/visits`, { pin: now.report.staffPin, coupon })
  assert.equal(visit.status, 200)

  // Once the coupons ran out, no visits and no records.
  event.date = addDays(today, -10)
  assert.equal((await call("POST", `/check-in/${code}/staff/visits`, { pin: now.report.staffPin, coupon })).status, 409)
  assert.equal(prunePasses(getDatabase(), measurement, event), true)
  assert.deepEqual(measurement.passes, {})
})

test("an event's first sponsor takes over the coupons handed out before it", async () => {
  const { syncSponsors } = await import("./lib/measurements.js")
  const database = structuredClone(getDatabase())
  const measurement = database.measurements.find((item) => item.eventId === "event-busking-day")!
  measurement.sponsors = []
  measurement.metrics = { scans: 3, coupons: 2, visits: 1 }
  measurement.passes = { a: { coupon: "UC-AAAAAA", visit: true }, b: { coupon: "UC-BBBBBB" }, c: {} }
  assert.equal(syncSponsors(database, measurement), true)
  assert.equal(syncSponsors(database, measurement), false)
  const [sponsor] = measurement.sponsors
  assert.equal(sponsor.id, "sp-busking")
  assert.equal(sponsor.staffPin, measurement.staffPin)
  assert.deepEqual(sponsor.coupon, measurement.goals.coupon)
  assert.deepEqual(sponsor.metrics, { coupons: 2, visits: 1 })
  assert.deepEqual(measurement.passes, {
    a: { sponsors: { "sp-busking": { coupon: "UC-AAAAAA", visit: true } } },
    b: { sponsors: { "sp-busking": { coupon: "UC-BBBBBB" } } },
    c: {},
  })
})

test("each sponsor of an event gets its own coupon, staff PIN and share of the results", async () => {
  const { recordSponsorship } = await import("./lib/sponsorships.js")
  const database = getDatabase()
  const measurement = database.measurements.find((item) => item.eventId === "event-busking-day")!
  const goalsBefore = structuredClone(measurement.goals)
  const analytics = async () =>
    ((await call("GET", "/analytics")).data.sponsorships as { id: string; spend: number; visits: number; coupons: number }[]).find(
      (item) => item.id === "sp-busking",
    )!
  const before = await analytics()
  assert.equal(before.spend, 680000)

  // A second brand sponsors the busking day: it gets a coupon of its own,
  // and the event's value is split evenly until the group sets each share.
  recordSponsorship(database, "another-brand", {
    id: "sp-another",
    groupName: "삼육대 뮤즈",
    eventName: "가을 버스킹 데이",
    date: "2026-10-12",
    eventId: "event-busking-day",
  })
  try {
    const { coupons } = (await call("GET", "/check-in/20261012")).data
    assert.deepEqual(
      coupons.map((item: { id: string }) => item.id),
      ["sp-busking", "sp-another"],
    )
    const owner = await login("학생단체")
    const report = (await call("GET", "/measurements/event-busking-day", undefined, owner)).data.report
    const [mine, theirs] = report.sponsors
    assert.match(theirs.staffPin, /^\d{4}$/)
    assert.notEqual(theirs.staffPin, mine.staffPin)
    assert.deepEqual([mine.value, theirs.value], [340000, 340000])
    assert.deepEqual([theirs.coupons, theirs.visits], [0, 0])
    assert.equal((await analytics()).spend, 340000)

    // A participant takes both coupons; each store confirms only its own.
    const { pass } = (await call("POST", "/check-in/20261012/scans")).data
    const take = (couponId?: string) => call("POST", "/check-in/20261012/coupons", { pass, ...(couponId ? { couponId } : {}) })
    assert.equal((await take()).status, 404)
    assert.equal((await take("event")).status, 404)
    const other = (await take("sp-another")).data.coupon
    const own = (await take("sp-busking")).data.coupon
    assert.equal((await take("sp-another")).status, 409)
    const staff = (pin: string, coupon: string) => call("POST", "/check-in/20261012/staff/visits", { pin, coupon })
    const wrongStore = await staff(mine.staffPin, other)
    assert.equal(wrongStore.status, 404)
    assert.match(wrongStore.data.error, /다른 매장/)
    const confirmed = await staff(theirs.staffPin, other)
    assert.equal(confirmed.status, 200)
    assert.equal(confirmed.data.store, "협찬사")
    assert.deepEqual((await call("GET", `/check-in/20261012/passes/${pass}`)).data.coupons, {
      "sp-busking": { number: own, visited: false },
      "sp-another": { number: other, visited: true },
    })

    // The demo brand's analytics hold only its own coupon's figures.
    const after = await analytics()
    assert.equal(after.coupons, before.coupons + 1)
    assert.equal(after.visits, before.visits)
    const split = (await call("GET", "/measurements/event-busking-day", undefined, owner)).data
    assert.deepEqual([split.report.sponsors[1].coupons, split.report.sponsors[1].visits], [1, 1])
    assert.equal(split.metrics.visits, before.visits + 1)

    // The group sets each sponsor's share; the shares must add up.
    const goals = { ...goalsBefore, sponsors: [] as unknown[] }
    const shares = (first: number, second: number, secondPin = theirs.staffPin) => ({
      ...goals,
      sponsors: [
        { id: "sp-busking", ...mine.coupon, value: first, staffPin: mine.staffPin },
        { id: "sp-another", store: "다른 카페", title: "쿠키 증정", value: second, staffPin: secondPin },
      ],
    })
    const route = "/measurements/event-busking-day/goals"
    const uneven = await call("PUT", route, shares(500000, 100000), owner)
    assert.equal(uneven.status, 400)
    assert.match(uneven.data.error, /680,000원/)
    assert.equal((await call("PUT", route, shares(500000, 180000, mine.staffPin), owner)).status, 400)
    const saved = await call("PUT", route, shares(500000, 180000), owner)
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.data.report.sponsors.map((item: { value: number }) => item.value), [500000, 180000])
    assert.equal(saved.data.report.sponsors[1].coupon.title, "쿠키 증정")
    assert.equal((await analytics()).spend, 500000)
    // A change to the event's value alone must keep the shares adding up.
    const smaller = { ...goalsBefore, valueBreakdown: [{ type: "현금", value: 100000 }] }
    assert.equal((await call("PUT", route, smaller, owner)).status, 400)
  } finally {
    delete database.sponsorships["another-brand"]
    measurement.sponsors = measurement.sponsors.filter((sponsor) => sponsor.id !== "sp-another")
    measurement.goals = goalsBefore
  }
})

test("brand campaigns take an optional budget", async () => {
  const brand = await login("브랜드")
  const campaign = { name: "겨울 시즌 투어", date: "2026-12-03", types: ["제품"] }
  const negative = await call("POST", "/events", { ...campaign, budget: -1 }, brand)
  assert.equal(negative.status, 400)
  assert.equal((await call("POST", "/events", { ...campaign, budget: "50만" }, brand)).status, 400)

  const created = await call("POST", "/events", { ...campaign, budget: 1200000 }, brand)
  assert.equal(created.status, 201)
  assert.equal(created.data.event.budget, 1200000)
  await call("DELETE", `/events/${created.data.event.id}`, undefined, brand)

  const student = await login("학생단체")
  const event = await call("POST", "/events", { ...campaign, budget: 1200000 }, student)
  assert.equal(event.data.event.budget, undefined)
  await call("DELETE", `/events/${event.data.event.id}`, undefined, student)
})

test("events and campaigns can run over a period", async () => {
  const brand = await login("브랜드")
  const campaign = { name: "겨울 팝업 주간", date: "2026-12-07", types: ["제품"] }
  const backwards = await call("POST", "/events", { ...campaign, endDate: "2026-12-01" }, brand)
  assert.equal(backwards.status, 400)
  const tooLong = await call("POST", "/events", { ...campaign, endDate: "2027-06-01" }, brand)
  assert.equal(tooLong.status, 400)

  const week = await call("POST", "/events", { ...campaign, endDate: "2026-12-11" }, brand)
  assert.equal(week.status, 201)
  assert.equal(week.data.event.date, "2026-12-07")
  assert.equal(week.data.event.endDate, "2026-12-11")
  await call("DELETE", `/events/${week.data.event.id}`, undefined, brand)

  // Ending on the first day is a one-day event.
  const oneDay = await call("POST", "/events", { ...campaign, endDate: "2026-12-07" }, brand)
  assert.equal(oneDay.data.event.endDate, undefined)
  await call("DELETE", `/events/${oneDay.data.event.id}`, undefined, brand)
})

test("accounts ask the operators questions, and see the answers", async () => {
  assert.equal((await call("POST", "/inquiries", { category: "기타", question: "질문이 있어요" })).status, 401)
  const student = await login("학생단체")
  const noCategory = await call("POST", "/inquiries", { category: "아무거나", question: "질문이 있어요" }, student)
  assert.equal(noCategory.status, 400)
  assert.equal((await call("POST", "/inquiries", { category: "기타", question: "짧" }, student)).status, 400)

  const asked = await call(
    "POST",
    "/inquiries",
    { category: "제안 · 매칭", question: "제안을 보낸 뒤 취소하면 브랜드에도 알려지나요?" },
    student,
  )
  assert.equal(asked.status, 201)
  assert.equal(asked.data.inquiry.accountId, undefined)
  const id = asked.data.inquiry.id

  // Only the asker sees the question.
  const brand = await login("브랜드")
  assert.equal((await call("GET", "/inquiries", undefined, brand)).data.inquiries.length, 0)

  // Operators need the admin token.
  const admin = async (method: string, route: string, body?: unknown, token = "test-admin-token") => {
    const response = await fetch(baseUrl + route, {
      method,
      headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const reply = await response.text()
    return { status: response.status, data: reply ? JSON.parse(reply) : null }
  }
  assert.equal((await admin("GET", "/admin/inquiries", undefined, "wrong-token-value")).status, 403)
  assert.equal((await call("GET", "/admin/inquiries")).status, 403)
  const listed = await admin("GET", "/admin/inquiries")
  assert.equal(listed.data.inquiries[0].from.name, "삼육대 뮤즈")
  const answer = "네, 취소하면 브랜드의 받은 제안에서도 사라져요."
  assert.equal((await admin("POST", `/admin/inquiries/${id}/answer`, { answer })).status, 200)

  const mine = await call("GET", "/inquiries", undefined, student)
  assert.equal(mine.data.inquiries[0].answer, answer)
  assert.ok(mine.data.inquiries[0].answeredAt)
})

test("accounts write the listing the other side sees", async () => {
  const student = await login("학생단체")
  const mine = (await call("GET", "/profile", undefined, student)).data.profile
  assert.equal(mine.id, "syu-muse")
  assert.equal(mine.sns.length, 2)

  const draft = {
    intro: "삼육대학교 밴드 동아리예요. 정기 공연을 열어요.",
    offer: "관객 150명 · SNS 홍보",
    tags: ["공연 특화", "밴드"],
    facts: [
      { label: "회원 수", value: "45명" },
      { label: "위치", value: "브랜드 항목은 무시돼요" },
    ],
    sns: [{ platform: "인스타그램", handle: "@syu_muse", followers: "3,200명" }],
    portfolio: [{ title: "가을 버스킹 데이", detail: "관객 160명" }],
  }
  assert.equal((await call("PUT", "/profile", { ...draft, intro: "짧아요" }, student)).status, 400)
  const badSns = { ...draft, sns: [{ platform: "메신저", handle: "@x" }] }
  assert.equal((await call("PUT", "/profile", badSns, student)).status, 400)
  const saved = await call("PUT", "/profile", draft, student)
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.data.profile.facts, [{ label: "회원 수", value: "45명" }])

  // Brands see the new introduction right away.
  const { groups } = (await call("GET", "/groups")).data
  assert.equal(groups.find((group: { id: string }) => group.id === "syu-muse").offer, draft.offer)

  // A new account is listed once it saves its introduction.
  const sent = await call("POST", "/auth/email-code", { role: "브랜드", email: "hi@newbrand.co.kr" })
  const verified = await call("POST", "/auth/email-code/verify", {
    email: "hi@newbrand.co.kr",
    code: sent.data.devCode,
  })
  const signup = await call("POST", "/auth/signup", {
    role: "브랜드",
    name: "새로운 브랜드",
    type: "교육",
    school: "",
    email: "hi@newbrand.co.kr",
    password: "brand-pass-123",
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    over14: true,
  })
  const newBrand = signup.data.token as string
  assert.equal((await call("GET", "/profile", undefined, newBrand)).data.profile, null)
  // Chatting needs a listing first.
  const early = await call("POST", "/conversations", { partnerId: "syu-muse" }, newBrand)
  assert.equal(early.status, 409)
  const created = await call(
    "PUT",
    "/profile",
    { intro: "대학생을 위한 온라인 강의 플랫폼이에요.", offer: "수강권 50장" },
    newBrand,
  )
  assert.equal(created.data.profile.industry, "education")
  const { brands } = (await call("GET", "/brands")).data
  assert.ok(brands.some((brand: { name: string }) => brand.name === "새로운 브랜드"))
})

test("a group's next event comes from its own calendar", async () => {
  const student = await login("학생단체")
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const { event } = (
    await call(
      "POST",
      "/events",
      { name: "깜짝 버스킹", date: tomorrow, people: "80명", types: ["제품"] },
      student,
    )
  ).data
  const muse = (await call("GET", "/groups")).data.groups.find(
    (group: { id: string }) => group.id === "syu-muse",
  )
  assert.equal(muse.eventName, "깜짝 버스킹")
  assert.equal(muse.audience, 80)
  await call("DELETE", `/events/${event.id}`, undefined, student)
})

test("student groups and brands message each other", async () => {
  const student = await login("학생단체")
  const brand = await login("브랜드")

  const forBrand = (await call("GET", "/conversations", undefined, brand)).data.conversations
  const withMuse = forBrand.find((item: { partner: { id: string } }) => item.partner.id === "syu-muse")
  assert.equal(withMuse.unread, 1)
  assert.equal(withMuse.partner.hasAccount, true)

  // Opening it reads it; replying reaches the student group.
  const opened = (await call("GET", `/conversations/${withMuse.id}`, undefined, brand)).data
  assert.equal(opened.conversation.messages.length, 3)
  assert.equal(opened.conversation.messages[0].mine, false)
  assert.equal(opened.conversation.unread, 0)
  const empty = await call("POST", `/conversations/${withMuse.id}/messages`, { text: " " }, brand)
  assert.equal(empty.status, 400)
  const reply = await call(
    "POST",
    `/conversations/${withMuse.id}/messages`,
    { text: "좋아요, 쿠폰 디자인 시안을 보내 드릴게요." },
    brand,
  )
  assert.equal(reply.status, 201)
  assert.equal(reply.data.conversation.messages.at(-1).mine, true)

  const forStudent = (await call("GET", "/conversations", undefined, student)).data.conversations
  const withCoffee = forStudent.find(
    (item: { partner: { id: string } }) => item.partner.id === "afternoon-coffee",
  )
  assert.equal(withCoffee.unread, 1)
  assert.equal(withCoffee.lastMessage.text, "좋아요, 쿠폰 디자인 시안을 보내 드릴게요.")

  // Starting a conversation twice opens the same one; partners must exist.
  const started = await call("POST", "/conversations", { partnerId: "glowlab" }, student)
  assert.equal(started.status, 201)
  assert.equal(started.data.conversation.partner.hasAccount, false)
  const again = await call("POST", "/conversations", { partnerId: "glowlab" }, student)
  assert.equal(again.data.conversation.id, started.data.conversation.id)
  assert.equal((await call("POST", "/conversations", { partnerId: "nope" }, student)).status, 404)

  // Other accounts can't read it, and visitors have no conversations.
  assert.equal((await call("GET", `/conversations/${started.data.conversation.id}`, undefined, brand)).status, 404)
  assert.deepEqual((await call("GET", "/conversations")).data.conversations, [])
})

test("senders see when messages are read, and both sides see edits and deletions", async () => {
  const student = await login("학생단체")
  const brand = await login("브랜드")
  const forStudent = (await call("GET", "/conversations", undefined, student)).data.conversations
  const { id } = forStudent.find((item: { partner: { id: string } }) => item.partner.id === "afternoon-coffee")

  // Unread until the brand opens the conversation; the read mark is the sender's alone.
  const sent = await call("POST", `/conversations/${id}/messages`, { text: "내일 오후 3시에 통화 가능할까요?" }, student)
  const message = sent.data.conversation.messages.at(-1)
  assert.equal(message.read, false)
  const forBrand = (await call("GET", `/conversations/${id}`, undefined, brand)).data.conversation
  assert.equal(forBrand.messages.at(-1).read, undefined)
  const reread = (await call("GET", `/conversations/${id}`, undefined, student)).data.conversation
  assert.equal(reread.messages.at(-1).read, true)

  // Only the sender edits; both sides see the new text marked as edited.
  const route = `/conversations/${id}/messages/${message.id}`
  assert.equal((await call("PUT", route, { text: "제가 고칠게요" }, brand)).status, 403)
  assert.equal((await call("PUT", route, { text: " " }, student)).status, 400)
  const edited = await call("PUT", route, { text: "내일 오후 4시에 통화 가능할까요?" }, student)
  assert.equal(edited.status, 200)
  assert.ok(edited.data.conversation.messages.at(-1).editedAt)
  const brandSees = (await call("GET", `/conversations/${id}`, undefined, brand)).data.conversation.messages.at(-1)
  assert.equal(brandSees.text, "내일 오후 4시에 통화 가능할까요?")
  assert.ok(brandSees.editedAt)

  // Only the sender deletes; the text is gone for both and stays deleted.
  assert.equal((await call("DELETE", route, undefined, brand)).status, 403)
  const deleted = await call("DELETE", route, undefined, student)
  assert.equal(deleted.status, 200)
  assert.equal(deleted.data.conversation.messages.at(-1).text, "")
  assert.ok(deleted.data.conversation.messages.at(-1).deletedAt)
  assert.equal((await call("PUT", route, { text: "다시 보낼게요" }, student)).status, 409)
  const brandList = (await call("GET", "/conversations", undefined, brand)).data.conversations
  const last = brandList.find((item: { id: string }) => item.id === id).lastMessage
  assert.deepEqual([last.text, last.deleted], ["", true])
  const brandThread = (await call("GET", `/conversations/${id}`, undefined, brand)).data.conversation
  assert.ok(brandThread.messages.at(-1).deletedAt)
  assert.equal((await call("DELETE", `/conversations/${id}/messages/nope`, undefined, student)).status, 404)
})

test("older data files gain the new collections and calendar dates", async () => {
  const { upgradeDatabase } = await import("./store.js")
  const old = {
    events: { someone: [{ date: "2026. 11. 27." }, { date: "미정" }] },
  } as unknown as Parameters<typeof upgradeDatabase>[0]
  const upgraded = upgradeDatabase(old)
  assert.equal(upgraded.brands.length, 12)
  // Without the demo group there is no busking day to measure.
  assert.deepEqual(upgraded.measurements, [])
  assert.equal(upgraded.groups.length, 8)
  assert.equal(upgraded.catalogVersion, 2)
  assert.ok(upgraded.brands.every((brand) => brand.intro && brand.sns && brand.portfolio))
  assert.equal(upgraded.conversations.length, 3)

  // Version 2 catalogs keep their edits.
  const edited = upgradeDatabase({
    events: {},
    catalogVersion: 2,
    brands: [{ id: "afternoon-coffee", intro: "직접 고친 소개" }],
    groups: [],
  } as unknown as Parameters<typeof upgradeDatabase>[0])
  assert.equal(edited.brands[0].intro, "직접 고친 소개")
  assert.equal(upgraded.requests.length, 4)
  assert.deepEqual(upgraded.sponsorships, {})

  // Sponsorships saved before goals existed get one.
  const saved = upgradeDatabase({
    events: {},
    sponsorships: { brand: [{ id: "sp-finals" }, { id: "sp-other" }] },
  } as unknown as Parameters<typeof upgradeDatabase>[0])
  assert.deepEqual(
    saved.sponsorships.brand.map((sponsorship) => sponsorship.targetRoas),
    [200, 100],
  )
  assert.deepEqual(
    upgraded.events.someone.map((event) => event.date),
    ["2026-11-27", "미정"],
  )
})

test("a failed save does not stop later saves", async () => {
  await saveDatabase()
  const dataFile = config.dataFile
  // Renaming onto a folder that has files fails, as a full disk would.
  config.dataFile = process.env.FRONTEND_DIST!
  await assert.rejects(saveDatabase())
  config.dataFile = dataFile
  await saveDatabase()
})

test("a request whose save fails leaves nothing behind", async () => {
  const student = await login("학생단체")
  await saveDatabase()
  const count = () => (getDatabase().events[getDatabase().demoAccountIds.학생단체] ?? []).length
  const before = count()
  const event = { name: "저장 안 될 행사", date: "2026-12-01", types: ["현금"] }
  const dataFile = config.dataFile
  config.dataFile = process.env.FRONTEND_DIST!
  const failed = await call("POST", "/events", event, student)
  config.dataFile = dataFile
  assert.equal(failed.status, 503)
  assert.match(failed.data.error, /되돌렸어요/)
  // Nothing stayed in memory, so trying again makes one event, not two.
  assert.equal(count(), before)
  const again = await call("POST", "/events", event, student)
  assert.equal(again.status, 201)
  assert.equal(count(), before + 1)
  await call("DELETE", `/events/${again.data.event.id}`, undefined, student)
})

test("proposal answers only take accept or decline", async () => {
  const brand = await login("브랜드")
  for (const decision of ["constructor", "toString", "__proto__"]) {
    const answer = await call("POST", `/requests/req-unknown/${decision}`, undefined, brand)
    assert.equal(answer.status, 404, decision)
  }
})

test("asking for a new code keeps the wrong guesses", async () => {
  const email = "guess@syu.ac.kr"
  const first = await call("POST", "/auth/email-code", { role: "학생단체", email })
  const wrong = first.data.devCode === "000000" ? "111111" : "000000"
  for (let i = 0; i < config.emailCodeMaxAttempts; i += 1) {
    assert.equal((await call("POST", "/auth/email-code/verify", { email, code: wrong })).status, 400)
  }
  const again = await call("POST", "/auth/email-code", { role: "학생단체", email })
  assert.equal(again.status, 200)
  const verify = await call("POST", "/auth/email-code/verify", { email, code: again.data.devCode })
  assert.equal(verify.status, 429)
})

test("codes can be asked for only so often", async () => {
  const email = "often@syu.ac.kr"
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await call("POST", "/auth/email-code", { role: "학생단체", email })).status, 200)
  }
  const limited = await call("POST", "/auth/email-code", { role: "학생단체", email })
  assert.equal(limited.status, 429)
  assert.match(limited.data.error, /30분/)
  // Another address from the same place still gets one.
  const other = await call("POST", "/auth/email-code", { role: "학생단체", email: "other@syu.ac.kr" })
  assert.equal(other.status, 200)
})

test("repeated wrong passwords lock that login for a while", async () => {
  const attempt = (password: string) =>
    call("POST", "/auth/login", { role: "학생단체", email: "muse@syu.ac.kr", password })
  for (let i = 0; i < 10; i += 1) assert.equal((await attempt("wrong-password")).status, 401)
  assert.equal((await attempt(DEMO_PASSWORD)).status, 429)
  // Other accounts still log in.
  assert.ok(await login("브랜드"))
})

test("the admin token check fails safely and slows guessing", async () => {
  const admin = (token: string) =>
    fetch(`${baseUrl}/admin/inquiries`, { headers: { "X-Admin-Token": token } }).then(
      (response) => response.status,
    )
  // Same length as the real token, with a letter outside ASCII.
  assert.equal(await admin("tést-admin-token"), 403)
  assert.equal(await admin("test-admin-token"), 200)
  for (let i = 0; i < 9; i += 1) assert.equal(await admin("wrong"), 403)
  assert.equal(await admin("test-admin-token"), 429)
})

test("check-in records are limited per address", async () => {
  for (let i = 0; i < 120; i += 1) {
    assert.equal((await call("POST", "/check-in/20261012/scans")).status, 200)
  }
  assert.equal((await call("POST", "/check-in/20261012/scans")).status, 429)
})

test("wrong staff PINs are limited per address and per event", async () => {
  const { pass } = (await call("POST", "/check-in/20261012/scans")).data
  const { coupon } = (await call("POST", "/check-in/20261012/coupons", { pass })).data
  const staff = (pin: string, headers?: Record<string, string>) =>
    fetch(`${baseUrl}/check-in/20261012/staff/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ pin, coupon }),
    }).then((response) => response.status)
  for (let i = 0; i < 10; i += 1) assert.equal(await staff("9999"), 403)
  assert.equal(await staff("1012"), 429)

  // From many addresses (a proxy that is trusted), the event itself locks
  // after 30 wrong PINs.
  clearRateLimits()
  const app = createApp()
  app.set("trust proxy", true)
  const other = app.listen(0)
  await new Promise((resolve) => other.once("listening", resolve))
  const port = (other.address() as AddressInfo).port
  const fromAddress = (index: number, pin: string) =>
    fetch(`http://127.0.0.1:${port}/api/check-in/20261012/staff/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.${Math.floor(index / 250)}.${index % 250}` },
      body: JSON.stringify({ pin, coupon }),
    }).then((response) => response.status)
  const statuses = []
  for (let i = 0; i < 31; i += 1) statuses.push(await fromAddress(i, "9999"))
  assert.equal(statuses.filter((status) => status === 403).length, 30)
  assert.equal(statuses.at(-1), 429)
  await new Promise((resolve) => other.close(resolve))
})

test("the old global measurement moves to the busking day's own", async () => {
  const { upgradeDatabase } = await import("./store.js")
  const upgraded = upgradeDatabase({
    accounts: [{ id: "muse" }],
    demoAccountIds: { 학생단체: "muse" },
    events: { muse: [] },
    metrics: { scans: 200, coupons: 120, visits: 60 },
    metricLog: [{ id: "old", kind: "scans", at: "2026-10-12T10:00:00.000Z", participant: "참여자 #200", detail: "QR 스캔 테스트" }],
    report: { eventName: "가을 버스킹 데이" },
  } as unknown as Parameters<typeof upgradeDatabase>[0])
  const [busking] = upgraded.measurements
  assert.equal(busking.eventId, "event-busking-day")
  assert.deepEqual(busking.metrics, { scans: 200, coupons: 120, visits: 60 })
  assert.equal(busking.log[0].detail, "현장 QR 스캔")
  assert.equal("metrics" in upgraded || "report" in upgraded || "metricLog" in upgraded, false)
})

test("sign-up codes stay off the response unless turned on", () => {
  assert.equal(emailCodesExposed({}), false)
  assert.equal(emailCodesExposed({ NODE_ENV: "development" }), false)
  assert.equal(emailCodesExposed({ EXPOSE_EMAIL_CODES: "false" }), false)
  assert.equal(emailCodesExposed({ EXPOSE_EMAIL_CODES: "true" }), true)
})

// A member signed up for a test, logged in, with their token.
async function signUpMember(email: string, password: string) {
  const sent = await call("POST", "/auth/email-code", { role: "학생단체", email })
  const verified = await call("POST", "/auth/email-code/verify", { email, code: sent.data.devCode })
  const signup = await call("POST", "/auth/signup", {
    role: "학생단체",
    name: `${email.split("@")[0]} 동아리`,
    type: "공연 동아리",
    school: "삼육대학교",
    email,
    password,
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    over14: true,
  })
  assert.equal(signup.status, 201)
  return signup.data.token as string
}

test("one verification makes one account, and one reset code sets one password", async () => {
  const email = "twice@syu.ac.kr"
  const sent = await call("POST", "/auth/email-code", { role: "학생단체", email })
  const verified = await call("POST", "/auth/email-code/verify", { email, code: sent.data.devCode })
  const form = {
    role: "학생단체",
    name: "동시 가입 동아리",
    type: "공연 동아리",
    school: "삼육대학교",
    email,
    password: "twice-pass-123",
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    over14: true,
  }
  const signups = await Promise.all(Array.from({ length: 5 }, () => call("POST", "/auth/signup", form)))
  assert.deepEqual(signups.map((item) => item.status).sort(), [201, 400, 400, 400, 400])
  assert.equal(getDatabase().accounts.filter((account) => account.email === email).length, 1)

  await call("POST", "/auth/password-reset/code", { email })
  const code = getDatabase().emailCodes.find((item) => item.email === email && item.purpose === "reset")!.code
  const resets = await Promise.all(
    ["reset-one-123", "reset-two-123"].map((password) => call("POST", "/auth/password-reset", { email, code, password })),
  )
  assert.deepEqual(resets.map((item) => item.status).sort(), [200, 400])
})

test("a forgotten password is reset with a code sent to the account's email", async () => {
  const email = "forgetful@syu.ac.kr"
  const before = await signUpMember(email, "first-pass-123")
  // The code goes only by email (the log without a mail service), never in
  // the answer, even with EXPOSE_EMAIL_CODES on; tests read it from the data.
  const sendCode = async () => {
    const sent = await call("POST", "/auth/password-reset/code", { email })
    assert.equal(sent.status, 200)
    assert.equal(sent.data.devCode, undefined)
    const entry = getDatabase().emailCodes.find((item) => item.email === email && item.purpose === "reset")
    return entry!.code
  }

  const unknown = await call("POST", "/auth/password-reset/code", { email: "nobody@nowhere.co.kr" })
  assert.equal(unknown.status, 404)

  const code = await sendCode()
  const wrong = code === "000000" ? "111111" : "000000"
  // A sign-up check cannot use a reset code.
  assert.equal((await call("POST", "/auth/email-code/verify", { email, code })).status, 400)
  const short = await call("POST", "/auth/password-reset", { email, code, password: "short" })
  assert.equal(short.status, 400)
  const wrongCode = await call("POST", "/auth/password-reset", { email, code: wrong, password: "new-pass-123" })
  assert.equal(wrongCode.status, 400)

  const done = await call("POST", "/auth/password-reset", { email, code, password: "new-pass-123" })
  assert.equal(done.status, 200)
  assert.equal(done.data.account.email, email)
  assert.equal(done.data.account.passwordHash, undefined)
  // Sessions from before the reset end; the new one works.
  assert.equal((await call("GET", "/auth/me", undefined, before)).status, 401)
  assert.equal((await call("GET", "/auth/me", undefined, done.data.token)).status, 200)
  // The code is used up.
  assert.equal(
    (await call("POST", "/auth/password-reset", { email, code, password: "other-pass-123" })).status,
    400,
  )
  const logIn = (password: string) => call("POST", "/auth/login", { role: "학생단체", email, password })
  assert.equal((await logIn("first-pass-123")).status, 401)
  assert.equal((await logIn("new-pass-123")).status, 200)
})

test("the demo accounts keep their published password", async () => {
  const brand = await login("브랜드")
  const email = "hello@afternoon-coffee.kr"
  assert.equal((await call("POST", "/auth/password-reset/code", { email })).status, 403)
  const change = await call("POST", "/auth/password", { current: DEMO_PASSWORD, next: "taken-over-123" }, brand)
  assert.equal(change.status, 403)
  assert.equal((await call("GET", "/auth/me", undefined, brand)).status, 200)
})

test("wrong passwords sent all at once still meet the login limit", async () => {
  const attempt = () =>
    call("POST", "/auth/login", { role: "학생단체", email: "muse@syu.ac.kr", password: "wrong-password" })
  const statuses = (await Promise.all(Array.from({ length: 30 }, attempt))).map((reply) => reply.status)
  assert.equal(statuses.filter((status) => status === 401).length, 10)
  assert.equal(statuses.filter((status) => status === 429).length, 20)
})

test("a login still checking the old password gets no session after a reset", async () => {
  const email = "racing@syu.ac.kr"
  await signUpMember(email, "old-pass-123")
  for (let round = 0; round < 5; round += 1) {
    const oldPassword = round === 0 ? "old-pass-123" : `new-pass-${round - 1}`
    await call("POST", "/auth/password-reset/code", { email })
    const code = getDatabase().emailCodes.find((item) => item.email === email && item.purpose === "reset")!.code
    // Started together: whichever finishes first, the old password must not
    // leave a working session behind.
    const [login] = await Promise.all([
      call("POST", "/auth/login", { role: "학생단체", email, password: oldPassword }),
      call("POST", "/auth/password-reset", { email, code, password: `new-pass-${round}` }),
    ])
    if (login.status === 200) {
      assert.equal((await call("GET", "/auth/me", undefined, login.data.token)).status, 401)
    }
    clearRateLimits()
  }
})

test("an account can leave, taking what it made with it", async () => {
  const email = "leaving@syu.ac.kr"
  const sent = await call("POST", "/auth/email-code", { role: "학생단체", email })
  const verified = await call("POST", "/auth/email-code/verify", { email, code: sent.data.devCode })
  const signup = await call("POST", "/auth/signup", {
    role: "학생단체",
    name: "떠나는 동아리",
    type: "공연 동아리",
    school: "삼육대학교",
    email,
    password: "leave-pass-123",
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    over14: true,
  })
  const token = signup.data.token as string
  const accountId = signup.data.account.id as string
  const profile = { intro: "곧 떠나는 공연 동아리예요. 반가웠어요.", offer: "관객 50명" }
  const listingId = (await call("PUT", "/profile", profile, token)).data.profile.id as string
  const event = { name: "마지막 공연", date: "2026-12-05", types: ["현금"] }
  assert.equal((await call("POST", "/events", event, token)).status, 201)
  const question = { category: "기타", question: "탈퇴하면 무엇이 지워지나요?" }
  assert.equal((await call("POST", "/inquiries", question, token)).status, 201)
  assert.equal((await call("POST", "/conversations", { partnerId: "afternoon-coffee" }, token)).status, 201)

  // The demo accounts stay for everyone.
  const demo = await login("학생단체")
  assert.equal((await call("DELETE", "/auth/account", { password: DEMO_PASSWORD }, demo)).status, 403)

  const wrong = await call("DELETE", "/auth/account", { password: "wrong-password" }, token)
  assert.equal(wrong.status, 400)
  assert.equal((await call("DELETE", "/auth/account", { password: "leave-pass-123" }, token)).status, 204)

  assert.equal((await call("GET", "/auth/me", undefined, token)).status, 401)
  const relogin = await call("POST", "/auth/login", { role: "학생단체", email, password: "leave-pass-123" })
  assert.equal(relogin.status, 401)
  const database = getDatabase()
  assert.equal(database.accounts.some((account) => account.id === accountId), false)
  assert.equal(database.groups.some((listing) => listing.id === listingId), false)
  assert.equal(database.events[accountId], undefined)
  assert.equal(database.inquiries.some((inquiry) => inquiry.accountId === accountId), false)
  assert.equal(database.conversations.some((conversation) => conversation.groupId === listingId), false)
  // The same email can sign up again.
  assert.equal((await call("POST", "/auth/email-code", { role: "학생단체", email })).status, 200)
})

test("a brand's offer reaches the student group, and the answer comes back", async () => {
  const preview = (await call("GET", "/offers")).data.offers
  assert.deepEqual(
    preview.map((offer: { id: string }) => offer.id),
    ["offer-glowlab", "offer-freshon", "offer-studymate"],
  )

  const brand = await login("브랜드")
  assert.equal((await call("POST", "/proposals", { matchId: "syu-muse" }, brand)).status, 201)
  assert.equal((await call("GET", "/proposals", undefined, brand)).data.statuses["syu-muse"], "검토 중")
  // Proposing again sends no second offer.
  await call("POST", "/proposals", { matchId: "syu-muse" }, brand)

  const student = await login("학생단체")
  const offers = (await call("GET", "/offers", undefined, student)).data.offers
  const sent = offers.filter((offer: { brandName: string }) => offer.brandName === "오후의 커피")
  assert.equal(sent.length, 1)
  assert.equal(sent[0].campaignName, "가을 신메뉴 캠퍼스 시음회")
  assert.equal(sent[0].status, "검토 중")
  assert.deepEqual((await call("GET", "/offers", undefined, brand)).data.offers, [])

  const answer = (decision: string, token = student, id = sent[0].id) =>
    call("POST", `/offers/${id}/${decision}`, undefined, token)
  assert.equal((await answer("accept", brand)).status, 403)
  assert.equal((await answer("constructor")).status, 404)
  assert.equal((await answer("accept", student, "offer-unknown")).status, 404)
  const accepted = await answer("accept")
  assert.equal(accepted.status, 200)
  assert.equal(accepted.data.offer.status, "수락")
  assert.ok(accepted.data.offer.respondedAt)
  assert.equal((await answer("decline")).status, 409)

  assert.equal((await call("GET", "/proposals", undefined, brand)).data.statuses["syu-muse"], "수락")
  const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id
  const record = getDatabase().sponsorships[brandId].find((item) => item.id === `sp-${sent[0].id}`)
  assert.equal(record?.groupName, "삼육대 뮤즈")
  assert.equal(record?.eventName, "가을 신메뉴 캠퍼스 시음회")
  assert.equal((await call("DELETE", "/proposals/syu-muse", undefined, brand)).status, 409)
  const declined = await answer("decline", student, "offer-freshon")
  assert.equal(declined.data.offer.status, "거절")
})

test("a student group sets its event's goals, and the report follows", async () => {
  const goals = {
    expectedAudience: 200,
    averageSpend: 12000,
    snsReach: 500,
    valueBreakdown: [
      { type: "현금", value: 300000 },
      { type: "제품", value: "100,000" },
      { type: "서비스", value: 0 },
    ],
    targets: { reach: 900, scans: 150, coupons: 100, visits: 40, qrRate: 70, visitRate: 30, roas: 160 },
    coupon: { store: "공연장 매점", title: "음료 1잔 무료" },
    staffPin: "4321",
  }
  const route = "/measurements/event-muse-concert/goals"
  assert.equal((await call("PUT", route, goals)).status, 401)
  const brand = await login("브랜드")
  // A brand cannot set a group's event goals.
  assert.equal((await call("PUT", route, goals, brand)).status, 404)

  const student = await login("학생단체")
  const bad = await call("PUT", route, { ...goals, expectedAudience: 0 }, student)
  assert.equal(bad.status, 400)
  assert.match(bad.data.error, /예상 인원은/)
  const badType = { ...goals, valueBreakdown: [{ type: "주식", value: 1000 }] }
  assert.equal((await call("PUT", route, badType, student)).status, 400)
  assert.equal((await call("PUT", route, { ...goals, coupon: { store: "", title: "x" } }, student)).status, 400)
  assert.equal((await call("PUT", route, { ...goals, staffPin: "12a4" }, student)).status, 400)

  // Once brands sponsor the event, each sponsor's coupon comes with the goals.
  const current = (await call("GET", "/measurements/event-muse-concert", undefined, student)).data.report
  const sponsors = (current.sponsors ?? []).map((sponsor: { id: string }) => ({ id: sponsor.id, ...goals.coupon }))
  const saved = await call("PUT", route, { ...goals, sponsors }, student)
  assert.equal(saved.status, 200)
  const { metrics, report } = saved.data
  assert.equal(report.expectedAudience, 200)
  assert.equal(report.sponsorValue, 400000)
  assert.deepEqual(report.valueBreakdown.map((part: { type: string }) => part.type), ["현금", "제품"])
  assert.equal(report.reach, metrics.scans + 500)
  assert.equal(report.roas, Math.round(((metrics.visits * 12000) / 400000) * 100))
  assert.equal(report.targets.roas, 160)
  assert.equal(report.staffPin, "4321")
  const code = report.code as string
  const offered = (await call("GET", `/check-in/${code}`)).data.coupons
  assert.deepEqual(offered.map((coupon: { title: string }) => coupon.title), ["음료 1잔 무료"])
})

test("the server's today is Korea's, whatever its own time zone", async () => {
  const { todayInKorea } = await import("./lib/dates.js")
  // 01:00 on the 22nd in Korea is still the 21st in UTC.
  assert.equal(todayInKorea(new Date("2026-10-21T16:00:00Z")), "2026-10-22")
  assert.equal(todayInKorea(new Date("2026-10-21T14:59:00Z")), "2026-10-21")
})

test("matches are worked out for the account browsing, with reasons", async () => {
  const forVisitors = (await call("GET", "/brands")).data.brands
  assert.ok(forVisitors.every((brand: { score: number }) => brand.score >= 55 && brand.score <= 98))
  const scores = forVisitors.map((brand: { score: number }) => brand.score)
  assert.deepEqual(scores, [...scores].sort((a: number, b: number) => b - a))
  // The demo group has sponsored with 오후의 커피 before, which leads its reasons.
  const coffee = forVisitors.find((brand: { id: string }) => brand.id === "afternoon-coffee")
  assert.equal(coffee.reasons[0], "함께한 협찬이 있어요")

  // A new brand's listing is scored like any other, not left at its first 70.
  const groups = (await call("GET", "/groups")).data.groups
  const muse = groups.find((group: { id: string }) => group.id === "syu-muse")
  assert.ok(muse.reasons.length > 0)
  const brand = await login("브랜드")
  const forBrand = (await call("GET", "/groups", undefined, brand)).data.groups
  assert.equal(forBrand[0].id, "syu-muse")
})

test("codes go out by email once a mail service is set, and only to the log before", async () => {
  const { sendVerificationCode } = await import("./lib/mailer.js")
  const realFetch = globalThis.fetch
  const sent: { url: string; init: RequestInit }[] = []
  const reply = { ok: true, status: 200 }
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return reply
  }) as unknown as typeof fetch
  try {
    await sendVerificationCode("club@syu.ac.kr", "123456")
    assert.equal(sent.length, 0)

    config.resendApiKey = "test-key"
    config.mailFrom = "uniconnect <no-reply@example.com>"
    await sendVerificationCode("club@syu.ac.kr", "123456", "reset")
    assert.equal(sent[0].url, "https://api.resend.com/emails")
    const body = JSON.parse(String(sent[0].init.body))
    assert.deepEqual(body.to, ["club@syu.ac.kr"])
    assert.equal(body.subject, "[uniconnect] 비밀번호 재설정 인증번호")
    assert.match(body.text, /123456/)

    reply.ok = false
    reply.status = 500
    await assert.rejects(sendVerificationCode("club@syu.ac.kr", "123456"), /인증 메일을 보내지 못했어요/)
  } finally {
    globalThis.fetch = realFetch
    config.resendApiKey = undefined
    config.mailFrom = undefined
  }
})

test("proposals, answers and new messages are emailed to the other side", async () => {
  const { mailTransport } = await import("./lib/mailer.js")
  const realPost = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (body) => {
    sent.push(body)
    return new Response(null, { status: 200 })
  }
  config.resendApiKey = "test-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  config.siteUrl = "https://uniconnect.example"
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  try {
    // A new group with a listing, so a brand's offer reaches it.
    const email = "notice@syu.ac.kr"
    const code = await call("POST", "/auth/email-code", { role: "학생단체", email })
    const verified = await call("POST", "/auth/email-code/verify", { email, code: code.data.devCode })
    const signup = await call("POST", "/auth/signup", {
      role: "학생단체",
      name: "알림 받는 동아리",
      type: "공연 동아리",
      school: "삼육대학교",
      email,
      password: "notice-pass-123",
      verificationToken: verified.data.verificationToken,
      agreedToTerms: true,
      over14: true,
    })
    const group = signup.data.token as string
    const listing = (await call("PUT", "/profile", { intro: "알림을 기다리는 공연 동아리예요.", offer: "관객 80명" }, group)).data.profile
    sent.length = 0

    const brand = await login("브랜드")
    await call("POST", "/proposals", { matchId: listing.id }, brand)
    await settle()
    const offerMail = sent.find((mail) => mail.to[0] === email)
    assert.equal(offerMail?.subject, "[uniconnect] 새 협찬 제안이 왔어요")
    assert.match(offerMail?.text ?? "", /오후의 커피에서/)
    assert.match(offerMail?.text ?? "", /https:\/\/uniconnect\.example\/offers/)

    const [offer] = (await call("GET", "/offers", undefined, group)).data.offers
    await call("POST", `/offers/${offer.id}/accept`, undefined, brand) // a brand cannot answer
    await call("POST", `/offers/${offer.id}/accept`, undefined, group)
    await settle()
    assert.ok(sent.some((mail) => mail.to[0] === "hello@afternoon-coffee.kr" && mail.subject.includes("확정")))

    // Messages: one email for a run of unread ones.
    sent.length = 0
    const chat = (await call("POST", "/conversations", { partnerId: "afternoon-coffee" }, group)).data.conversation
    await call("POST", `/conversations/${chat.id}/messages`, { text: "안녕하세요! 일정 이야기해요." }, group)
    await call("POST", `/conversations/${chat.id}/messages`, { text: "편하실 때 답 주세요." }, group)
    await settle()
    const toBrand = sent.filter((mail) => mail.to[0] === "hello@afternoon-coffee.kr")
    assert.equal(toBrand.length, 1)
    assert.match(toBrand[0].text, /알림 받는 동아리: 안녕하세요/)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
    config.siteUrl = undefined
  }
})

test("sessions are stored as hashes, and answers carry security headers", async () => {
  const token = await login("학생단체")
  const sessions = getDatabase().sessions
  assert.ok(sessions.every((session) => /^[0-9a-f]{64}$/.test(session.tokenHash)))
  assert.ok(sessions.every((session) => !("token" in session)))
  assert.ok(!JSON.stringify(sessions).includes(token))

  const response = await fetch(`${baseUrl}/health`)
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/)
  assert.equal(response.headers.get("x-content-type-options"), "nosniff")
  assert.equal(response.headers.get("x-frame-options"), "DENY")
})

test("members change their password from 내 정보, keeping this device logged in", async () => {
  const email = "changer@syu.ac.kr"
  const sent = await call("POST", "/auth/email-code", { role: "학생단체", email })
  const verified = await call("POST", "/auth/email-code/verify", { email, code: sent.data.devCode })
  const form = {
    role: "학생단체",
    name: "비밀번호 바꾸는 동아리",
    type: "공연 동아리",
    school: "삼육대학교",
    email,
    password: "first-pass-123",
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
  }
  // Under 14s cannot sign up.
  assert.equal((await call("POST", "/auth/signup", form)).status, 400)
  const signup = await call("POST", "/auth/signup", { ...form, over14: true })
  assert.equal(signup.status, 201)
  const here = signup.data.token as string
  const other = (await call("POST", "/auth/login", { role: "학생단체", email, password: "first-pass-123" })).data.token

  assert.equal((await call("POST", "/auth/password", { current: "first-pass-123", next: "new" }, here)).status, 400)
  assert.equal((await call("POST", "/auth/password", { current: "wrong", next: "second-pass-123" }, here)).status, 400)
  assert.equal((await call("POST", "/auth/password", { current: "first-pass-123", next: "second-pass-123" })).status, 401)
  const changed = await call("POST", "/auth/password", { current: "first-pass-123", next: "second-pass-123" }, here)
  assert.equal(changed.status, 204)
  assert.equal((await call("GET", "/auth/me", undefined, here)).status, 200)
  assert.equal((await call("GET", "/auth/me", undefined, other)).status, 401)
  const relogin = (password: string) => call("POST", "/auth/login", { role: "학생단체", email, password })
  assert.equal((await relogin("first-pass-123")).status, 401)
  assert.equal((await relogin("second-pass-123")).status, 200)
})

test("older sessions with a plain token keep working, stored as its hash", async () => {
  const { upgradeDatabase } = await import("./store.js")
  const { hashToken } = await import("./middleware/session.js")
  const upgraded = upgradeDatabase({
    events: {},
    sessions: [{ token: "plain-token", accountId: "a", expiresAt: 1 }],
  } as unknown as Parameters<typeof upgradeDatabase>[0])
  assert.deepEqual(upgraded.sessions, [{ tokenHash: hashToken("plain-token"), accountId: "a", expiresAt: 1 }])
})

test("listings take a small PNG, JPEG or WebP logo, and drop it on request", async () => {
  const student = await login("학생단체")
  const draft = { intro: "삼육대학교 밴드 동아리예요. 정기 공연을 열어요.", offer: "관객 150명 · SNS 홍보" }
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  const saved = await call("PUT", "/profile", { ...draft, logo: png }, student)
  assert.equal(saved.status, 200)
  assert.equal(saved.data.profile.logo, png)
  const listed = (await call("GET", "/groups")).data.groups.find((group: { id: string }) => group.id === "syu-muse")
  assert.equal(listed.logo, png)

  // Left out, it stays; SVG, other kinds and big ones are refused.
  assert.equal((await call("PUT", "/profile", draft, student)).data.profile.logo, png)
  const svg = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
  assert.equal((await call("PUT", "/profile", { ...draft, logo: svg }, student)).status, 400)
  assert.equal((await call("PUT", "/profile", { ...draft, logo: "https://example.com/a.png" }, student)).status, 400)
  const big = `data:image/png;base64,${"A".repeat(150_000)}`
  assert.equal((await call("PUT", "/profile", { ...draft, logo: big }, student)).status, 400)

  const removed = await call("PUT", "/profile", { ...draft, logo: null }, student)
  assert.equal(removed.data.profile.logo, undefined)
})

test("deleting an event withdraws its waiting proposals, and a sponsored one stays", async () => {
  const student = await signUpMember("deleter@syu.ac.kr", "deleter-pass-123")
  const brand = await login("브랜드")
  const event = { name: "취소될 공연", date: "2026-12-20", types: ["현금"] }
  const first = (await call("POST", "/events", event, student)).data.event
  await call("POST", "/proposals", { matchId: "afternoon-coffee" }, student)
  const pending = getDatabase().requests.find((item) => item.eventId === first.id)
  assert.equal(pending?.status, "검토 중")

  // Deleted while waiting: the proposal goes from the brand's inbox and the
  // group's sent list.
  assert.equal((await call("DELETE", `/events/${first.id}`, undefined, student)).status, 204)
  assert.equal(getDatabase().requests.some((item) => item.id === pending!.id), false)
  const sent = (await call("GET", "/proposals", undefined, student)).data
  assert.equal(sent.proposals.includes("afternoon-coffee"), false)
  assert.equal((await call("POST", `/requests/${pending!.id}/accept`, undefined, brand)).status, 404)

  // Once the brand accepts, the event cannot be deleted.
  const second = (await call("POST", "/events", { ...event, name: "확정될 공연" }, student)).data.event
  await call("POST", "/proposals", { matchId: "afternoon-coffee" }, student)
  const request = getDatabase().requests.find((item) => item.eventId === second.id)!
  assert.equal((await call("POST", `/requests/${request.id}/accept`, undefined, brand)).status, 200)
  const refused = await call("DELETE", `/events/${second.id}`, undefined, student)
  assert.equal(refused.status, 409)
  assert.match(refused.data.error, /협찬이 확정된 행사/)
})

test("a leaving group's sponsors keep the results of its events", async () => {
  const student = await signUpMember("sponsored@syu.ac.kr", "sponsored-pass-123")
  const brand = await login("브랜드")
  const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id as string
  const event = (await call("POST", "/events", { name: "결과가 남을 공연", date: "2026-12-21", types: ["현금"] }, student)).data.event
  await call("POST", "/proposals", { matchId: "afternoon-coffee" }, student)
  const request = getDatabase().requests.find((item) => item.eventId === event.id)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const { report } = (await call("GET", `/measurements/${event.id}`, undefined, student)).data
  const goals = {
    expectedAudience: 100,
    averageSpend: 10000,
    snsReach: 0,
    valueBreakdown: [{ type: "현금", value: 250000 }],
    targets: report.targets,
    coupon: report.coupon,
  }
  await call("PUT", `/measurements/${event.id}/goals`, goals, student)
  await call("POST", `/check-in/${report.code}/scans`)

  assert.equal((await call("DELETE", "/auth/account", { password: "sponsored-pass-123" }, student)).status, 204)
  const kept = getDatabase().sponsorships[brandId].find((item) => item.id === `sp-${request.id}`)!
  assert.equal(kept.eventId, undefined)
  assert.equal(kept.spend, 250000)
  assert.equal(kept.targetRoas, report.targets.roas)
})
