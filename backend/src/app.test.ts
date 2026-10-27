import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
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
// Every venue count at 0, as a new share of an event starts.
const emptyVenue = (await import("./lib/methods.js")).emptyVenueCounts()

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

// Who runs an account made in a test, as sign-up asks for it.
const testContact = { name: "테스트 담당자", position: "회장", phone: "010-1234-5678" }

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
    "/dashboard",
    "/matches",
    "/matches/cafe-1",
    "/offers",
    "/campaigns",
    "/new?date=2026-12-01",
    "/edit/event-1",
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
  for (const route of ["/nope", "/dashboard/x", "/events/x", "/matches/a/b", "/me/other", "/edit"]) {
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
    contact: testContact,
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

  // The password needs 8 to 64 characters with a letter, a number and a symbol.
  for (const [password, error] of [
    ["club-1!", /8자에서 64자/],
    ["club pass-123", /공백/],
    ["clubpass123", /영문, 숫자, 특수문자/],
  ] as const) {
    const weak = await call("POST", "/auth/signup", { ...form, password, verificationToken: verified.data.verificationToken })
    assert.equal(weak.status, 400, password)
    assert.match(weak.data.error, error)
  }

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
  assert.deepEqual(concert.metrics, { scans: 0, coupons: 0, visits: 0, ...emptyVenue })
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

test("proposals are about an upcoming event, and a sponsor can be asked again for the next one", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()
  const { token: student, listingId: groupId } = await listedMember("proposer@syu.ac.kr", "proposer-pass-123")
  const { token: brand, listingId: brandId } = await listedMember("proposer@proposer-cafe.kr", "proposer-pass-123", "브랜드")

  // Without an upcoming event a proposal would never reach the analytics,
  // so it waits for one.
  const none = await call("POST", "/proposals", { matchId: brandId }, student)
  assert.equal(none.status, 409)
  assert.match(none.data.error, /행사를 먼저/)
  assert.equal((await call("GET", "/proposals", undefined, student)).data.proposals.includes(brandId), false)

  const first = (await call("POST", "/events", { name: "첫 공연", date: addDays(today, 5), types: ["현금"] }, student)).data.event
  const second = (await call("POST", "/events", { name: "둘째 공연", date: addDays(today, 30), types: ["현금"] }, student)).data.event
  assert.equal((await call("POST", "/proposals", { matchId: brandId }, student)).status, 201)
  const mine = () => getDatabase().requests.filter((item) => item.groupName === "proposer 동아리")
  assert.deepEqual(mine().map((item) => item.eventId), [first.id])
  // Sending again while it waits changes nothing.
  assert.equal((await call("POST", "/proposals", { matchId: brandId }, student)).status, 201)
  assert.equal(mine().length, 1)
  assert.equal((await call("GET", "/proposals", undefined, student)).data.confirmed, 0)
  await call("POST", `/requests/${mine()[0].id}/accept`, undefined, brand)
  // Confirmed sponsorships count either way round: the brand's are all its records.
  assert.equal((await call("GET", "/proposals", undefined, student)).data.confirmed, 1)
  const brandAccount = (await call("GET", "/auth/me", undefined, brand)).data.account.id as string
  assert.equal(
    (await call("GET", "/proposals", undefined, brand)).data.confirmed,
    getDatabase().sponsorships[brandAccount].length,
  )
  const again = await call("POST", "/proposals", { matchId: brandId }, student)
  assert.equal(again.status, 409)
  assert.match(again.data.error, /이미 협찬이 확정/)

  // Once the first event is over, the next one can be proposed.
  Object.values(getDatabase().events).flat().find((item) => item.id === first.id)!.date = addDays(today, -2)
  const next = await call("POST", "/proposals", { matchId: brandId }, student)
  assert.equal(next.status, 201)
  assert.deepEqual(mine().map((item) => item.eventId), [first.id, second.id])
  assert.equal(next.data.statuses[brandId], "검토 중")
  // Withdrawing it leaves the accepted one and the brand among the proposals.
  const withdrawn = await call("DELETE", `/proposals/${brandId}`, undefined, student)
  assert.equal(withdrawn.status, 200)
  assert.ok(withdrawn.data.proposals.includes(brandId))
  assert.equal(withdrawn.data.statuses[brandId], "수락")
  assert.equal((await call("DELETE", `/proposals/${brandId}`, undefined, student)).status, 409)

  // A brand needs an upcoming campaign the same way.
  const offer = await call("POST", "/proposals", { matchId: groupId }, brand)
  assert.equal(offer.status, 409)
  assert.match(offer.data.error, /캠페인을 먼저/)
})

test("an event is edited with the same checks, and its proposals, sponsorships and partners follow", async () => {
  const { mailTransport } = await import("./lib/mailer.js")
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()
  const realPost = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (body) => {
    sent.push(body)
    return new Response(null, { status: 200 })
  }
  config.resendApiKey = "test-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  try {
    const groupEmail = "editor@syu.ac.kr"
    const brandEmail = "editor@editor-cafe.kr"
    const { token: group, listingId: groupListing } = await listedMember(groupEmail, "editor-pass-123")
    const { token: brand, listingId: brandListing } = await listedMember(brandEmail, "editor-pass-123", "브랜드")
    const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id as string
    const event = (
      await call("POST", "/events", { name: "고칠 공연", date: addDays(today, 10), people: "80", types: ["현금"] }, group)
    ).data.event
    await call("POST", "/proposals", { matchId: brandListing }, group)
    const [request] = (await call("GET", "/requests", undefined, brand)).data.requests
    await call("POST", `/requests/${request.id}/accept`, undefined, brand)
    sent.length = 0

    // Only its owner edits it, with the checks it was registered with.
    const edit = {
      name: "고친 공연",
      date: addDays(today, 12),
      endDate: addDays(today, 13),
      people: "120",
      types: ["현금", "기타"],
      typeNote: "음향 장비",
    }
    assert.equal((await call("PUT", `/events/${event.id}`, edit, brand)).status, 404)
    assert.equal((await call("PUT", `/events/${event.id}`, { ...edit, types: [] }, group)).status, 400)
    const edited = await call("PUT", `/events/${event.id}`, edit, group)
    assert.equal(edited.status, 200)
    const { name, date, endDate, people, typeNote, status } = edited.data.event
    assert.deepEqual(
      { name, date, endDate, people, typeNote, status },
      { name: edit.name, date: edit.date, endDate: edit.endDate, people: "120명", typeNote: edit.typeNote, status: "집행 예정" },
    )

    // The brand's proposal and sponsorship take the new name and day, and
    // the brand hears what changed.
    const [followed] = (await call("GET", "/requests", undefined, brand)).data.requests
    assert.deepEqual([followed.eventName, followed.eventDate, followed.people], ["고친 공연", addDays(today, 12), "예상 인원 120명"])
    const sponsorship = getDatabase().sponsorships[brandId].find((item) => item.eventId === event.id)!
    assert.deepEqual([sponsorship.eventName, sponsorship.date], ["고친 공연", addDays(today, 12)])
    await settle()
    const mail = sent.find((item) => item.to[0] === brandEmail)
    assert.equal(mail?.subject, "[uniconnect] 행사 정보가 바뀌었어요")
    assert.match(mail?.text ?? "", /이름: 고칠 공연 → 고친 공연/)
    assert.match(mail?.text ?? "", /일정: \S+ \S+ → \S+ \S+ ~ \S+ \S+/)
    assert.match(mail?.text ?? "", /예상 참여 인원: 80명 → 120명/)

    // Back to one day without 기타: the period and the note go.
    const oneDay = await call("PUT", `/events/${event.id}`, { ...edit, endDate: "", types: ["현금"] }, group)
    assert.equal(oneDay.data.event.endDate, undefined)
    assert.equal(oneDay.data.event.typeNote, undefined)
    // A change no partner reads about (the types) sends nothing.
    sent.length = 0
    await call("PUT", `/events/${event.id}`, { ...edit, endDate: "", types: ["현금", "제품"] }, group)
    await settle()
    assert.equal(sent.length, 0)

    // A brand's campaign works the same way round.
    const campaign = (
      await call("POST", "/events", { name: "고칠 캠페인", date: addDays(today, 15), types: ["제품"] }, brand)
    ).data.event
    await call("POST", "/proposals", { matchId: groupListing }, brand)
    const [offer] = (await call("GET", "/offers", undefined, group)).data.offers
    await call("POST", `/offers/${offer.id}/accept`, undefined, group)
    sent.length = 0
    const renamedCampaign = { name: "고친 캠페인", date: addDays(today, 15), types: ["제품"] }
    assert.equal((await call("PUT", `/events/${campaign.id}`, renamedCampaign, brand)).status, 200)
    assert.equal((await call("GET", "/offers", undefined, group)).data.offers[0].campaignName, "고친 캠페인")
    assert.equal(getDatabase().sponsorships[brandId].find((item) => item.id === `sp-${offer.id}`)?.eventName, "고친 캠페인")
    await settle()
    assert.equal(sent.find((item) => item.to[0] === groupEmail)?.subject, "[uniconnect] 캠페인 정보가 바뀌었어요")

    // Once it has begun its dates stay, as its results were counted on them;
    // the rest can still change.
    Object.values(getDatabase().events).flat().find((item) => item.id === event.id)!.date = today
    const moved = await call("PUT", `/events/${event.id}`, { ...edit, date: addDays(today, 20), endDate: "" }, group)
    assert.equal(moved.status, 409)
    assert.match(moved.data.error, /이미 시작한 행사는/)
    const renamed = await call("PUT", `/events/${event.id}`, { ...edit, name: "다시 고친 공연", date: today, endDate: "" }, group)
    assert.equal(renamed.status, 200)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
  }
})

test("a proposal still waiting when its event ends is closed: it can't be answered and holds nothing back", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()
  const { token: group, listingId: groupListing } = await listedMember("closing@syu.ac.kr", "closing-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("closing@closing-cafe.kr", "closing-pass-123", "브랜드")
  const event = (await call("POST", "/events", { name: "끝날 공연", date: addDays(today, 3), types: ["현금"] }, group)).data.event
  await call("POST", "/proposals", { matchId: brandListing }, group)
  const stored = (id: string) => Object.values(getDatabase().events).flat().find((item) => item.id === id)!

  // It waits while its event runs, and is closed from the day after its last day.
  stored(event.id).date = addDays(today, -3)
  stored(event.id).endDate = today
  assert.equal((await call("GET", "/requests", undefined, brand)).data.requests[0].status, "검토 중")
  stored(event.id).endDate = addDays(today, -1)
  const [closed] = (await call("GET", "/requests", undefined, brand)).data.requests
  assert.equal(closed.status, "마감")
  const accepted = await call("POST", `/requests/${closed.id}/accept`, undefined, brand)
  assert.equal(accepted.status, 409)
  assert.match(accepted.data.error, /마감된 제안/)
  assert.equal((await call("POST", `/requests/${closed.id}/decline`, undefined, brand)).status, 409)
  // It stays as it was sent.
  assert.equal(getDatabase().requests.find((item) => item.id === closed.id)?.status, "검토 중")

  // The group sees it closed, and can propose again about its next event.
  const state = (await call("GET", "/proposals", undefined, group)).data
  assert.equal(state.statuses[brandListing], "마감")
  assert.equal(state.sent[0].status, "마감")
  await call("POST", "/events", { name: "다음 공연", date: addDays(today, 20), types: ["현금"] }, group)
  const again = await call("POST", "/proposals", { matchId: brandListing }, group)
  assert.equal(again.status, 201)
  assert.equal(again.data.statuses[brandListing], "검토 중")
  const inbox = (await call("GET", "/requests", undefined, brand)).data.requests as { eventName: string; status: string }[]
  assert.deepEqual(
    inbox.map((item) => [item.eventName, item.status]),
    [
      ["다음 공연", "검토 중"],
      ["끝날 공연", "마감"],
    ],
  )

  // A brand's offer about a campaign that has ended closes the same way.
  const campaign = (await call("POST", "/events", { name: "끝날 캠페인", date: addDays(today, 5), types: ["제품"] }, brand)).data.event
  await call("POST", "/proposals", { matchId: groupListing }, brand)
  stored(campaign.id).date = addDays(today, -1)
  const [offer] = (await call("GET", "/offers", undefined, group)).data.offers
  assert.equal(offer.status, "마감")
  const answer = await call("POST", `/offers/${offer.id}/accept`, undefined, group)
  assert.equal(answer.status, 409)
  assert.match(answer.data.error, /캠페인이 끝나/)
})

test("a sponsorship is called off only when both sides agree, and leaves the brand's results and the event", async () => {
  const { mailTransport } = await import("./lib/mailer.js")
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()
  const realPost = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (body) => {
    sent.push(body)
    return new Response(null, { status: 200 })
  }
  config.resendApiKey = "test-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  try {
    const groupEmail = "calloff@syu.ac.kr"
    const brandEmail = "calloff@calloff-cafe.kr"
    const { token: group } = await listedMember(groupEmail, "calloff-pass-123")
    const { token: brand, listingId: brandListing } = await listedMember(brandEmail, "calloff-pass-123", "브랜드")
    const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id as string
    const event = (await call("POST", "/events", { name: "취소될 공연", date: addDays(today, 7), types: ["현금"] }, group)).data.event
    await call("POST", "/proposals", { matchId: brandListing }, group)
    const [request] = (await call("GET", "/requests", undefined, brand)).data.requests
    await call("POST", `/requests/${request.id}/accept`, undefined, brand)
    // Opening the agreement makes the event's measurement, with the brand's share.
    assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.cancelable, true)
    const measurement = () => getDatabase().measurements.find((item) => item.eventId === event.id)!
    assert.equal(measurement().sponsors.length, 1)
    sent.length = 0

    // One side asks, saying why; only the other side can agree.
    assert.equal((await call("POST", `/agreements/${request.id}/cancel`, { reason: " " }, brand)).status, 400)
    const reason = "매장 공사로 협찬이 어려워요."
    const asked = await call("POST", `/agreements/${request.id}/cancel`, { reason }, brand)
    assert.equal(asked.status, 200)
    assert.deepEqual([asked.data.agreement.cancel.by, asked.data.agreement.cancel.reason], ["brand", reason])
    assert.equal(asked.data.agreement.cancelable, false)
    assert.equal((await call("POST", `/agreements/${request.id}/cancel`, { reason: "저도요" }, group)).status, 409)
    assert.equal((await call("POST", `/agreements/${request.id}/cancel/accept`, undefined, brand)).status, 409)
    await settle()
    const askMail = sent.find((mail) => mail.to[0] === groupEmail)
    assert.equal(askMail?.subject, "[uniconnect] 협찬 취소 요청이 왔어요")
    assert.match(askMail?.text ?? "", /이유: 매장 공사로/)

    // Declined, the sponsorship stays, and it can be asked about again.
    const declined = await call("DELETE", `/agreements/${request.id}/cancel`, undefined, group)
    assert.equal(declined.data.agreement.cancel, undefined)
    assert.equal(getDatabase().requests.find((item) => item.id === request.id)?.status, "수락")
    await call("POST", `/agreements/${request.id}/cancel`, { reason }, brand)

    // Agreed, it is called off: the proposal, the brand's record and share go,
    // and the event is matching again.
    sent.length = 0
    const agreed = await call("POST", `/agreements/${request.id}/cancel/accept`, undefined, group)
    assert.equal(agreed.status, 200)
    assert.ok(agreed.data.agreement.cancel.canceledAt)
    assert.equal(agreed.data.agreement.measure, undefined)
    assert.equal((await call("GET", "/requests", undefined, brand)).data.requests[0].status, "취소됨")
    assert.equal((getDatabase().sponsorships[brandId] ?? []).some((item) => item.id === `sp-${request.id}`), false)
    assert.equal(measurement().sponsors.length, 0)
    const events = (await call("GET", "/events", undefined, group)).data.events as { id: string; status: string }[]
    assert.equal(events.find((item) => item.id === event.id)?.status, "매칭 중")
    await settle()
    assert.equal(sent.find((mail) => mail.to[0] === brandEmail)?.subject, "[uniconnect] 협찬이 취소됐어요")

    // The agreement stays as a record: it reads, but nothing changes it, and
    // the list marks it.
    assert.equal((await call("GET", `/agreements/${request.id}`, undefined, brand)).status, 200)
    assert.equal((await call("POST", `/agreements/${request.id}/confirm`, undefined, brand)).status, 409)
    assert.equal((await call("PUT", `/reviews/${request.id}`, { rating: 5, tags: [], comment: "" }, group)).status, 409)
    const list = (await call("GET", "/agreements", undefined, group)).data.agreements as { id: string; canceled?: boolean }[]
    assert.equal(list.find((item) => item.id === request.id)?.canceled, true)
    // Nothing sponsors the event now, so it can go.
    assert.equal((await call("DELETE", `/events/${event.id}`, undefined, group)).status, 204)

    // The brand can be asked again; once an event is over, its sponsorship
    // can't be called off.
    const later = (await call("POST", "/events", { name: "다음 공연", date: addDays(today, 3), types: ["현금"] }, group)).data.event
    assert.equal((await call("POST", "/proposals", { matchId: brandListing }, group)).status, 201)
    const next = (await call("GET", "/requests", undefined, brand)).data.requests.find(
      (item: { eventName: string }) => item.eventName === "다음 공연",
    )
    await call("POST", `/requests/${next.id}/accept`, undefined, brand)
    Object.values(getDatabase().events).flat().find((item) => item.id === later.id)!.date = addDays(today, -2)
    const over = await call("POST", `/agreements/${next.id}/cancel`, { reason }, group)
    assert.equal(over.status, 409)
    assert.match(over.data.error, /끝난 행사/)

    // The shared demo accounts can't call theirs off.
    const demoBrand = await login("브랜드")
    const [demoAgreement] = (await call("GET", "/agreements", undefined, demoBrand)).data.agreements
    assert.equal((await call("POST", `/agreements/${demoAgreement.id}/cancel`, { reason }, demoBrand)).status, 403)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
  }
})

test("a proposal names the sender's event and carries its note to the partner", async () => {
  const { mailTransport } = await import("./lib/mailer.js")
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()
  const realPost = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (body) => {
    sent.push(body)
    return new Response(null, { status: 200 })
  }
  config.resendApiKey = "test-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  try {
    const { token: group } = await listedMember("noting@syu.ac.kr", "noting-pass-123")
    const brandEmail = "noting@noting-cafe.kr"
    const { token: brand, listingId: brandListing } = await listedMember(brandEmail, "noting-pass-123", "브랜드")
    const event = async (name: string, days: number) =>
      (await call("POST", "/events", { name, date: addDays(today, days), types: ["현금"] }, group)).data.event
    const near = await event("가까운 공연", 5)
    const far = await event("먼 공연", 30)
    const past = await event("지난 공연", -3)
    const note = "공연이 끝나면 SNS 후기까지 함께 올릴게요."

    // Someone else's event, one that has ended, or a note too long: refused.
    const propose = (body: object) => call("POST", "/proposals", { matchId: brandListing, ...body }, group)
    assert.equal((await propose({ eventId: "not-mine" })).status, 404)
    assert.equal((await propose({ eventId: past.id })).status, 409)
    assert.equal((await propose({ message: "가".repeat(301) })).status, 400)

    // It names the later event and takes the note to the brand's inbox and email.
    sent.length = 0
    assert.equal((await propose({ eventId: far.id, message: note })).status, 201)
    const [request] = (await call("GET", "/requests", undefined, brand)).data.requests
    assert.deepEqual([request.eventName, request.message], ["먼 공연", note])
    await settle()
    assert.match(sent.find((mail) => mail.to[0] === brandEmail)?.text ?? "", /메시지: 공연이 끝나면/)
    // The group sees its note under 보낸 제안.
    assert.equal((await call("GET", "/proposals", undefined, group)).data.sent[0].message, note)

    // Without either, it is about the nearest event, with the usual greeting.
    await call("DELETE", `/proposals/${brandListing}`, undefined, group)
    assert.equal((await propose({})).status, 201)
    const [usual] = (await call("GET", "/requests", undefined, brand)).data.requests
    assert.equal(usual.eventName, near.name)
    assert.match(usual.message, /^가까운 공연에 함께해 주세요!/)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
  }
})

test("an account sending messages or proposals in a flood is held back, and others aren't", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { token: group } = await listedMember("flood@syu.ac.kr", "flood-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("flood@flood-cafe.kr", "flood-pass-123", "브랜드")
  const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
  const say = (token: string, text: string) => call("POST", `/conversations/${chat.id}/messages`, { text }, token)

  // Twenty in a minute go; the next waits, with a reason to show.
  for (let count = 1; count <= 20; count += 1) assert.equal((await say(group, `메시지 ${count}`)).status, 201)
  const held = await say(group, "하나 더")
  assert.equal(held.status, 429)
  assert.match(held.data.error, /1분 뒤에/)
  // The other side, counted apart, still answers.
  assert.equal((await say(brand, "천천히 보내 주세요.")).status, 201)

  // Thirty proposals an hour go, even ones that change nothing; then they wait.
  await call("POST", "/events", { name: "많이 보내는 공연", date: addDays(todayInKorea(), 10), types: ["현금"] }, group)
  for (let count = 1; count <= 30; count += 1) {
    assert.equal((await call("POST", "/proposals", { matchId: brandListing }, group)).status, 201)
  }
  const tooMany = await call("POST", "/proposals", { matchId: brandListing }, group)
  assert.equal(tooMany.status, 429)
  assert.match(tooMany.data.error, /제안을 너무 많이/)
})

test("authenticator codes follow RFC 6238, and devices are named by browser and system", async () => {
  const { codeAt, matchStep, stepAt, toBase32 } = await import("./lib/totp.js")
  const { deviceLabel } = await import("./lib/devices.js")
  // RFC 6238's SHA-1 vectors, as six digits.
  const secret = toBase32(Buffer.from("12345678901234567890"))
  assert.equal(codeAt(secret, stepAt(59_000)), "287082")
  assert.equal(codeAt(secret, stepAt(1_111_111_109_000)), "081804")
  assert.equal(codeAt(secret, stepAt(2_000_000_000_000)), "279037")
  // A step either side is taken, a code already used is not.
  const now = 1_111_111_109_000
  assert.equal(matchStep(secret, "081804", now + 30_000), stepAt(now))
  assert.equal(matchStep(secret, "081 804", now), stepAt(now))
  assert.equal(matchStep(secret, "081804", now + 90_000), undefined)
  assert.equal(matchStep(secret, "081804", now, stepAt(now)), undefined)
  assert.equal(
    deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"),
    "Safari · iPhone",
  )
  assert.equal(
    deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"),
    "Chrome · macOS",
  )
  assert.equal(deviceLabel(undefined), "알 수 없는 기기")
})

test("with two-step login on, a password alone doesn't log in, and recovery codes work once", async () => {
  const { codeAt, stepAt } = await import("./lib/totp.js")
  const email = "twostep@syu.ac.kr"
  const password = "twostep-pass-123"
  const token = await signUpMember(email, password)
  const logIn = () => call("POST", "/auth/login", { role: "학생단체", email, password })

  // Set up with the password, then the app's first code; the demo accounts can't.
  assert.equal((await call("POST", "/auth/two-factor/setup", { password: DEMO_PASSWORD }, await login("학생단체"))).status, 403)
  assert.equal((await call("POST", "/auth/two-factor/setup", { password: "wrong-pass-1!" }, token)).status, 400)
  const { secret, url } = (await call("POST", "/auth/two-factor/setup", { password }, token)).data
  assert.match(url, /^otpauth:\/\/totp\/uniconnect%3Atwostep%40syu\.ac\.kr\?secret=[A-Z2-7]+&issuer=uniconnect/)
  assert.equal((await call("POST", "/auth/two-factor/enable", { code: "000000" }, token)).status, 400)
  const code = () => codeAt(secret, stepAt(Date.now()))
  const enabled = (await call("POST", "/auth/two-factor/enable", { code: code() }, token)).data
  assert.equal(enabled.account.twoFactorOn, true)
  assert.equal(enabled.account.twoFactor, undefined)
  assert.equal(enabled.recoveryCodes.length, 10)
  assert.match(enabled.recoveryCodes[0], /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)

  // The password now gives a ticket, not a session; the ticket wants a code.
  const first = (await logIn()).data
  assert.equal(first.twoFactor, true)
  assert.equal(first.token, undefined)
  const withCode = (body: object) => call("POST", "/auth/login/code", { email, ticket: first.ticket, ...body })
  assert.equal((await call("POST", "/auth/login/code", { email, ticket: "nope", code: code() })).status, 401)
  // The code used to turn it on doesn't work twice; a recovery code does, once.
  assert.equal((await withCode({ code: code() })).status, 401)
  const recovered = await withCode({ code: enabled.recoveryCodes[0].toLowerCase() })
  assert.equal(recovered.status, 200)
  assert.equal(recovered.data.recoveryLeft, 9)
  assert.equal((await call("GET", "/auth/me", undefined, recovered.data.token)).status, 200)
  const again = (await logIn()).data
  assert.equal((await call("POST", "/auth/login/code", { email, ticket: again.ticket, code: enabled.recoveryCodes[0] })).status, 401)

  // Five wrong codes end the ticket.
  const third = (await logIn()).data
  for (let count = 1; count <= 4; count += 1) {
    assert.equal((await call("POST", "/auth/login/code", { email, ticket: third.ticket, code: "111111" })).status, 401)
  }
  const ended = await call("POST", "/auth/login/code", { email, ticket: third.ticket, code: "111111" })
  assert.match(ended.data.error, /너무 많이/)
  assert.equal((await call("POST", "/auth/login/code", { email, ticket: third.ticket, code: enabled.recoveryCodes[1] })).status, 401)

  // A password reset by email still asks for the code, and ends the other logins.
  const newPassword = "twostep-pass-456!"
  await call("POST", "/auth/password-reset/code", { email })
  const resetCode = getDatabase().emailCodes.find((item) => item.email === email && item.purpose === "reset")!.code
  const reset = (await call("POST", "/auth/password-reset", { email, code: resetCode, password: newPassword })).data
  assert.equal(reset.twoFactor, true)
  assert.equal(reset.token, undefined)
  assert.equal((await call("GET", "/auth/me", undefined, recovered.data.token)).status, 401)
  const afterReset = await call("POST", "/auth/login/code", { email, ticket: reset.ticket, code: enabled.recoveryCodes[2] })
  assert.equal(afterReset.status, 200)

  // Turning it off takes the password and a code.
  const session = afterReset.data.token
  assert.equal((await call("POST", "/auth/two-factor/disable", { password: newPassword, code: "111111" }, session)).status, 400)
  const off = await call("POST", "/auth/two-factor/disable", { password: newPassword, code: enabled.recoveryCodes[3] }, session)
  assert.equal(off.status, 200)
  assert.equal(off.data.account.twoFactorOn, undefined)
  assert.ok((await call("POST", "/auth/login", { role: "학생단체", email, password: newPassword })).data.token)
})

test("a student council sees the clubs that linked with its code, read-only, until either unlinks", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const council = await signUpMember("council@syu.ac.kr", "council-pass-123")
  getDatabase().accounts.find((item) => item.email === "council@syu.ac.kr")!.type = "총학생회"
  const { token: club } = await listedMember("council-club@syu.ac.kr", "council-pass-123")
  const other = await signUpMember("council-other@syu.ac.kr", "council-pass-123")

  // Only councils have the page; the code is made the first time.
  assert.equal((await call("GET", "/council/clubs", undefined, club)).status, 403)
  const first = (await call("GET", "/council/clubs", undefined, council)).data
  assert.match(first.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.deepEqual(first.clubs, [])

  // A club links with the code, typed any way; wrong codes and the demo accounts don't.
  assert.equal((await call("POST", "/council/links", { code: "AAAA-AAAA" }, club)).status, 400)
  assert.equal((await call("POST", "/council/links", { code: first.code }, await login("학생단체"))).status, 403)
  assert.equal((await call("POST", "/council/links", { code: first.code }, council)).status, 400)
  const linked = await call("POST", "/council/links", { code: first.code.toLowerCase().replace("-", "") }, club)
  assert.equal(linked.status, 201)
  assert.equal(linked.data.councils[0].type, "총학생회")
  assert.equal((await call("POST", "/council/links", { code: first.code }, club)).status, 409)

  // The council reads the club's coming events, proposals and results, and nothing private.
  await call("POST", "/events", { name: "소속 공연", date: addDays(todayInKorea(), 12), types: ["현금"] }, club)
  const { clubs } = (await call("GET", "/council/clubs", undefined, council)).data
  assert.equal(clubs.length, 1)
  assert.deepEqual(clubs[0].events.map((event: { name: string }) => event.name), ["소속 공연"])
  assert.deepEqual(clubs[0].results, { scans: 0, coupons: 0, visits: 0 })
  assert.equal(typeof clubs[0].openProposals, "number")
  for (const secret of ["010-1234-5678", "council-club@syu.ac.kr", "passwordHash", "contact"]) {
    assert.equal(JSON.stringify(clubs).includes(secret), false, secret)
  }
  // Clubs that didn't link don't show.
  assert.equal(clubs.some((item: { id: string }) => item.id === getDatabase().accounts.find((a) => a.email === "council-other@syu.ac.kr")!.id), false)
  void other

  // A new code links no more clubs; those linked stay.
  const renewed = (await call("POST", "/council/code", undefined, council)).data.code
  assert.notEqual(renewed, first.code)
  assert.equal((await call("POST", "/council/links", { code: first.code }, other)).status, 400)
  assert.equal((await call("GET", "/council/clubs", undefined, council)).data.clubs.length, 1)

  // The club unlinks, and the council no longer sees it; or the council takes it off.
  const councilId = linked.data.councils[0].id
  assert.deepEqual((await call("DELETE", `/council/links/${councilId}`, undefined, club)).data.councils, [])
  assert.deepEqual((await call("GET", "/council/clubs", undefined, council)).data.clubs, [])
  await call("POST", "/council/links", { code: renewed }, club)
  const clubId = (await call("GET", "/council/clubs", undefined, council)).data.clubs[0].id
  assert.equal((await call("DELETE", `/council/clubs/${clubId}`, undefined, council)).status, 204)
  assert.deepEqual((await call("GET", "/council/links", undefined, club)).data.councils, [])

  // When the council leaves, its clubs are unlinked.
  await call("POST", "/council/links", { code: renewed }, club)
  assert.equal((await call("DELETE", "/auth/account", { password: "council-pass-123" }, council)).status, 204)
  assert.deepEqual((await call("GET", "/council/links", undefined, club)).data.councils, [])
})

test("a linked Kakao account logs in, with the state bound to the browser and no token in an address", async () => {
  const { socialAuth } = await import("./routes/social.js")
  const realExchange = socialAuth.exchange
  const saved = { kakao: config.kakaoClientId, naverId: config.naverClientId, naverSecret: config.naverClientSecret }
  const origin = baseUrl.replace(/\/api$/, "")
  // Starts a flow, as the page does: the provider's address and the state cookie.
  const start = async (intent: "login" | "link", token?: string) => {
    const response = await fetch(`${baseUrl}/auth/social/kakao/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ intent }),
    })
    const { url } = (await response.json()) as { url: string }
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""
    return { url: new URL(url), cookie }
  }
  // The provider sends the browser back.
  const back = async (state: string, cookie: string, code = "auth-code") => {
    const response = await fetch(`${baseUrl}/auth/social/kakao/callback?code=${code}&state=${state}`, {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: "manual",
    })
    // The cookie it sets for the page, besides clearing the state's.
    const set = response.headers.getSetCookie().find((item) => item.startsWith("uc_social_login=") && !item.startsWith("uc_social_login=;"))
    return { to: response.headers.get("location") ?? "", cookie: set?.split(";")[0] ?? "" }
  }
  try {
    // Without keys there is nothing to offer.
    config.kakaoClientId = undefined
    config.naverClientId = undefined
    assert.deepEqual((await call("GET", "/auth/social")).data.providers, [])
    assert.equal((await call("POST", "/auth/social/kakao/start", { intent: "login" })).status, 404)
    // Kakao with its key; Naver not until its secret is set too.
    config.kakaoClientId = "kakao-rest-key"
    config.naverClientId = "naver-id"
    config.naverClientSecret = undefined
    assert.deepEqual((await call("GET", "/auth/social")).data.providers, ["kakao"])
    socialAuth.exchange = async (_provider, code) => (code === "other" ? "999" : "4242")

    // The owner links its Kakao account from 내 정보.
    const owner = await signUpMember("social@syu.ac.kr", "social-pass-123")
    assert.equal((await call("POST", "/auth/social/kakao/start", { intent: "link" })).status, 401)
    assert.equal((await call("POST", "/auth/social/kakao/start", { intent: "link" }, await login("학생단체"))).status, 403)
    const link = await start("link", owner)
    assert.equal(link.url.origin, "https://kauth.kakao.com")
    assert.equal(link.url.searchParams.get("client_id"), "kakao-rest-key")
    assert.equal(link.url.searchParams.get("redirect_uri"), `${origin}/api/auth/social/kakao/callback`)
    assert.match(link.cookie, /^uc_social_state=/)
    const state = link.url.searchParams.get("state")!
    // Another browser, without the cookie, can't finish it.
    assert.equal((await back(state, "")).to, "/?social=error")
    assert.equal((await back(state, link.cookie)).to, "/me?social=linked-kakao")
    // A state works once.
    assert.equal((await back(state, link.cookie)).to, "/?social=error")
    const me = (await call("GET", "/auth/me", undefined, owner)).data.account
    assert.deepEqual(me.socialLinks, ["kakao"])
    assert.equal(JSON.stringify(me).includes("4242"), false)

    // Logging in: the callback hands the page a one-time code in a cookie,
    // and its address carries nothing but the outcome.
    const flow = await start("login")
    const done = await back(flow.url.searchParams.get("state")!, flow.cookie)
    assert.equal(done.to, "/?social=login")
    assert.match(done.cookie, /^uc_social_login=/)
    const complete = (cookie: string) =>
      fetch(`${baseUrl}/auth/social/complete`, { method: "POST", headers: cookie ? { Cookie: cookie } : {} })
    const session = (await (await complete(done.cookie)).json()) as { token: string; account: { email: string } }
    assert.equal(session.account.email, "social@syu.ac.kr")
    assert.equal((await call("GET", "/auth/me", undefined, session.token)).status, 200)
    assert.equal((await complete(done.cookie)).status, 401)
    assert.equal((await complete("")).status, 401)

    // A Kakao account linked to no one logs no one in, and links to one account only.
    const stranger = await start("login")
    assert.equal((await back(stranger.url.searchParams.get("state")!, stranger.cookie, "other")).to, "/?social=unlinked")
    const second = await signUpMember("social-two@syu.ac.kr", "social-pass-123")
    const taken = await start("link", second)
    assert.equal((await back(taken.url.searchParams.get("state")!, taken.cookie)).to, "/me?social=link-taken")

    // Unlinked, it no longer logs in.
    assert.equal((await call("DELETE", "/auth/social/kakao", undefined, owner)).data.account.socialLinks, undefined)
    const after = await start("login")
    assert.equal((await back(after.url.searchParams.get("state")!, after.cookie)).to, "/?social=unlinked")
  } finally {
    socialAuth.exchange = realExchange
    config.kakaoClientId = saved.kakao
    config.naverClientId = saved.naverId
    config.naverClientSecret = saved.naverSecret
  }
})

test("an owner invites co-admins, who log in with their own password and can't do the owner's part", async () => {
  const ownerPassword = "team-pass-123"
  const owner = await signUpMember("team@syu.ac.kr", ownerPassword)
  const join = (body: object) => call("POST", "/team/join", body)

  // The owner invites by email; the code comes back only in development.
  assert.equal((await call("POST", "/team/invites", { name: "부회장", email: "team@syu.ac.kr" }, owner)).status, 409)
  assert.equal((await call("POST", "/team/invites", { name: "부회장", email: "vice@gmail.com" }, owner)).status, 400)
  const invited = await call("POST", "/team/invites", { name: "부회장", email: "vice@syu.ac.kr" }, owner)
  assert.equal(invited.status, 201)
  assert.match(invited.data.devCode, /^\d{6}$/)
  assert.deepEqual(invited.data.team.invites.map((item: { email: string }) => item.email), ["vice@syu.ac.kr"])
  assert.equal(JSON.stringify(invited.data.team).includes("codeHash"), false)
  assert.equal((await call("POST", "/team/invites", { name: "x", email: "x@syu.ac.kr" }, await login("학생단체"))).status, 403)

  // A wrong code doesn't join; the right one does, with the person's own password.
  assert.equal((await join({ email: "vice@syu.ac.kr", code: "000000", password: "vice-pass-123" })).status, 400)
  const joined = await join({ email: "vice@syu.ac.kr", code: invited.data.devCode, password: "vice-pass-123" })
  assert.equal(joined.status, 201)
  assert.equal(joined.data.account.email, "team@syu.ac.kr")
  assert.deepEqual(joined.data.account.asMember, { id: joined.data.account.asMember.id, name: "부회장", email: "vice@syu.ac.kr" })
  assert.equal((await join({ email: "vice@syu.ac.kr", code: invited.data.devCode, password: "vice-pass-123" })).status, 400)
  // The email is taken for sign-up now.
  assert.equal((await call("POST", "/auth/email-code", { role: "학생단체", email: "vice@syu.ac.kr" })).status, 409)

  // The co-admin logs in to the same account, and works in it.
  const vice = (await call("POST", "/auth/login", { role: "학생단체", email: "vice@syu.ac.kr", password: "vice-pass-123" })).data
  assert.equal(vice.account.id, joined.data.account.id)
  assert.equal(vice.account.asMember.name, "부회장")
  assert.equal((await call("POST", "/events", { name: "함께 여는 공연", date: "2099-05-01", types: ["현금"] }, vice.token)).status, 201)
  const ownersEvents = (await call("GET", "/events", undefined, owner)).data.events as { name: string }[]
  assert.ok(ownersEvents.some((event) => event.name === "함께 여는 공연"))
  assert.equal((await call("GET", "/auth/me", undefined, owner)).data.account.asMember, undefined)

  // The owner's part stays the owner's.
  for (const [method, route, body] of [
    ["DELETE", "/auth/account", { password: "vice-pass-123" }],
    ["POST", "/auth/email/code", { email: "new@syu.ac.kr", password: "vice-pass-123" }],
    ["POST", "/auth/two-factor/setup", { password: "vice-pass-123" }],
    ["POST", "/team/invites", { name: "총무", email: "treasurer@syu.ac.kr" }],
  ] as const) {
    assert.equal((await call(method, route, body, vice.token)).status, 403, route)
  }
  // Each changes its own password.
  assert.equal((await call("POST", "/auth/password", { current: "vice-pass-123", next: "vice-pass-456!" }, vice.token)).status, 204)
  assert.equal((await call("POST", "/auth/login", { role: "학생단체", email: "team@syu.ac.kr", password: ownerPassword })).status, 200)
  assert.equal((await call("POST", "/auth/login", { role: "학생단체", email: "vice@syu.ac.kr", password: "vice-pass-123" })).status, 401)

  // The owner's device list names the co-admin's logins; the co-admin sees its own.
  const ownerSessions = (await call("GET", "/auth/sessions", undefined, owner)).data.sessions as { member?: string }[]
  assert.ok(ownerSessions.some((session) => session.member === "부회장"))
  const viceSessions = (await call("GET", "/auth/sessions", undefined, vice.token)).data.sessions as { member?: string }[]
  assert.ok(viceSessions.length >= 1 && viceSessions.every((session) => session.member === undefined))

  // The data download lists the team without passwords.
  const exported = (await call("GET", "/auth/export", undefined, owner)).data
  assert.deepEqual(exported.team.map((item: { name: string }) => item.name), ["부회장"])
  assert.equal(JSON.stringify(exported).includes("passwordHash"), false)

  // Taking the co-admin off ends its logins at once.
  const memberId = vice.account.asMember.id
  assert.equal((await call("DELETE", `/team/members/${memberId}`, undefined, owner)).status, 200)
  assert.equal((await call("GET", "/auth/me", undefined, vice.token)).status, 401)
  assert.equal((await call("POST", "/auth/login", { role: "학생단체", email: "vice@syu.ac.kr", password: "vice-pass-456!" })).status, 401)
})

test("the device list shows each login, and logs out one or all the others", async () => {
  const email = "devices@syu.ac.kr"
  const password = "devices-pass-123"
  await signUpMember(email, password)
  const logInWith = async (agent: string) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": agent },
      body: JSON.stringify({ role: "학생단체", email, password }),
    })
    return ((await response.json()) as { token: string }).token
  }
  const mac = await logInWith("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")
  const phone = await logInWith("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36")
  const tablet = await logInWith("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
  const listed = (await call("GET", "/auth/sessions", undefined, mac)).data.sessions
  assert.deepEqual(listed[0], { ...listed[0], device: "Chrome · macOS", current: true })
  assert.ok(listed[0].lastUsedAt && listed[0].createdAt)
  const devices = listed.map((session: { device: string }) => session.device)
  assert.ok(devices.includes("Samsung Internet · Android") && devices.includes("Safari · iPad"))
  // Session ids stand for sessions, never their tokens.
  assert.ok(listed.every((session: { id: string }) => /^[0-9a-f]{16}$/.test(session.id)))

  // One device out: its login ends.
  const phoneId = listed.find((session: { device: string }) => session.device.startsWith("Samsung")).id
  assert.equal((await call("DELETE", `/auth/sessions/${phoneId}`, undefined, mac)).status, 204)
  assert.equal((await call("GET", "/auth/me", undefined, phone)).status, 401)
  assert.equal((await call("DELETE", `/auth/sessions/${phoneId}`, undefined, mac)).status, 404)
  // All the others out: this one stays.
  assert.equal((await call("DELETE", "/auth/sessions", undefined, mac)).status, 204)
  assert.equal((await call("GET", "/auth/me", undefined, tablet)).status, 401)
  assert.equal((await call("GET", "/auth/sessions", undefined, mac)).data.sessions.length, 1)
  // Another account's sessions aren't found, and the shared demo accounts have no list.
  const other = await signUpMember("devices-other@syu.ac.kr", password)
  assert.equal((await call("DELETE", `/auth/sessions/${listed[0].id}`, undefined, other)).status, 404)
  assert.equal((await call("GET", "/auth/sessions", undefined, await login("학생단체"))).status, 403)
})

test("an open conversation hears of new messages and reads as they happen", async () => {
  const { chatWait } = await import("./routes/conversations.js")
  const { token: group } = await listedMember("live@syu.ac.kr", "live-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("live@live-cafe.kr", "live-pass-123", "브랜드")
  const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
  const read = (token: string, since?: string) =>
    call("GET", `/conversations/${chat.id}${since ? `?since=${since}` : ""}`, undefined, token)
  const saved = { ...chatWait }
  try {
    chatWait.holdMs = 3000
    chatWait.tickMs = 50

    // A page showing the latest waits, and hears of a reply at once.
    const { stamp } = (await read(group)).data
    assert.match(stamp, /^[\w-]{16}$/)
    const started = Date.now()
    const waiting = read(group, stamp)
    await new Promise((resolve) => setTimeout(resolve, 150))
    await call("POST", `/conversations/${chat.id}/messages`, { text: "지금 볼게요" }, brand)
    const heard = (await waiting).data
    assert.ok(Date.now() - started < 1500)
    assert.equal(heard.conversation.messages.at(-1).text, "지금 볼게요")
    assert.notEqual(heard.stamp, stamp)

    // An older stamp answers at once.
    const begun = Date.now()
    assert.equal((await read(group, stamp)).data.conversation.messages.length, 1)
    assert.ok(Date.now() - begun < 500)

    // The sender hears when its message is read.
    await call("POST", `/conversations/${chat.id}/messages`, { text: "고마워요" }, group)
    const mine = (await read(group)).data
    assert.equal(mine.conversation.messages.at(-1).read, false)
    const waitingRead = read(group, mine.stamp)
    await new Promise((resolve) => setTimeout(resolve, 150))
    await read(brand)
    assert.equal((await waitingRead).data.conversation.messages.at(-1).read, true)

    // With nothing new, it answers the same when the hold runs out.
    chatWait.holdMs = 300
    const quiet = (await read(group)).data.stamp
    const from = Date.now()
    const after = (await read(group, quiet)).data
    assert.ok(Date.now() - from >= 280)
    assert.equal(after.stamp, quiet)
  } finally {
    Object.assign(chatWait, saved)
  }
})

test("photos and PDFs go in a conversation, only its two sides open them, and they go with their message", async () => {
  const { existsSync } = await import("node:fs")
  const { chatFiles, uploadsFolder } = await import("./lib/photos.js")
  const { token: group } = await listedMember("files@syu.ac.kr", "files-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("files@files-cafe.kr", "files-pass-123", "브랜드")
  const { token: stranger } = await listedMember("files@other-cafe.kr", "files-pass-123", "브랜드")
  const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
  const files = `/conversations/${chat.id}/attachments`
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  const pdfOf = (bytes: number) =>
    `data:application/pdf;base64,${Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(bytes - 9, 32)]).toString("base64")}`
  const open = (token: string | undefined, file: string) =>
    fetch(`${baseUrl}${files}/${file}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

  // Only photos and real PDFs of 2 MB at most, and none from the shared demo accounts.
  assert.equal((await call("POST", files, { file: "data:application/pdf;base64,aGVsbG8=", name: "a.pdf" }, group)).status, 400)
  assert.equal((await call("POST", files, { file: png.replace("image/png", "image/gif") }, group)).status, 400)
  assert.equal((await call("POST", files, { file: pdfOf(2 * 1024 * 1024 + 1), name: "big.pdf" }, group)).status, 400)
  const demoBrand = await login("브랜드")
  const [demoChat] = (await call("GET", "/conversations", undefined, demoBrand)).data.conversations
  assert.equal((await call("POST", `/conversations/${demoChat.id}/attachments`, { file: png }, demoBrand)).status, 403)

  // A photo goes as a message of its own, by the name it was picked with.
  const sent = await call("POST", files, { file: png, name: "C:\\fakepath\\poster.png" }, group)
  assert.equal(sent.status, 201)
  const [photo] = sent.data.conversation.messages
  assert.equal(photo.text, "")
  assert.match(photo.attachment.file, /^[\w-]+\.png$/)
  assert.deepEqual(
    [photo.attachment.name, photo.attachment.type, photo.attachment.size],
    ["poster.png", "image", Buffer.from(png.split(",")[1], "base64").length],
  )
  const listed = (await call("GET", "/conversations", undefined, brand)).data.conversations
  assert.equal(listed.find((item: { id: string }) => item.id === chat.id).lastMessage.attachment, "image")

  // Both sides open it, and no one else.
  const seen = await open(brand, photo.attachment.file)
  assert.equal(seen.status, 200)
  assert.equal(seen.headers.get("content-type"), "image/png")
  assert.equal(Buffer.from(await seen.arrayBuffer()).toString("base64"), png.split(",")[1])
  assert.equal((await open(group, photo.attachment.file)).status, 200)
  assert.equal((await open(stranger, photo.attachment.file)).status, 404)
  assert.equal((await open(undefined, photo.attachment.file)).status, 401)
  assert.equal((await open(brand, "..%2Fdb.json")).status, 404)

  // A PDF comes named to be saved.
  const pdf = (await call("POST", files, { file: pdfOf(1000), name: "제안서.pdf" }, brand)).data.conversation.messages.at(-1)
  assert.equal(pdf.attachment.type, "pdf")
  const saved = await open(group, pdf.attachment.file)
  assert.equal(saved.headers.get("content-type"), "application/pdf")
  assert.match(saved.headers.get("content-disposition") ?? "", /^attachment;.*filename\*=UTF-8''%EC%A0%9C%EC%95%88%EC%84%9C\.pdf/)

  // A file isn't edited; deleting its message takes the file away too.
  assert.equal((await call("PUT", `/conversations/${chat.id}/messages/${photo.id}`, { text: "고친 글" }, group)).status, 409)
  const removed = (await call("DELETE", `/conversations/${chat.id}/messages/${photo.id}`, undefined, group)).data
  assert.equal(removed.conversation.messages[0].attachment, undefined)
  assert.equal((await open(brand, photo.attachment.file)).status, 404)
  assert.ok(!existsSync(path.join(uploadsFolder(chatFiles(chat.id)), photo.attachment.file)))

  // Each account keeps 10 MB of files at most.
  for (let count = 1; count <= 5; count += 1) {
    assert.equal((await call("POST", files, { file: pdfOf(2 * 1024 * 1024), name: `${count}.pdf` }, group)).status, 201)
  }
  const full = await call("POST", files, { file: png }, group)
  assert.equal(full.status, 409)
  assert.match(full.data.error, /10MB/)

  // When the group leaves, the conversation's files go with it.
  assert.equal((await call("DELETE", "/auth/account", { password: "files-pass-123" }, group)).status, 204)
  assert.ok(!existsSync(uploadsFolder(chatFiles(chat.id))))
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
  measurement.metrics = { scans: 3, coupons: 2, visits: 1, ...emptyVenue, stamps: 4 }
  measurement.passes = { a: { coupon: "UC-AAAAAA", visit: true }, b: { coupon: "UC-BBBBBB" }, c: {} }
  assert.equal(syncSponsors(database, measurement), true)
  assert.equal(syncSponsors(database, measurement), false)
  const [sponsor] = measurement.sponsors
  assert.equal(sponsor.id, "sp-busking")
  assert.equal(sponsor.staffPin, measurement.staffPin)
  assert.deepEqual(sponsor.coupon, measurement.goals.coupon)
  assert.deepEqual(sponsor.metrics, { coupons: 2, visits: 1, ...emptyVenue, stamps: 4 })
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

test("an operator's answer is emailed to the asker, and stays news until the asker has seen it", async () => {
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
  const answer = (id: string, text: string) =>
    fetch(`${baseUrl}/admin/inquiries/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
      body: JSON.stringify({ answer: text }),
    })
  try {
    const email = "asker@syu.ac.kr"
    const member = await signUpMember(email, "asker-pass-123")
    const asked = await call("POST", "/inquiries", { category: "계정 · 가입", question: "로그인 이메일을 바꿀 수 있나요?" }, member)
    const id = asked.data.inquiry.id as string
    // Only what the answer sends, not the sign-up code.
    sent.length = 0

    assert.equal((await answer(id, "내 정보의 '로그인 이메일 바꾸기'에서 바꿀 수 있어요.")).status, 200)
    await settle()
    const mail = sent.find((item) => item.to[0] === email)
    assert.equal(mail?.subject, "[uniconnect] 문의에 답변이 왔어요")
    assert.match(mail?.text ?? "", /답변: 내 정보의 '로그인 이메일 바꾸기'/)
    assert.match(mail?.text ?? "", /https:\/\/uniconnect\.example\/faq/)
    const [unread] = (await call("GET", "/inquiries", undefined, member)).data.inquiries
    assert.equal(unread.answerReadAt, undefined)

    // Seen, it is no longer news; the same answer again changes nothing.
    const [read] = (await call("POST", "/inquiries/read", undefined, member)).data.inquiries
    assert.ok(read.answerReadAt)
    sent.length = 0
    await answer(id, "내 정보의 '로그인 이메일 바꾸기'에서 바꿀 수 있어요.")
    await settle()
    assert.equal(sent.length, 0)
    assert.ok((await call("GET", "/inquiries", undefined, member)).data.inquiries[0].answerReadAt)

    // A changed answer is news again.
    await answer(id, "내 정보에서 바꿀 수 있고, 새 이메일로 인증번호가 가요.")
    await settle()
    assert.equal(sent.filter((item) => item.to[0] === email).length, 1)
    assert.equal((await call("GET", "/inquiries", undefined, member)).data.inquiries[0].answerReadAt, undefined)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
    config.siteUrl = undefined
  }
})

test("members report and block one another, and operators act on the reports", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const admin = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(baseUrl + route, {
      method,
      headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const reply = await response.text()
    return { status: response.status, data: reply ? JSON.parse(reply) : null }
  }
  const brandEmail = "safety@safety-cafe.kr"
  const { token: group, listingId: groupListing } = await listedMember("safety@syu.ac.kr", "safety-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember(brandEmail, "safety-pass-123", "브랜드")
  const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id as string
  const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
  const said = await call("POST", `/conversations/${chat.id}/messages`, { text: "광고 문자를 보내 드려요" }, brand)
  const message = said.data.conversation.messages.at(-1)
  const report = (body: object, token = group) => call("POST", "/reports", body, token)
  const aboutMessage = { kind: "message", conversationId: chat.id, messageId: message.id }

  // A report needs a listed reason, and words for 기타; it goes once while it waits.
  assert.equal((await report({ ...aboutMessage, reason: "그냥" })).status, 400)
  assert.equal((await report({ ...aboutMessage, reason: "기타", detail: "" })).status, 400)
  assert.equal((await report({ ...aboutMessage, reason: "스팸 · 광고" }, brand)).status, 404)
  assert.equal((await report({ ...aboutMessage, reason: "스팸 · 광고" })).status, 201)
  assert.equal((await report({ ...aboutMessage, reason: "스팸 · 광고" })).status, 409)
  const aboutBrand = { kind: "account", listingId: brandListing, reason: "사기 의심", detail: "선입금을 요구했어요." }
  assert.equal((await report(aboutBrand)).status, 201)
  assert.equal((await report(aboutBrand, await login("학생단체"))).status, 403)

  // A review taken down leaves the listing's reviews.
  getDatabase().reviews.push({
    id: "safety-review:brand",
    proposalId: "safety-review",
    side: "brand",
    aboutId: groupListing,
    authorAccountId: brandId,
    authorName: "safety 카페",
    eventName: "신고할 공연",
    rating: 1,
    tags: [],
    comment: "거친 말이 담긴 후기",
    createdAt: new Date().toISOString(),
  })
  const [shown] = (await call("GET", `/reviews?about=${groupListing}`)).data.reviews
  assert.equal((await report({ kind: "review", reviewKey: shown.key, reason: "욕설 · 괴롭힘" })).status, 201)

  // Operators see what was reported, with the text as it was, waiting ones first.
  assert.equal((await call("GET", "/admin/reports")).status, 403)
  const listed = (await admin("GET", "/admin/reports")).data.reports as {
    id: string
    target: { kind: string }
    excerpt?: string
    about: { name: string }
  }[]
  const find = (kind: string) => listed.find((item) => item.target.kind === kind)!
  assert.equal(find("message").excerpt, "광고 문자를 보내 드려요")
  assert.equal(find("account").about.name, "safety 카페")
  assert.equal((await admin("POST", `/admin/reports/${find("review").id}/resolve`, { action: "hide-review" })).status, 200)
  assert.equal((await call("GET", `/reviews?about=${groupListing}`)).data.reviews.length, 0)
  assert.equal((await admin("POST", `/admin/reports/${find("account").id}/resolve`, { action: "dismiss" })).status, 200)

  // Blocking hides the two from each other: listings, proposals, conversations.
  assert.equal((await call("POST", "/blocks", { listingId: brandListing }, group)).status, 201)
  const ids = async (route: string, key: string, token: string) =>
    ((await call("GET", route, undefined, token)).data[key] as { id: string }[]).map((item) => item.id)
  assert.equal((await ids("/brands", "brands", group)).includes(brandListing), false)
  assert.equal((await ids("/groups", "groups", brand)).includes(groupListing), false)
  await call("POST", "/events", { name: "막힌 공연", date: addDays(todayInKorea(), 10), types: ["현금"] }, group)
  assert.equal((await call("POST", "/proposals", { matchId: brandListing }, group)).status, 404)
  assert.deepEqual((await call("GET", "/conversations", undefined, brand)).data.conversations, [])
  assert.equal((await call("POST", `/conversations/${chat.id}/messages`, { text: "왜요?" }, brand)).status, 404)
  assert.deepEqual((await call("GET", "/blocks", undefined, group)).data.blocked, [{ listingId: brandListing, name: "safety 카페" }])
  assert.equal((await call("DELETE", `/blocks/${brandListing}`, undefined, group)).status, 204)
  assert.equal((await ids("/brands", "brands", group)).includes(brandListing), true)

  // Suspended, the account can't log in or stay logged in, and shows to no one.
  assert.equal((await admin("POST", `/admin/reports/${find("message").id}/resolve`, { action: "suspend" })).status, 200)
  assert.equal((await call("GET", "/auth/me", undefined, brand)).status, 401)
  const credentials = { role: "브랜드", email: brandEmail, password: "safety-pass-123" }
  const refused = await call("POST", "/auth/login", credentials)
  assert.equal(refused.status, 403)
  assert.match(refused.data.error, /정지된 계정/)
  assert.equal((await ids("/brands", "brands", group)).includes(brandListing), false)
  const { suspended } = (await admin("GET", "/admin/reports")).data
  assert.deepEqual(suspended.map((item: { id: string }) => item.id), [brandId])
  assert.equal((await admin("POST", `/admin/accounts/${brandId}/unsuspend`)).status, 204)
  assert.equal((await call("POST", "/auth/login", credentials)).status, 200)
})

test("members save listings they see to their 찜 list, which follows blocks and leaving", async () => {
  const { token: group } = await listedMember("saver@syu.ac.kr", "saver-pass-123")
  const { token: brand, listingId: cafe } = await listedMember("saved@saved-cafe.kr", "saved-pass-123", "브랜드")
  const { listingId: bakery } = await listedMember("saved2@saved-bakery.kr", "saved2-pass-123", "브랜드")
  assert.equal((await call("PUT", `/saved/${cafe}`, undefined, group)).status, 204)
  assert.equal((await call("PUT", `/saved/${bakery}`, undefined, group)).status, 204)
  // Saving again keeps one, and the newest comes first.
  assert.equal((await call("PUT", `/saved/${cafe}`, undefined, group)).status, 204)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [bakery, cafe])
  // Only listings of the other side the member sees: not the examples, nor
  // anything unknown, and never for a visitor.
  const database = getDatabase()
  const example = database.brands.find((item) => !database.accounts.some((account) => account.brandId === item.id))!
  assert.equal((await call("PUT", `/saved/${example.id}`, undefined, group)).status, 404)
  assert.equal((await call("PUT", "/saved/nope", undefined, group)).status, 404)
  assert.equal((await call("PUT", `/saved/${cafe}`)).status, 401)
  assert.equal((await call("DELETE", `/saved/${bakery}`, undefined, group)).status, 204)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [cafe])
  assert.deepEqual((await call("GET", "/auth/export", undefined, group)).data.saved, [{ id: cafe, name: "saved 카페" }])
  // A blocked partner drops out of the list until it is unblocked.
  await call("POST", "/blocks", { listingId: cafe }, group)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [])
  await call("DELETE", `/blocks/${cafe}`, undefined, group)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [cafe])
  // A brand that leaves goes from every list.
  assert.equal((await call("DELETE", "/auth/account", { password: "saved-pass-123" }, brand)).status, 204)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [])
  assert.equal(Object.values(getDatabase().saved).some((ids) => ids.includes(cafe)), false)
})

test("a member takes its listing out of the lists for a while, and what is under way carries on", async () => {
  const { token: group } = await listedMember("pause@syu.ac.kr", "pause-pass-123")
  const { token: brand, listingId: cafe } = await listedMember("pause@pause-cafe.kr", "pause-pass-123", "브랜드")
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  await call("POST", "/events", { name: "숨김 공연", date: addDays(todayInKorea(), 9), types: ["현금"] }, group)
  await call("POST", "/events", { name: "숨김 뒤 공연", date: addDays(todayInKorea(), 20), types: ["현금"] }, group)
  // A proposal sent and a 찜 made before the pause.
  assert.equal((await call("POST", "/proposals", { matchId: cafe }, group)).status, 201)
  await call("PUT", `/saved/${cafe}`, undefined, group)

  const paused = await call("PUT", "/profile/pause", { paused: true }, brand)
  assert.equal(paused.status, 200)
  assert.ok(paused.data.profile.pausedAt)
  assert.ok((await call("GET", "/profile", undefined, brand)).data.profile.pausedAt)
  // The group no longer finds it: not in the catalog, its matches or its 찜 list.
  const listed = async () => ((await call("GET", "/brands", undefined, group)).data.brands as { id: string }[]).map((item) => item.id)
  assert.equal((await listed()).includes(cafe), false)
  assert.equal(((await call("GET", "/matches", undefined, group)).data.matches as { id: string }[]).some((item) => item.id === cafe), false)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [])
  // A new proposal is refused, while the one under way can still be accepted.
  const request = (await call("GET", "/requests", undefined, brand)).data.requests[0] as { id: string; eventName: string }
  assert.equal(request.eventName, "숨김 공연")
  assert.equal((await call("POST", `/requests/${request.id}/accept`, undefined, brand)).status, 200)
  const again = await call("POST", "/proposals", { matchId: cafe }, group)
  assert.equal(again.status, 409)
  assert.match(again.data.error, /제안을 받지 않는/)

  // Shown again, it is back everywhere, the 찜 list too.
  const shown = await call("PUT", "/profile/pause", { paused: false }, brand)
  assert.equal(shown.data.profile.pausedAt, undefined)
  assert.equal((await listed()).includes(cafe), true)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [cafe])
  // Bad input, the demo accounts and an account with no listing are refused.
  assert.equal((await call("PUT", "/profile/pause", { paused: "yes" }, brand)).status, 400)
  assert.equal((await call("PUT", "/profile/pause", { paused: true }, await login("브랜드"))).status, 403)
  const fresh = await signUpMember("nolisting@syu.ac.kr", "nolisting-pass-123")
  assert.equal((await call("PUT", "/profile/pause", { paused: true }, fresh)).status, 404)
})

test("a brand verifies its business with the National Tax Service, and its listing says so", async () => {
  const { businessCheck } = await import("./lib/business.js")
  const realValidate = businessCheck.validate
  const asked: { number: string; startDate: string; owner: string }[] = []
  let answer: "valid" | "closed" | "invalid" | "down" = "valid"
  businessCheck.validate = async (input) => {
    asked.push(input)
    if (answer === "down") throw new Error("unreachable")
    return answer
  }
  try {
    const brandEmail = "owner@owner-cafe.kr"
    const { token: brand, listingId } = await listedMember(brandEmail, "owner-pass-123", "브랜드")
    const { token: group } = await listedMember("owner@syu.ac.kr", "owner-pass-123")
    const form = { number: "123-45-67890", startDate: "2020-03-02", owner: "김대표" }
    const verify = (body: object, token = brand) => call("POST", "/profile/business", body, token)

    // Without the key it isn't offered yet.
    assert.deepEqual((await call("GET", "/profile/business", undefined, brand)).data, { ready: false, business: null })
    assert.equal((await verify(form)).status, 503)
    config.ntsServiceKey = "test-key"
    assert.equal((await verify(form, group)).status, 403)
    assert.equal((await verify(form, await login("브랜드"))).status, 403)
    assert.equal((await verify({ ...form, number: "123" })).status, 400)

    // Details that don't match, a closed business, or the service down.
    answer = "invalid"
    const unmatched = await verify(form)
    assert.equal(unmatched.status, 400)
    assert.match(unmatched.data.error, /확인되지 않았어요/)
    answer = "closed"
    assert.match((await verify(form)).data.error, /폐업/)
    answer = "down"
    assert.equal((await verify(form)).status, 502)

    // Confirmed: the number alone is kept, and groups see the listing as checked.
    answer = "valid"
    const verified = await verify(form)
    assert.equal(verified.status, 200)
    assert.equal(verified.data.business.number, "123-45-67890")
    assert.deepEqual(asked.at(-1), { number: "1234567890", startDate: "20200302", owner: "김대표" })
    const account = getDatabase().accounts.find((item) => item.email === brandEmail)!
    assert.deepEqual(Object.keys(account.business ?? {}), ["number", "verifiedAt"])
    const brands = (await call("GET", "/brands", undefined, group)).data.brands as { id: string; businessVerified?: boolean }[]
    assert.equal(brands.find((item) => item.id === listingId)?.businessVerified, true)
    assert.equal((await call("GET", "/profile/business", undefined, brand)).data.business.number, "123-45-67890")

    // One business verifies one account.
    const { token: other } = await listedMember("other@other-cafe.kr", "other-pass-123", "브랜드")
    assert.equal((await verify(form, other)).status, 409)
  } finally {
    businessCheck.validate = realValidate
    config.ntsServiceKey = undefined
  }
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
    type: "교육 · 학원",
    school: "",
    email: "hi@newbrand.co.kr",
    password: "brand-pass-123",
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    contact: testContact,
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
  // Members of the other side find it; the examples that visitors and the
  // demo accounts see don't show it.
  const named = async (token?: string) =>
    ((await call("GET", "/brands", undefined, token)).data.brands as { name: string }[]).map((brand) => brand.name)
  assert.ok((await named(await signUpMember("finder@syu.ac.kr", "finder-pass-123"))).includes("새로운 브랜드"))
  assert.ok(!(await named()).includes("새로운 브랜드"))
  assert.ok(!(await named(student)).includes("새로운 브랜드"))
})

test("the proposal state lists what an account sent, until it is taken back", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()
  const { token: group, listingId: groupListing } = await listedMember("sender@syu.ac.kr", "sender-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("sender@sender-cafe.kr", "sender-pass-123", "브랜드")
  await call("POST", "/events", { name: "보낸 공연", date: addDays(today, 9), types: ["현금"] }, group)
  await call("POST", "/events", { name: "보낸 캠페인", date: addDays(today, 11), types: ["제품"] }, brand)

  // A group's request: to which brand, about which event, asking for what.
  const sent = (await call("POST", "/proposals", { matchId: brandListing }, group)).data.sent
  assert.equal(sent.length, 1)
  assert.deepEqual(
    [sent[0].partnerId, sent[0].partnerName, sent[0].eventName, sent[0].offer, sent[0].status],
    [brandListing, "sender 카페", "보낸 공연", "음료 쿠폰 100장", "검토 중"],
  )
  // A brand's offer, to a group with its school.
  const offered = (await call("POST", "/proposals", { matchId: groupListing }, brand)).data.sent
  assert.deepEqual([offered[0].partnerName, offered[0].school, offered[0].eventName], ["sender 동아리", "삼육대학교", "보낸 캠페인"])
  // Visitors have sent nothing, and taking one back empties the list.
  assert.deepEqual((await call("GET", "/proposals")).data.sent, [])
  assert.deepEqual((await call("DELETE", `/proposals/${brandListing}`, undefined, group)).data.sent, [])
})

test("members see only members, and the examples stay with visitors and the demo accounts", async () => {
  const { token: group, listingId: groupListing } = await listedMember("apart@syu.ac.kr", "apart-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("apart@apart-cafe.kr", "apart-pass-123", "브랜드")
  const demoGroup = await login("학생단체")
  const demoBrand = await login("브랜드")
  const database = getDatabase()
  const demoIds = Object.values(database.demoAccountIds)
  const byMember = (catalog: "brandId" | "groupId", id: string) =>
    database.accounts.some((account) => account[catalog] === id && !demoIds.includes(account.id))
  const ids = async (route: string, key: string, token?: string) =>
    ((await call("GET", route, undefined, token)).data[key] as { id: string }[]).map((listing) => listing.id)

  // A member's catalogs and matches hold members' listings only.
  const forGroup = await ids("/brands", "brands", group)
  assert.ok(forGroup.includes(brandListing))
  assert.ok(forGroup.every((id) => byMember("brandId", id)))
  assert.ok((await ids("/matches", "matches", group)).every((id) => forGroup.includes(id)))
  const forBrand = await ids("/groups", "groups", brand)
  assert.ok(forBrand.includes(groupListing))
  assert.ok(forBrand.every((id) => byMember("groupId", id)))

  // Visitors and the demo accounts see the examples, and no member.
  for (const token of [undefined, demoGroup]) {
    const shown = await ids("/brands", "brands", token)
    assert.ok(shown.includes("afternoon-coffee") && shown.includes("studymate"))
    assert.ok(!shown.some((id) => byMember("brandId", id)))
  }
  assert.ok(!(await ids("/groups", "groups", demoBrand)).some((id) => byMember("groupId", id)))

  // Neither reaches the other with a proposal or a message.
  await call("POST", "/events", { name: "따로 공연", date: "2026-12-19", types: ["현금"] }, group)
  for (const matchId of ["studymate", "afternoon-coffee"]) {
    assert.equal((await call("POST", "/proposals", { matchId }, group)).status, 404, matchId)
  }
  assert.equal((await call("POST", "/proposals", { matchId: groupListing }, demoBrand)).status, 404)
  assert.equal((await call("POST", "/proposals", { matchId: brandListing }, demoGroup)).status, 404)
  assert.equal((await call("POST", "/conversations", { partnerId: "afternoon-coffee" }, group)).status, 404)
  assert.equal((await call("POST", "/conversations", { partnerId: brandListing }, demoGroup)).status, 404)

  // A proposal to the examples sent before they were set apart no longer counts.
  const memberId = database.accounts.find((account) => account.email === "apart@syu.ac.kr")!.id
  database.proposals[memberId] = ["studymate"]
  assert.deepEqual((await call("GET", "/proposals", undefined, group)).data.proposals, [])
  delete database.proposals[memberId]
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
  // A message deleted before it was read is not waiting to be read.
  const slip = await call("POST", `/conversations/${id}/messages`, { text: "잘못 보냈어요" }, student)
  await call("DELETE", `/conversations/${id}/messages/${slip.data.conversation.messages.at(-1).id}`, undefined, student)
  const unread = (await call("GET", "/conversations", undefined, brand)).data.conversations.find(
    (item: { id: string }) => item.id === id,
  ).unread
  assert.equal(unread, 0)
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
  assert.equal(upgraded.catalogVersion, 4)
  assert.ok(upgraded.brands.every((brand) => brand.intro && brand.sns && brand.portfolio))
  assert.equal(upgraded.conversations.length, 3)

  // Version 2 catalogs keep their edits and gain the demo store locations
  // once; a brand that clears its address afterwards keeps it cleared.
  const edited = upgradeDatabase({
    events: {},
    catalogVersion: 2,
    brands: [{ id: "afternoon-coffee", intro: "직접 고친 소개" }],
    groups: [],
  } as unknown as Parameters<typeof upgradeDatabase>[0])
  assert.equal(edited.brands[0].intro, "직접 고친 소개")
  assert.equal(edited.brands[0].location?.address, "서울 노원구 공릉역 2번 출구 앞")
  delete edited.brands[0].location
  assert.equal(upgradeDatabase(edited).brands[0].location, undefined)

  // Version 3 data loses the coordinates Kakao's address search gave (they
  // may not be kept), keeping the address; the demo stores keep theirs.
  const kakaoPlaced = upgradeDatabase({
    events: {},
    catalogVersion: 3,
    brands: [
      { id: "afternoon-coffee", location: { address: "서울 노원구 노해로 437", lat: 37.65452, lng: 127.05627 } },
      { id: "greenday", location: { address: "서울 노원구 공릉역 인근", lat: 37.6262, lng: 127.0745 } },
      { id: "new-brand", location: { address: "서울 노원구 동일로 1000", lat: 37.6, lng: 127.06 } },
    ],
    groups: [],
  } as unknown as Parameters<typeof upgradeDatabase>[0])
  assert.deepEqual(
    kakaoPlaced.brands.map((brand) => brand.location),
    [
      { address: "서울 노원구 노해로 437" },
      { address: "서울 노원구 공릉역 인근", lat: 37.6262, lng: 127.0745 },
      { address: "서울 노원구 동일로 1000" },
    ],
  )
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

test("server and browser errors are kept for the operators, and the first after a quiet hour is emailed", async () => {
  const { mailTransport } = await import("./lib/mailer.js")
  const { clearErrorLog } = await import("./lib/errorLog.js")
  await clearErrorLog()
  const realPost = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (body) => {
    sent.push(body)
    return new Response(null, { status: 200 })
  }
  config.resendApiKey = "test-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  config.operatorEmail = "ops@example.com"
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40))
  const errors = async () => {
    const response = await fetch(`${baseUrl}/admin/errors`, { headers: { "X-Admin-Token": "test-admin-token" } })
    return ((await response.json()) as { errors: { source: string; where: string; path: string; message: string }[] }).errors
  }
  const alerts = () => sent.filter((mail) => mail.to[0] === "ops@example.com")
  try {
    // A request whose save fails is kept with its method and path.
    const student = await login("학생단체")
    const dataFile = config.dataFile
    config.dataFile = process.env.FRONTEND_DIST!
    const failed = await call("POST", "/events", { name: "오류 공연", date: "2026-12-01", types: ["현금"] }, student)
    config.dataFile = dataFile
    assert.equal(failed.status, 503)
    await settle()
    const [server] = await errors()
    assert.deepEqual([server.source, server.where], ["server", "POST /api/events"])
    assert.match(server.message, /되돌렸어요/)
    // The operators hear of it by email.
    assert.equal(alerts().length, 1)
    assert.equal(alerts()[0].subject, "[uniconnect] 오류가 생겼어요")

    // A browser's error is kept too, its page's path without the query;
    // following close behind, it emails no one.
    const reported = await call("POST", "/errors", {
      message: "TypeError: x is undefined",
      where: "index-abc.js:1:200",
      path: "/matches?from=bell",
    })
    assert.equal(reported.status, 204)
    await settle()
    const [browser] = await errors()
    assert.deepEqual([browser.source, browser.path, browser.where], ["browser", "/matches", "index-abc.js:1:200"])
    assert.equal(alerts().length, 1)
    assert.equal((await call("POST", "/errors", { message: "", path: "/" })).status, 400)
    // Only the operators read them.
    assert.equal((await call("GET", "/admin/errors")).status, 403)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
    config.operatorEmail = undefined
  }
})

test("event names and people are checked, and default goals save as they are", async () => {
  const student = await signUpMember("sizes@syu.ac.kr", "sizes-pass-123")
  const event = (fields: Record<string, unknown>) =>
    call("POST", "/events", { name: "규모 확인 공연", date: "2026-12-05", types: ["현금"], ...fields }, student)
  const long = await event({ name: "가".repeat(41) })
  assert.equal(long.status, 400)
  assert.match(long.data.error, /40자/)
  for (const people of ["0", "100001", "많이", "12.5"]) {
    const wrong = await event({ people })
    assert.equal(wrong.status, 400, people)
    assert.match(wrong.data.error, /예상 참여 인원/)
  }
  assert.equal((await event({ people: "" })).data.event.people, "")
  const largest = (await event({ people: "100,000명" })).data.event
  assert.equal(largest.people, "100,000명")

  // An event as large as allowed gets goals the goals form takes back as they are.
  const { report } = (await call("GET", `/measurements/${largest.id}`, undefined, student)).data
  assert.equal(report.expectedAudience, 100000)
  const goals = {
    expectedAudience: report.expectedAudience,
    averageSpend: report.averageSpend,
    snsReach: report.snsReach,
    valueBreakdown: report.valueBreakdown,
    targets: report.targets,
    coupon: report.coupon,
  }
  assert.equal((await call("PUT", `/measurements/${largest.id}/goals`, goals, student)).status, 200)
  // A huge number kept from before the check still gives goals in range.
  Object.values(getDatabase().events).flat().find((item) => item.id === largest.id)!.people = "250,000명"
  getDatabase().measurements = getDatabase().measurements.filter((item) => item.eventId !== largest.id)
  const again = (await call("GET", `/measurements/${largest.id}`, undefined, student)).data.report
  assert.equal(again.expectedAudience, 100000)
})

test("a request too big or with a broken address is answered as such, not as a server error", async () => {
  const student = await login("학생단체")
  const big = await call("POST", "/events", { name: "x".repeat(400_000), date: "2026-12-01", types: ["현금"] }, student)
  assert.equal(big.status, 413)
  assert.match(big.data.error, /너무 커요/)
  const broken = await call("GET", "/conversations/%E0%A4%A", undefined, student)
  assert.equal(broken.status, 400)
  assert.match(broken.data.error, /요청 형식/)
})

test("a separate frontend origin may send the operators' token", async () => {
  const before = config.corsOrigin
  config.corsOrigin = "https://app.example.com"
  const other = createApp().listen(0)
  try {
    await new Promise((resolve) => other.once("listening", resolve))
    const port = (other.address() as AddressInfo).port
    const preflight = await fetch(`http://127.0.0.1:${port}/api/admin/inquiries`, {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.com", "Access-Control-Request-Headers": "x-admin-token" },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://app.example.com")
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /X-Admin-Token/)
  } finally {
    await new Promise((resolve) => other.close(resolve))
    config.corsOrigin = before
  }
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
  // The venue counts that came later start at zero, with the group's venue PIN.
  assert.deepEqual(busking.metrics, { scans: 200, coupons: 120, visits: 60, ...emptyVenue })
  assert.equal(busking.groupPin, "1013")
  assert.equal(busking.log[0].detail, "현장 QR 스캔")
  assert.equal("metrics" in upgraded || "report" in upgraded || "metricLog" in upgraded, false)
})

test("sign-up codes stay off the response unless turned on", () => {
  assert.equal(emailCodesExposed({}), false)
  assert.equal(emailCodesExposed({ NODE_ENV: "development" }), false)
  assert.equal(emailCodesExposed({ EXPOSE_EMAIL_CODES: "false" }), false)
  assert.equal(emailCodesExposed({ EXPOSE_EMAIL_CODES: "true" }), true)
})

// A member signed up for a test, logged in, with their token: a student
// group unless a brand is asked for.
async function signUpMember(email: string, password: string, role: "학생단체" | "브랜드" = "학생단체") {
  const students = role === "학생단체"
  const sent = await call("POST", "/auth/email-code", { role, email })
  const verified = await call("POST", "/auth/email-code/verify", { email, code: sent.data.devCode })
  const signup = await call("POST", "/auth/signup", {
    role,
    name: `${email.split("@")[0]} ${students ? "동아리" : "카페"}`,
    type: students ? "공연 동아리" : "카페 · 식음료",
    school: students ? "삼육대학교" : "",
    email,
    password,
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    contact: testContact,
    over14: true,
  })
  assert.equal(signup.status, 201)
  return signup.data.token as string
}

// A member with its listing written, so members of the other side find it:
// its token and its listing's id.
async function listedMember(email: string, password: string, role: "학생단체" | "브랜드" = "학생단체") {
  const token = await signUpMember(email, password, role)
  const students = role === "학생단체"
  const profile = students
    ? { intro: "캠퍼스에서 정기 공연을 여는 동아리예요.", offer: "관객 100명" }
    : { intro: "대학가에서 학생 행사를 돕는 카페예요.", offer: "음료 쿠폰 100장" }
  const written = await call("PUT", "/profile", profile, token)
  assert.equal(written.status, 200)
  return { token, listingId: written.data.profile.id as string }
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
    contact: testContact,
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
  // A new password follows the same rules as at sign-up, checked before the code.
  for (const password of ["sh-1!", "no-digits-here", "nosymbols123", "12345678-!", "has space-1", "x".repeat(60) + "-1234"]) {
    const weak = await call("POST", "/auth/password-reset", { email, code, password })
    assert.equal(weak.status, 400, password)
  }
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
    contact: testContact,
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
  const { listingId: partnerId } = await listedMember("leaving@leaving-cafe.kr", "leave-pass-123", "브랜드")
  assert.equal((await call("POST", "/conversations", { partnerId }, token)).status, 201)

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
  // A ROAS goal of 0 would be divided by.
  const noGoal = await call("PUT", route, { ...goals, targets: { ...goals.targets, roas: 0 } }, student)
  assert.equal(noGoal.status, 400)
  assert.match(noGoal.data.error, /목표 ROAS는 1부터/)

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
  // Each part of the score as a share of its best, for the detail page's bars.
  type Part = { label: string; value: number }
  assert.deepEqual(
    coffee.scoreParts.map((part: Part) => part.label),
    ["업종 궁합", "관심사", "협찬 경험", "함께한 이력", "응답 준비"],
  )
  assert.ok(coffee.scoreParts.every((part: Part) => part.value >= 0 && part.value <= 1))
  assert.equal(coffee.scoreParts[3].value, 1)

  // A new brand's listing is scored like any other, not left at its first 70.
  const groups = (await call("GET", "/groups")).data.groups
  const muse = groups.find((group: { id: string }) => group.id === "syu-muse")
  assert.ok(muse.reasons.length > 0)
  assert.deepEqual(
    muse.scoreParts.map((part: Part) => part.label),
    ["업종 궁합", "관심사", "행사 규모", "함께한 이력", "가까운 행사"],
  )
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

test("proposals, answers and new messages are emailed to the other side, never to the demo accounts", async () => {
  const { mailTransport } = await import("./lib/mailer.js")
  const { addDays, todayInKorea } = await import("./lib/dates.js")
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
  // Everyone trying the demo uses its accounts, so their addresses stand for no one.
  const toDemo = () => sent.filter((mail) => ["muse@syu.ac.kr", "hello@afternoon-coffee.kr"].includes(mail.to[0]))
  try {
    // A group and a brand, each with a listing.
    const email = "notice@syu.ac.kr"
    const brandEmail = "notice@notice-cafe.kr"
    const { token: group, listingId: groupListing } = await listedMember(email, "notice-pass-123")
    const { token: brand, listingId: brandListing } = await listedMember(brandEmail, "notice-pass-123", "브랜드")
    sent.length = 0

    // The group's proposal reaches the brand by email, and the brand's
    // answer comes back to the group.
    const today = todayInKorea()
    await call("POST", "/events", { name: "알림 공연", date: addDays(today, 10), types: ["현금"] }, group)
    assert.equal((await call("POST", "/proposals", { matchId: brandListing }, group)).status, 201)
    await settle()
    assert.equal(sent.find((mail) => mail.to[0] === brandEmail)?.subject, "[uniconnect] 새 협찬 제안이 왔어요")
    const [request] = (await call("GET", "/requests", undefined, brand)).data.requests
    await call("POST", `/requests/${request.id}/accept`, undefined, brand)
    await settle()
    const answerMail = sent.find((mail) => mail.to[0] === email)
    assert.equal(answerMail?.subject, "[uniconnect] 협찬이 확정됐어요")
    assert.match(answerMail?.text ?? "", /notice 카페에서 '알림 공연' 제안을 수락했어요/)

    // The brand's offer about its campaign reaches the group the same way.
    sent.length = 0
    await call("POST", "/events", { name: "알림 캠페인", date: addDays(today, 12), types: ["제품"] }, brand)
    await call("POST", "/proposals", { matchId: groupListing }, brand)
    await settle()
    const offerMail = sent.find((mail) => mail.to[0] === email)
    assert.equal(offerMail?.subject, "[uniconnect] 새 협찬 제안이 왔어요")
    assert.match(offerMail?.text ?? "", /notice 카페에서/)
    assert.match(offerMail?.text ?? "", /https:\/\/uniconnect\.example\/offers/)

    const [offer] = (await call("GET", "/offers", undefined, group)).data.offers
    await call("POST", `/offers/${offer.id}/accept`, undefined, brand) // a brand cannot answer
    await call("POST", `/offers/${offer.id}/accept`, undefined, group)
    await settle()
    assert.ok(sent.some((mail) => mail.to[0] === brandEmail && mail.subject === "[uniconnect] 협찬이 확정됐어요"))

    // Messages: one email for a run of unread ones.
    sent.length = 0
    const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
    await call("POST", `/conversations/${chat.id}/messages`, { text: "안녕하세요! 일정 이야기해요." }, group)
    await call("POST", `/conversations/${chat.id}/messages`, { text: "편하실 때 답 주세요." }, group)
    await call("POST", `/conversations/${chat.id}/messages`, { text: "네, 좋아요!" }, brand)
    await call("POST", `/conversations/${chat.id}/messages`, { text: "내일 연락드릴게요." }, brand)
    await settle()
    assert.equal(sent.filter((mail) => mail.to[0] === brandEmail).length, 1)
    const toGroup = sent.filter((mail) => mail.to[0] === email)
    assert.equal(toGroup.length, 1)
    assert.match(toGroup[0].text, /notice 카페: 네, 좋아요/)

    // Between the demo accounts, which only meet each other, no mail goes.
    sent.length = 0
    const demoGroup = await login("학생단체")
    const demoChat = (await call("POST", "/conversations", { partnerId: "afternoon-coffee" }, demoGroup)).data.conversation
    await call("POST", `/conversations/${demoChat.id}/messages`, { text: "데모로 보내 보는 메시지예요." }, demoGroup)
    await settle()
    assert.deepEqual(toDemo(), [])
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

test("sign-up asks who runs the account, which only the two sides of an agreement see", async () => {
  const email = "contact@syu.ac.kr"
  const sent = await call("POST", "/auth/email-code", { role: "학생단체", email })
  const verified = await call("POST", "/auth/email-code/verify", { email, code: sent.data.devCode })
  const form = {
    role: "학생단체",
    name: "연락 동아리",
    type: "밴드 · 음악 동아리",
    school: "삼육대학교",
    email,
    password: "contact-pass-123",
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    over14: true,
  }
  for (const [contact, error] of [
    [undefined, /담당자 이름/],
    [{ name: "김담당", phone: "010-1234-5678" }, /직책/],
    [{ name: "김담당", position: "회장", phone: "02-123-4567" }, /휴대폰 번호/],
  ] as const) {
    const refused = await call("POST", "/auth/signup", { ...form, contact })
    assert.equal(refused.status, 400)
    assert.match(refused.data.error, error)
  }
  // The old, broader types are gone from the list.
  assert.equal((await call("POST", "/auth/signup", { ...form, type: "학생회", contact: testContact })).status, 400)
  const signup = await call("POST", "/auth/signup", {
    ...form,
    contact: { name: " 김담당 ", position: "회장", phone: "01098765432" },
  })
  assert.equal(signup.status, 201)
  assert.deepEqual(signup.data.account.contact, { name: "김담당", position: "회장", phone: "010-9876-5432" })

  // 내 정보 changes it, after a handover say; the shared demo accounts can't.
  const token = signup.data.token as string
  const changed = await call("PUT", "/auth/contact", { name: "박새임원", position: "부회장", phone: "010 2222 3333" }, token)
  assert.deepEqual(changed.data.account.contact, { name: "박새임원", position: "부회장", phone: "010-2222-3333" })
  assert.equal((await call("PUT", "/auth/contact", { name: "누군가", position: "회장", phone: "010-1111-2222" }, await login("학생단체"))).status, 403)

  // An accepted proposal's agreement shows both sides' contacts to the two sides.
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { token: brand, listingId: brandListing } = await listedMember("contact@contact-cafe.kr", "contact-pass-123", "브랜드")
  await call("POST", "/events", { name: "연락 공연", date: addDays(todayInKorea(), 6), types: ["현금"] }, token)
  await call("POST", "/proposals", { matchId: brandListing }, token)
  const memberId = signup.data.account.id as string
  const request = getDatabase().requests.find((item) => item.fromAccountId === memberId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const agreement = (await call("GET", `/agreements/${request.id}`, undefined, brand)).data.agreement
  assert.deepEqual(agreement.group.contact, { name: "박새임원", position: "부회장", phone: "010-2222-3333" })
  assert.deepEqual(agreement.brand.contact, testContact)
})

test("the bell's read marks stay with the account, so every device shows the same dot", async () => {
  const token = await signUpMember("bell@syu.ac.kr", "bell-pass-123")
  const read = ["offer:o1", "match:m1", "soon:e1:2026-11-25:0"]
  const saved = await call("PUT", "/auth/notices", { read: [...read, "offer:o1"] }, token)
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.data.readNotices, read)
  // Another device logged into the same account reads them back.
  const other = (await call("POST", "/auth/login", { role: "학생단체", email: "bell@syu.ac.kr", password: "bell-pass-123" }))
    .data.token as string
  assert.deepEqual((await call("GET", "/auth/me", undefined, other)).data.account.readNotices, read)
  // Each save replaces the list, as the app sends only the parts still shown.
  await call("PUT", "/auth/notices", { read: ["match:m1"] }, other)
  assert.deepEqual((await call("GET", "/auth/me", undefined, token)).data.account.readNotices, ["match:m1"])
  await call("PUT", "/auth/notices", { read: [] }, token)
  assert.equal((await call("GET", "/auth/me", undefined, token)).data.account.readNotices, undefined)
  // Anything else is refused, and so is a visitor.
  for (const body of [
    {},
    { read: "offer:o1" },
    { read: [1] },
    { read: [""] },
    { read: ["x".repeat(201)] },
    { read: Array.from({ length: 301 }, (_, index) => `part:${index}`) },
  ]) {
    assert.equal((await call("PUT", "/auth/notices", body, token)).status, 400)
  }
  assert.equal((await call("PUT", "/auth/notices", { read: [] })).status, 401)
})

test("account types from before the lists grew take their new names", async () => {
  const { upgradeDatabase } = await import("./store.js")
  const { createSeed, demoContacts } = await import("./data/seed.js")
  const stored = await createSeed()
  const brand = stored.accounts.find((account) => account.role === "브랜드")!
  const listing = stored.brands.find((item) => item.id === brand.brandId)!
  brand.type = "뷰티 · 패션"
  listing.category = "뷰티 · 패션"
  delete brand.contact
  upgradeDatabase(stored)
  assert.equal(brand.type, "뷰티 · 화장품")
  assert.equal(listing.category, "뷰티 · 화장품")
  // The demo accounts from before contacts were asked get theirs.
  assert.deepEqual(brand.contact, demoContacts.브랜드)
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
    contact: testContact,
  }
  // Under 14s cannot sign up.
  assert.equal((await call("POST", "/auth/signup", form)).status, 400)
  const signup = await call("POST", "/auth/signup", { ...form, over14: true })
  assert.equal(signup.status, 201)
  const here = signup.data.token as string
  const other = (await call("POST", "/auth/login", { role: "학생단체", email, password: "first-pass-123" })).data.token

  assert.equal((await call("POST", "/auth/password", { current: "first-pass-123", next: "new" }, here)).status, 400)
  assert.equal((await call("POST", "/auth/password", { current: "first-pass-123", next: "secondpass123" }, here)).status, 400)
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
  const { token: brand, listingId: brandId } = await listedMember("deleter@deleter-cafe.kr", "deleter-pass-123", "브랜드")
  const event = { name: "취소될 공연", date: "2026-12-20", types: ["현금"] }
  const first = (await call("POST", "/events", event, student)).data.event
  await call("POST", "/proposals", { matchId: brandId }, student)
  const pending = getDatabase().requests.find((item) => item.eventId === first.id)
  assert.equal(pending?.status, "검토 중")

  // Deleted while waiting: the proposal goes from the brand's inbox and the
  // group's sent list.
  assert.equal((await call("DELETE", `/events/${first.id}`, undefined, student)).status, 204)
  assert.equal(getDatabase().requests.some((item) => item.id === pending!.id), false)
  const sent = (await call("GET", "/proposals", undefined, student)).data
  assert.equal(sent.proposals.includes(brandId), false)
  assert.equal((await call("POST", `/requests/${pending!.id}/accept`, undefined, brand)).status, 404)

  // Once the brand accepts, the event cannot be deleted.
  const second = (await call("POST", "/events", { ...event, name: "확정될 공연" }, student)).data.event
  await call("POST", "/proposals", { matchId: brandId }, student)
  const request = getDatabase().requests.find((item) => item.eventId === second.id)!
  assert.equal((await call("POST", `/requests/${request.id}/accept`, undefined, brand)).status, 200)
  const refused = await call("DELETE", `/events/${second.id}`, undefined, student)
  assert.equal(refused.status, 409)
  assert.match(refused.data.error, /협찬이 확정된 행사/)
})

test("a leaving group's sponsors keep the results of its events", async () => {
  const student = await signUpMember("sponsored@syu.ac.kr", "sponsored-pass-123")
  const { token: brand, listingId } = await listedMember("sponsored@sponsored-cafe.kr", "sponsored-pass-123", "브랜드")
  const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id as string
  const event = (await call("POST", "/events", { name: "결과가 남을 공연", date: "2026-12-21", types: ["현금"] }, student)).data.event
  await call("POST", "/proposals", { matchId: listingId }, student)
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

test("errors answer in English when the request asks for it", async () => {
  const send = async (route: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(baseUrl + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
    return { status: response.status, data: (await response.json()) as { error?: string; token?: string } }
  }
  const wrongLogin = { role: "학생단체", email: "muse@syu.ac.kr", password: "wrong-password" }

  const english = await send("/auth/login", wrongLogin, { "Accept-Language": "en-US,en;q=0.9" })
  assert.equal(english.status, 401)
  assert.equal(english.data.error, "The email or password is incorrect.")

  const korean = await send("/auth/login", wrongLogin)
  assert.equal(korean.status, 401)
  assert.equal(korean.data.error, "이메일 또는 비밀번호가 올바르지 않아요.")
  const koreanFirst = await send("/auth/login", wrongLogin, { "Accept-Language": "ko-KR,en;q=0.8" })
  assert.equal(koreanFirst.data.error, "이메일 또는 비밀번호가 올바르지 않아요.")

  // A message built from parts: the field's name is translated inside it.
  const student = await login("학생단체")
  const longName = { name: "가".repeat(41), date: "2026-12-05", types: ["현금"] }
  const tooLong = await send("/events", longName, { "Accept-Language": "en", Authorization: `Bearer ${student}` })
  assert.equal(tooLong.status, 400)
  assert.equal(tooLong.data.error, "Please keep the event name to 40 characters or fewer.")
  const tooLongKorean = await send("/events", longName, { Authorization: `Bearer ${student}` })
  assert.equal(tooLongKorean.data.error, "행사명은 40자 이하로 적어 주세요.")
})

test("every Korean error message the server writes has English", async () => {
  const { readdir, readFile } = await import("node:fs/promises")
  const { fileURLToPath } = await import("node:url")
  const { translate } = await import("./lib/i18n.js")
  const root = path.dirname(fileURLToPath(import.meta.url))
  const files = (await readdir(root, { recursive: true })).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  )
  const messages = new Set<string>()
  for (const name of files) {
    const source = await readFile(path.join(root, name), "utf8")
    for (const match of source.matchAll(/new HttpError\(\s*\d+,\s*"((?:[^"\\]|\\.)*)"/g)) messages.add(match[1])
    for (const match of source.matchAll(/createRateLimit\(\{[^}]*?message:\s*"((?:[^"\\]|\\.)*)"/g)) messages.add(match[1])
  }
  assert.ok(messages.size > 50)
  // Korean left anywhere in the English means no translation, or a pattern
  // that caught a message it wasn't meant for.
  const missing = [...messages].filter((message) => /[가-힣]/.test(message) && /[가-힣]/.test(translate(message, "en")))
  assert.deepEqual(missing, [])
  // Messages built from parts take English for each form the code writes.
  assert.equal(
    translate("목표 ROAS는 1부터 10,000까지의 숫자로 적어 주세요.", "en"),
    "Target ROAS must be a number from 1 to 10,000.",
  )
  assert.equal(
    translate("예상 인원은 1부터 100,000까지의 숫자로 적어 주세요.", "en"),
    "Expected audience must be a number from 1 to 100,000.",
  )
  assert.equal(translate("캠페인명과 일정을 입력해 주세요.", "en"), "Please enter the campaign name and dates.")
  assert.equal(translate("브랜드명을 입력해 주세요.", "en"), "Please enter the brand name.")
})

test("catalogs say how far each listing is from the viewer's campus or store", async () => {
  const { campusOf, distanceKm } = await import("./lib/geo.js")
  // Campuses by email domain (subdomains too), else by the school's name.
  assert.equal(campusOf({ email: "muse@syu.ac.kr" })?.name, "삼육대학교")
  assert.equal(campusOf({ email: "lab@cs.kw.ac.kr" })?.name, "광운대학교")
  assert.equal(campusOf({ email: "who@unknown.ac.kr", school: "서울여자대학교" })?.name, "서울여자대학교")
  assert.equal(campusOf({ email: "who@unknown.ac.kr", school: "어느대학교" }), undefined)
  assert.equal(distanceKm({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 }), 0)

  // The demo group (삼육대) sees each brand's store distance; online brands have none.
  type Placed = { id: string; distanceKm?: number; mapOffset?: { east: number; north: number } }
  const brands = (await call("GET", "/brands")).data.brands as Placed[]
  const coffee = brands.find((brand) => brand.id === "afternoon-coffee")!
  assert.ok(coffee.distanceKm! > 3 && coffee.distanceKm! < 4.5, String(coffee.distanceKm))
  assert.equal(brands.find((brand) => brand.id === "freshon")!.distanceKm, undefined)
  // The catalog map's offset agrees with the distance, to 10 m.
  const { east, north } = coffee.mapOffset!
  assert.ok(east % 10 === 0 && north % 10 === 0)
  assert.ok(Math.abs(Math.hypot(east, north) / 1000 - coffee.distanceKm!) < 0.1)
  assert.equal(brands.find((brand) => brand.id === "freshon")!.mapOffset, undefined)

  // The demo brand (공릉역) sees each group's campus distance; a union of schools has none.
  const groups = (await call("GET", "/groups")).data.groups as { id: string; distanceKm?: number }[]
  assert.ok(groups.find((group) => group.id === "seoultech-band")!.distanceKm! < 1.5)
  assert.equal(groups.find((group) => group.id === "nowon-creators")!.distanceKm, undefined)
})

test("a brand's store address is placed on the map through OpenStreetMap once a geocoder is set", async () => {
  const { geocoder } = await import("./lib/geocode.js")
  const brand = await login("브랜드")
  const listing = getDatabase().brands.find((item) => item.id === "afternoon-coffee")!
  const saved = structuredClone(listing)
  const form = (address?: string) => ({
    intro: listing.intro,
    offer: listing.offer,
    tags: listing.tags,
    facts: listing.facts,
    sns: listing.sns,
    portfolio: listing.portfolio,
    ...(address === undefined ? {} : { address }),
  })
  const search = geocoder.search
  // A geocoder in this computer's environment must not be reached from a test.
  const nominatim = config.nominatimUrl
  config.nominatimUrl = undefined
  try {
    // Left out, the address and its place stay.
    assert.equal((await call("PUT", "/profile", form(), brand)).data.profile.location.lat, saved.location!.lat)
    // Without a geocoder a new address is kept with no place, so no distance.
    const unplaced = (await call("PUT", "/profile", form("서울 노원구 화랑로 815"), brand)).data.profile
    assert.deepEqual(unplaced.location, { address: "서울 노원구 화랑로 815" })
    const far = (await call("GET", "/groups", undefined, brand)).data.groups
    assert.ok(far.every((group: { distanceKm?: number }) => group.distanceKm === undefined))

    // With a geocoder, OpenStreetMap's answer places it (here, on 서울과기대's
    // campus), and an address saved before it is looked up when saved again.
    config.nominatimUrl = "https://nominatim.example"
    const { campuses } = await import("./data/campuses.js")
    const { lat, lng } = campuses.find((campus) => campus.name === "서울과학기술대학교")!
    const asked: string[] = []
    geocoder.search = async (address: string, base: string) => {
      asked.push(address)
      assert.equal(base, "https://nominatim.example")
      return [{ lat: String(lat), lon: String(lng), display_name: "서울과학기술대학교" }]
    }
    const later = (await call("PUT", "/profile", form("서울 노원구 화랑로 815"), brand)).data.profile
    assert.deepEqual(later.location, { address: "서울 노원구 화랑로 815", lat, lng })
    const placed = (await call("PUT", "/profile", form("서울 노원구 공릉로 232"), brand)).data.profile
    assert.deepEqual(placed.location, { address: "서울 노원구 공릉로 232", lat, lng })
    assert.deepEqual(asked, ["서울 노원구 화랑로 815", "서울 노원구 공릉로 232"])
    const near = (await call("GET", "/groups", undefined, brand)).data.groups
    assert.equal(near.find((group: { id: string }) => group.id === "seoultech-band").distanceKm, 0)
    // A placed address isn't looked up again.
    await call("PUT", "/profile", form("서울 노원구 공릉로 232"), brand)
    assert.equal(asked.length, 2)
    // An address it can't find, or a geocoder that fails, still saves the
    // address, with no place.
    geocoder.search = async () => []
    const unknown = await call("PUT", "/profile", form("서울 어딘가 없는길 99999"), brand)
    assert.deepEqual(unknown.data.profile.location, { address: "서울 어딘가 없는길 99999" })
    geocoder.search = async () => {
      throw new Error("503 Service Unavailable")
    }
    const refused = await call("PUT", "/profile", form("서울 노원구 동일로 1000"), brand)
    assert.equal(refused.status, 200)
    assert.deepEqual(refused.data.profile.location, { address: "서울 노원구 동일로 1000" })

    const long = await call("PUT", "/profile", form("가".repeat(101)), brand)
    assert.equal(long.status, 400)
    assert.match(long.data.error, /100자/)
    assert.equal((await call("PUT", "/profile", form(""), brand)).data.profile.location, undefined)
  } finally {
    geocoder.search = search
    config.nominatimUrl = nominatim
    Object.assign(listing, saved)
    if (!saved.location) delete listing.location
  }
})

test("the shops around a campus come live from Kakao, are asked for again each time and are never kept", async () => {
  const { placeSearch } = await import("./lib/places.js")
  const { campuses } = await import("./data/campuses.js")
  const search = placeSearch.search
  const key = config.kakaoRestApiKey
  config.kakaoRestApiKey = undefined
  const demo = getDatabase().accounts.find((account) => account.email === "muse@syu.ac.kr")!
  const group = getDatabase().groups.find((item) => item.id === demo.groupId)!
  const saved = { email: demo.email, school: demo.school, groupSchool: group.school }
  const muse = await login("학생단체")
  try {
    // Without the key there is nothing to show, and Kakao isn't asked.
    assert.deepEqual((await call("GET", "/places?category=CE7", undefined, muse)).data, {
      map: false,
      campus: "삼육대학교",
      places: [],
    })

    config.kakaoRestApiKey = "test-key"
    const asked: { category: string; lat: number; lng: number }[] = []
    placeSearch.search = async (category: string, point: { lat: number; lng: number }) => {
      asked.push({ category, lat: point.lat, lng: point.lng })
      return {
        documents: [
          {
            id: "2",
            place_name: "이디야커피 삼육대점",
            category_name: "음식점 > 카페 > 커피전문점 > 이디야커피",
            road_address_name: "서울 노원구 화랑로 1",
            phone: "02-000-0000",
            distance: "411",
            place_url: "http://place.map.kakao.com/2",
            x: "127.1093",
            y: "37.6431",
          },
          {
            id: "1",
            place_name: "스마일하우스",
            category_name: "음식점 > 카페",
            address_name: "서울 노원구 공릉동 1",
            distance: "147",
            place_url: "http://place.map.kakao.com/1",
            x: "127.1041",
            y: "37.6428",
          },
          // Not a Kakao Map page, so it is left out, and so is one without a place.
          { id: "3", place_name: "어딘가", distance: "50", place_url: "https://example.com/3", x: "127.1", y: "37.6" },
          { id: "4", place_name: "위치 없음", distance: "60", place_url: "http://place.map.kakao.com/4" },
        ],
      }
    }
    // The group sees the shops around its campus, nearest first.
    const found = (await call("GET", "/places?category=CE7", undefined, muse)).data
    assert.equal(found.campus, "삼육대학교")
    assert.equal(found.example, undefined)
    assert.deepEqual(found.places, [
      {
        id: "1",
        name: "스마일하우스",
        category: "카페",
        address: "서울 노원구 공릉동 1",
        distanceM: 147,
        url: "https://place.map.kakao.com/1",
        lat: 37.6428,
        lng: 127.1041,
        kind: "CE7",
      },
      {
        id: "2",
        name: "이디야커피 삼육대점",
        category: "커피전문점",
        address: "서울 노원구 화랑로 1",
        phone: "02-000-0000",
        distanceM: 411,
        url: "https://place.map.kakao.com/2",
        lat: 37.6431,
        lng: 127.1093,
        kind: "CE7",
      },
    ])
    const campus = campuses.find((item) => item.name === "삼육대학교")!
    // The campus comes with its point, for the map drawn on screen.
    assert.deepEqual(found.center, { lat: campus.lat, lng: campus.lng })
    assert.deepEqual(asked[0], { category: "CE7", lat: campus.lat, lng: campus.lng })
    // The same look asks Kakao again: nothing was kept.
    await call("GET", "/places?category=CE7", undefined, muse)
    assert.equal(asked.length, 2)
    // Every kind together: each kind asked once, each place once, nearest first.
    const all = (await call("GET", "/places?category=all", undefined, muse)).data
    assert.deepEqual(asked.slice(2).map((item) => item.category), ["CE7", "FD6", "CS2", "AC5", "CT1"])
    assert.deepEqual(
      all.places.map((place: { name: string }) => place.name),
      ["스마일하우스", "이디야커피 삼육대점"],
    )

    assert.equal((await call("GET", "/places?category=constructor")).status, 400)
    assert.equal((await call("GET", "/places")).status, 400)

    // A school not in the campus table has no shops to show.
    demo.email = "muse@unknown.ac.kr"
    demo.school = "어느대학교"
    group.school = "어느대학교"
    assert.deepEqual((await call("GET", "/places?category=CE7", undefined, muse)).data, {
      map: true,
      campus: null,
      places: [],
    })
    Object.assign(demo, { email: saved.email, school: saved.school })
    group.school = saved.groupSchool

    // When Kakao fails, the screen gets a message it can show.
    placeSearch.search = async () => {
      throw new Error("403 disabled")
    }
    const failed = await call("GET", "/places?category=FD6", undefined, muse)
    assert.equal(failed.status, 502)
    assert.match(failed.data.error, /주변 가게/)

    // Each address may ask Kakao 30 times a minute, a look at every kind
    // counting five: 8 asked so far (two single looks, one of every kind,
    // the failed one). A visitor's look at the examples asks nothing.
    placeSearch.search = async () => ({ documents: [] })
    for (let count = 8; count < 30; count += 1) {
      assert.equal((await call("GET", "/places?category=CS2", undefined, muse)).status, 200)
    }
    assert.equal((await call("GET", "/places?category=CS2", undefined, muse)).status, 429)
    assert.equal((await call("GET", "/places?category=CS2")).status, 200)
  } finally {
    placeSearch.search = search
    config.kakaoRestApiKey = key
    Object.assign(demo, { email: saved.email, school: saved.school })
    group.school = saved.groupSchool
  }
})

test("visitors see made-up shops around the demo group's campus, and Kakao isn't asked", async () => {
  const { placeSearch, placeRadius } = await import("./lib/places.js")
  const { campuses } = await import("./data/campuses.js")
  const { exampleShops } = await import("./data/exampleShops.js")
  const { distanceKm } = await import("./lib/geo.js")
  const { placeCategories } = await import("./lib/validation.js")
  const search = placeSearch.search
  const key = config.kakaoRestApiKey
  let asked = 0
  placeSearch.search = async () => {
    asked += 1
    return { documents: [] }
  }
  try {
    const campus = campuses.find((item) => item.name === "삼육대학교")!
    // Every kind the chips offer has some.
    for (const kind of placeCategories) assert.ok(exampleShops.some((shop) => shop.kind === kind), kind)
    // The same examples with the map key or without it.
    for (const value of [undefined, "test-key"]) {
      config.kakaoRestApiKey = value
      const all = (await call("GET", "/places?category=all")).data
      assert.equal(all.example, true)
      assert.equal(all.campus, "삼육대학교")
      assert.deepEqual(all.center, { lat: campus.lat, lng: campus.lng })
      assert.equal(all.places.length, exampleShops.length)
      const distances = all.places.map((place: { distanceM: number }) => place.distanceM)
      assert.deepEqual(distances, [...distances].sort((a, b) => a - b))
      for (const place of all.places) {
        // Near the campus and placed where they say, with an address read
        // from it and no map page or phone number.
        assert.ok(place.distanceM <= placeRadius, place.name)
        assert.ok(Math.abs(distanceKm(campus, place) * 1000 - place.distanceM) < 100, place.name)
        assert.ok(place.address.startsWith("삼육대학교 "), place.name)
        assert.equal(place.url, undefined)
        assert.equal(place.phone, undefined)
      }
    }
    // One kind at a time, as the chips pick.
    const cafes = (await call("GET", "/places?category=CE7")).data.places
    assert.ok(cafes.length > 0)
    assert.ok(cafes.every((place: { kind: string }) => place.kind === "CE7"))
    assert.equal(asked, 0)
    // A logged-in group still gets the real shops around its campus.
    const found = (await call("GET", "/places?category=CE7", undefined, await login("학생단체"))).data
    assert.equal(found.example, undefined)
    assert.equal(asked, 1)
  } finally {
    placeSearch.search = search
    config.kakaoRestApiKey = key
  }
})

test("a student group invites a shop it found nearby, and the shop joins as a brand", async () => {
  const { placeSearch } = await import("./lib/places.js")
  const { mailTransport } = await import("./lib/mailer.js")
  const search = placeSearch.search
  const key = config.kakaoRestApiKey
  const post = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (message) => {
    sent.push(message)
    return new Response(null, { status: 200 })
  }
  const mail = { apiKey: config.resendApiKey, from: config.mailFrom }
  config.resendApiKey = "test-resend-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  try {
    const group = await signUpMember("inviter@syu.ac.kr", "inviter-pass-123")
    const brand = await login("브랜드")

    // Only a logged-in student group invites, a shop by its Kakao place ID,
    // and not the shared demo group: an invitation reaches a real shop.
    assert.equal((await call("POST", "/invites", { placeId: "26338954" })).status, 401)
    assert.equal((await call("POST", "/invites", { placeId: "26338954" }, brand)).status, 403)
    assert.equal((await call("POST", "/invites", { placeId: "26338954" }, await login("학생단체"))).status, 403)
    for (const placeId of ["", "abc", "1/2", "1".repeat(16), undefined]) {
      assert.equal((await call("POST", "/invites", { placeId }, group)).status, 400, String(placeId))
    }
    const made = await call("POST", "/invites", { placeId: "26338954" }, group)
    assert.equal(made.status, 201)
    const { code } = made.data.invite
    assert.match(code, /^[\w-]{8}$/)
    // All it keeps of the shop is what Kakao allows: the ID and its map page.
    const stored = getDatabase().invites.find((invite) => invite.code === code)!
    assert.deepEqual(Object.keys(stored).sort(), ["accountId", "code", "createdAt", "placeId", "placeUrl"])
    assert.equal(stored.placeUrl, "https://place.map.kakao.com/26338954")
    // Asked again for the same shop, the same invitation comes back.
    const again = await call("POST", "/invites", { placeId: "26338954" }, group)
    assert.equal(again.status, 200)
    assert.equal(again.data.invite.code, code)

    // Anyone with the link sees who invited, and not who they are.
    const page = await call("GET", `/invites/${code}`)
    assert.equal(page.status, 200)
    assert.equal(page.data.group.name, "inviter 동아리")
    assert.equal(page.data.group.school, "삼육대학교")
    assert.equal(page.data.group.score, undefined)
    assert.equal(page.data.invite.joined, null)
    assert.equal(page.data.invite.placeUrl, "https://place.map.kakao.com/26338954")
    assert.ok(!JSON.stringify(page.data).includes("inviter@syu.ac.kr"))
    assert.equal((await call("GET", "/invites/nope")).status, 404)

    // On 가까운 순 the group sees the shop as invited.
    config.kakaoRestApiKey = "test-key"
    placeSearch.search = async () => ({
      documents: [
        { id: "26338954", place_name: "골목 카페", category_name: "음식점 > 카페", address_name: "서울 노원구 공릉동 2", distance: "200", place_url: "http://place.map.kakao.com/26338954", x: "127.1052", y: "37.6438" },
        { id: "777", place_name: "옆집 분식", category_name: "음식점 > 분식", address_name: "서울 노원구 공릉동 3", distance: "300", place_url: "http://place.map.kakao.com/777", x: "127.1071", y: "37.6411" },
      ],
    })
    const shops = async (token?: string) =>
      (await call("GET", "/places?category=CE7", undefined, token)).data.places as { id: string; invited?: true; brandId?: string }[]
    assert.deepEqual(
      (await shops(group)).map(({ id, invited, brandId }) => ({ id, invited, brandId })),
      [
        { id: "26338954", invited: true, brandId: undefined },
        { id: "777", invited: undefined, brandId: undefined },
      ],
    )
    // Visitors see only the made-up examples, never the shops groups found.
    const examplesOnly = async () => (await shops()).every((place) => place.id.startsWith("example-") && !place.invited && !place.brandId)
    assert.ok(await examplesOnly())

    // Only a brand takes it, and not the shared demo brand.
    assert.equal((await call("POST", `/invites/${code}/accept`)).status, 401)
    assert.equal((await call("POST", `/invites/${code}/accept`, undefined, group)).status, 403)
    assert.equal((await call("POST", `/invites/${code}/accept`, undefined, brand)).status, 403)
    assert.equal((await call("POST", "/invites/nope/accept", undefined, await signUpMember("nobody@nope-cafe.kr", "nope-pass-123", "브랜드"))).status, 404)

    // Another group nearby invited the same shop.
    const neighbour = await signUpMember("invite-one@syu.ac.kr", "invite-one-123")
    const neighbourCode = (await call("POST", "/invites", { placeId: "26338954" }, neighbour)).data.invite.code

    // The shop's owner signs up as a brand and takes it: the new brand is
    // listed at once, as that shop.
    const owner = await signUpMember("owner@golmok-cafe.kr", "golmok-pass-123", "브랜드")
    const accepted = await call("POST", `/invites/${code}/accept`, undefined, owner)
    assert.equal(accepted.status, 200)
    assert.equal(accepted.data.invite.joined, "you")
    const listing = accepted.data.listing
    assert.equal(listing.name, "owner 카페")
    assert.equal(listing.kakaoPlaceId, "26338954")
    assert.ok(getDatabase().brands.some((item) => item.id === listing.id))
    assert.equal((await call("GET", `/invites/${code}`, undefined, owner)).data.invite.joined, "you")
    assert.equal((await call("GET", `/invites/${code}`)).data.invite.joined, "other")
    // Taking it twice changes nothing.
    assert.equal((await call("POST", `/invites/${code}/accept`, undefined, owner)).status, 200)
    // The groups that invited it hear about it, with the brand's page on 추천 매칭.
    for (const address of ["inviter@syu.ac.kr", "invite-one@syu.ac.kr"]) {
      const notice = sent.find((message) => message.to.includes(address) && message.subject.includes("초대"))!
      assert.match(notice.subject, /초대한 가게가 uniconnect에 가입했어요/)
      assert.match(notice.text, /owner 카페에서 초대를 받고/)
    }

    // 가까운 순 now shows the shop joined to members nearby. Visitors still
    // see only the examples.
    assert.equal((await shops(group))[0].brandId, listing.id)
    assert.ok(await examplesOnly())

    // Another group's invitation to the same shop can't hand it to a second brand.
    const otherGroup = await signUpMember("invite-two@syu.ac.kr", "invite-two-123")
    const second = (await call("POST", "/invites", { placeId: "26338954" }, otherGroup)).data.invite.code
    const rival = await signUpMember("rival@rival-cafe.kr", "rival-pass-123", "브랜드")
    const taken = await call("POST", `/invites/${second}/accept`, undefined, rival)
    assert.equal(taken.status, 409)
    assert.match(taken.data.error, /이미 다른 브랜드와 연결된 가게/)
    // And a brand that is one shop already can't become another.
    const elsewhere = (await call("POST", "/invites", { placeId: "777" }, otherGroup)).data.invite.code
    const twice = await call("POST", `/invites/${elsewhere}/accept`, undefined, owner)
    assert.equal(twice.status, 409)
    assert.match(twice.data.error, /이미 다른 가게와 연결된 브랜드/)

    // The data download holds the invitations on both sides.
    const groupExport = (await call("GET", "/auth/export", undefined, otherGroup)).data
    assert.deepEqual(groupExport.invites.map((item: { placeId: string }) => item.placeId).sort(), ["26338954", "777"])
    const ownerExport = (await call("GET", "/auth/export", undefined, owner)).data
    assert.deepEqual(ownerExport.invites.map((item: { code: string }) => item.code), [code, neighbourCode])

    // When the brand leaves, the shop is open again; when a group leaves, its invitations go.
    assert.equal((await call("DELETE", "/auth/account", { password: "golmok-pass-123" }, owner)).status, 204)
    const reopened = getDatabase().invites.find((invite) => invite.code === code)!
    assert.equal(reopened.brandId, undefined)
    assert.equal(reopened.acceptedAt, undefined)
    assert.equal((await shops(group))[0].brandId, undefined)
    assert.equal((await call("DELETE", "/auth/account", { password: "invite-two-123" }, otherGroup)).status, 204)
    assert.equal(getDatabase().invites.some((invite) => invite.code === second || invite.code === elsewhere), false)

    // A group may have invited at most 100 shops.
    const { inviteLimit } = await import("./routes/invites.js")
    const crowd = await signUpMember("invite-many@syu.ac.kr", "invite-many-123")
    const crowdId = getDatabase().accounts.find((account) => account.email === "invite-many@syu.ac.kr")!.id
    for (let index = 0; index < inviteLimit; index += 1) {
      getDatabase().invites.push({ code: `many-${index}`, accountId: crowdId, placeId: String(index), placeUrl: "", createdAt: "" })
    }
    const over = await call("POST", "/invites", { placeId: "99999" }, crowd)
    assert.equal(over.status, 409)
    assert.match(over.data.error, /100곳/)
  } finally {
    placeSearch.search = search
    config.kakaoRestApiKey = key
    mailTransport.post = post
    config.resendApiKey = mail.apiKey
    config.mailFrom = mail.from
    getDatabase().invites = getDatabase().invites.filter((invite) => !invite.code.startsWith("many-"))
  }
})

test("an e-contract sets how its sponsorship is confirmed, which counts once both sides confirm it", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const day = addDays(todayInKorea(), 7)
  const group = await signUpMember("methods-club@syu.ac.kr", "methods-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "methods-club@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("methods@methods-cafe.kr", "methods-pass-123", "브랜드")
  const brandId = getDatabase().accounts.find((account) => account.email === "methods@methods-cafe.kr")!.id
  await call("POST", "/events", { name: "측정 축제", date: day, people: "300명", types: ["제품"] }, group)
  assert.equal((await call("POST", "/proposals", { matchId: listingId }, group)).status, 201)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const agreementPath = `/agreements/${request.id}`
  const defaults = [
    { kind: "qr", side: "group" },
    { kind: "coupon", side: "brand" },
    { kind: "visit", side: "brand" },
  ]

  // Until the e-contract says otherwise: the QR, its coupon and the store's
  // visits, which the brand confirms with its store PIN on the staff page;
  // the group has nothing to record by hand, so no venue page yet.
  const before = (await call("GET", agreementPath, undefined, group)).data.agreement
  assert.deepEqual(before.measure.methods, defaults)
  assert.equal(before.measure.confirmedMethods, undefined)
  assert.equal(before.measure.venue, undefined)
  const code = before.measure.code
  const brandBefore = (await call("GET", agreementPath, undefined, brand)).data.agreement
  assert.equal(brandBefore.measure.venue.page, "staff")
  assert.match(brandBefore.measure.venue.pin, /^\d{4}$/)

  // Either side sets them; unknown, repeated or empty ones are turned away,
  // store visits stay the brand's, the coupon needs the QR and visits the coupon.
  for (const [methods, error] of [
    [[], /하나 이상/],
    ["booth", /다시 확인/],
    [[{ kind: "drone", side: "group" }], /다시 확인/],
    [[{ kind: "booth", side: "anyone" }], /확인할 쪽/],
    [[{ kind: "qr", side: "group" }, { kind: "coupon", side: "brand" }, { kind: "visit", side: "group" }], /브랜드 매장/],
    [[{ kind: "booth", side: "group" }, { kind: "booth", side: "brand" }], /두 번/],
    [[{ kind: "coupon", side: "brand" }], /QR 체크인과 함께/],
    [[{ kind: "qr", side: "group" }, { kind: "visit", side: "brand" }], /쿠폰 발급과 함께/],
  ] as const) {
    const refused = await call("PUT", `${agreementPath}/methods`, { methods }, group)
    assert.equal(refused.status, 400, JSON.stringify(methods))
    assert.match(refused.data.error, error)
  }
  await call("POST", `${agreementPath}/confirm`, undefined, brand)
  const methods = [
    { kind: "survey", side: "brand" },
    { kind: "sns", side: "group" },
    { kind: "sampling", side: "brand" },
    { kind: "booth", side: "both" },
  ]
  const set = await call("PUT", `${agreementPath}/methods`, { methods }, group)
  assert.equal(set.status, 200)
  // In the listed order; like the items, a change takes back the confirmations.
  const measure = set.data.agreement.measure
  assert.deepEqual(measure.methods.map((method: { kind: string }) => method.kind), ["sampling", "booth", "sns", "survey"])
  assert.deepEqual(set.data.agreement.confirmed, {})
  // Its venue page waits until both sides confirm them; its PIN is in its
  // report (the venue QR on 성과) all along.
  assert.equal(measure.venue, undefined)
  const groupPin = (await call("GET", `/measurements/${request.eventId}`, undefined, group)).data.report.groupPin
  assert.match(groupPin, /^\d{4}$/)
  // The brand gets its store PIN, never the group's.
  const forBrand = (await call("GET", agreementPath, undefined, brand)).data.agreement
  assert.equal(forBrand.measure.venue.page, "staff")
  const staffPin = forBrand.measure.venue.pin
  assert.equal(staffPin, getDatabase().measurements.find((item) => item.code === code)!.sponsors[0].staffPin)
  assert.equal(JSON.stringify(forBrand).includes("groupPin"), false)

  // Not yet confirmed by both, so the default still counts: the coupon is
  // offered, and the new methods can't be counted at the venue.
  assert.equal((await call("GET", `/check-in/${code}`)).data.coupons.length, 1)
  const groupShares = async () => (await call("POST", `/check-in/${code}/group/session`, { pin: groupPin })).data.shares
  assert.deepEqual((await groupShares())[0].kinds, ["qr"])

  // Once both sides confirm, the e-contract's methods count.
  await call("POST", `${agreementPath}/confirm`, undefined, group)
  const settled = (await call("POST", `${agreementPath}/confirm`, undefined, brand)).data.agreement
  assert.deepEqual(settled.measure.confirmedMethods, settled.measure.methods)
  assert.deepEqual(
    (await call("GET", agreementPath, undefined, group)).data.agreement.measure.venue,
    { page: "group", pin: groupPin },
  )
  // Without the coupon, participants are offered none.
  assert.deepEqual((await call("GET", `/check-in/${code}`)).data.coupons, [])

  // Each venue page opens with its own PIN, showing what that side confirms,
  // a method both confirm on both.
  assert.equal((await call("POST", `/check-in/${code}/group/session`, { pin: groupPin === "0000" ? "0001" : "0000" })).status, 403)
  const shares = await groupShares()
  assert.deepEqual(
    shares.map((share: { brandName: string; kinds: string[] }) => [share.brandName, share.kinds]),
    [["methods 카페", ["booth", "sns"]]],
  )
  const share = shares[0].id
  assert.deepEqual((await call("POST", `/check-in/${code}/staff/session`, { pin: staffPin })).data.shares[0].kinds, ["sampling", "booth", "survey"])

  // Nothing counts before the event's days.
  const count = (page: "group" | "staff", body: Record<string, unknown>) =>
    call("POST", `/check-in/${code}/${page}/count`, { pin: page === "group" ? groupPin : staffPin, share, ...body })
  assert.equal((await count("group", { method: "booth" })).status, 409)

  const event = getDatabase().events[groupId].find((item) => item.id === request.eventId)!
  const sponsorship = getDatabase().sponsorships[brandId].find((item) => item.id === `sp-${request.id}`)!
  event.date = todayInKorea()
  sponsorship.date = todayInKorea()
  try {
    // On the day, each side counts what is its own, and both count the stamps.
    const stamped = await count("group", { method: "booth" })
    assert.equal(stamped.status, 200)
    assert.equal(stamped.data.share.counts.stamps, 1)
    assert.equal(stamped.data.entry.detail, "부스 방문 · 스탬프")
    assert.equal((await count("staff", { method: "booth" })).data.share.counts.stamps, 2)
    assert.equal((await count("group", { method: "sns" })).data.share.counts.posts, 1)
    assert.equal((await count("staff", { method: "survey" })).data.share.counts.surveys, 1)
    assert.equal((await count("group", { method: "sampling", amount: 3 })).status, 403)
    assert.equal((await count("staff", { method: "sns" })).status, 403)
    assert.equal((await count("staff", { method: "raffle" })).status, 409)
    assert.equal((await count("staff", { method: "visit" })).status, 404)
    assert.equal((await count("group", { method: "booth", share: "elsewhere" })).status, 404)
    // Store visits aren't confirmed in this sponsorship.
    assert.equal((await call("POST", `/check-in/${code}/staff/visits`, { pin: staffPin, coupon: "UC-AAAAAA" })).status, 409)
    // A box of samples at once, one stamp at a time, and a mistake taken
    // back, never below zero.
    assert.equal((await count("staff", { method: "sampling", amount: 501 })).status, 400)
    assert.equal((await count("staff", { method: "sampling", amount: 40 })).data.share.counts.samples, 40)
    assert.equal((await count("staff", { method: "sampling", amount: -5 })).data.share.counts.samples, 35)
    assert.equal((await count("group", { method: "booth", amount: 2 })).status, 400)
    assert.equal((await count("group", { method: "booth", amount: -1 })).data.share.counts.stamps, 1)
    assert.equal((await count("group", { method: "sns", amount: -1 })).data.share.counts.posts, 0)
    assert.equal((await count("group", { method: "sns", amount: -1 })).status, 409)

    // Both sides read the counts on the e-contract, the group in its report
    // with its venue PIN and only the confirmed methods, and the brand in
    // its analytics.
    const counts = (await call("GET", agreementPath, undefined, brand)).data.agreement.measure.counts
    assert.deepEqual([counts.samples, counts.stamps, counts.posts, counts.surveys], [35, 1, 0, 1])
    const { metrics, report } = (await call("GET", `/measurements/${request.eventId}`, undefined, group)).data
    assert.deepEqual([metrics.samples, metrics.stamps, metrics.surveys], [35, 1, 1])
    assert.deepEqual([report.venue.samples, report.venue.stamps, report.venue.surveys], [35, 1, 1])
    assert.equal(report.groupPin, groupPin)
    assert.deepEqual(report.sponsors[0].methods.map((method: { kind: string }) => method.kind), ["sampling", "booth", "sns", "survey"])
    assert.deepEqual([report.sponsors[0].samples, report.sponsors[0].surveys], [35, 1])
    const analytics = (await call("GET", "/analytics", undefined, brand)).data.sponsorships
    const row = analytics.find((item: { id: string }) => item.id === sponsorship.id)
    assert.deepEqual([row.samples, row.stamps, row.surveys], [35, 1, 1])

    // Once the event has begun, the methods stay as they are.
    assert.equal((await call("PUT", `${agreementPath}/methods`, { methods }, brand)).status, 409)
  } finally {
    event.date = day
    sponsorship.date = day
  }

  // A brand's campaign is confirmed as a whole: an offer's e-contract sets
  // the campaign's own methods, and the group's page opens it as one share.
  const { token: campaignGroup, listingId: campaignListing } = await listedMember("campaign-club@syu.ac.kr", "campaign-pass-123")
  await call("POST", "/events", { name: "측정 캠페인", date: day, types: ["제품"] }, brand)
  assert.equal((await call("POST", "/proposals", { matchId: campaignListing }, brand)).status, 201)
  const [offer] = (await call("GET", "/offers", undefined, campaignGroup)).data.offers
  await call("POST", `/offers/${offer.id}/accept`, undefined, campaignGroup)
  const offerPath = `/agreements/${offer.id}`
  const campaignMethods = [...defaults, { kind: "experience", side: "group" }]
  assert.equal((await call("PUT", `${offerPath}/methods`, { methods: campaignMethods }, campaignGroup)).status, 200)
  await call("POST", `${offerPath}/confirm`, undefined, campaignGroup)
  const confirmed = (await call("POST", `${offerPath}/confirm`, undefined, brand)).data.agreement.measure
  const campaignSession = (await call("POST", `/check-in/${confirmed.code}/group/session`, { pin: (await call("GET", offerPath, undefined, campaignGroup)).data.agreement.measure.venue.pin })).data
  assert.deepEqual(
    campaignSession.shares.map((item: { id: string; brandName: string | null; kinds: string[] }) => [item.id, item.brandName, item.kinds]),
    [["event", null, ["qr", "experience"]]],
  )
  // Its coupon is still offered, and the brand's own report has no group PIN.
  assert.equal((await call("GET", `/check-in/${confirmed.code}`)).data.coupons.length, 1)
  const campaignId = getDatabase().offers.find((item) => item.id === offer.id)!.campaignId!
  const brandReport = (await call("GET", `/measurements/${campaignId}`, undefined, brand)).data.report
  assert.deepEqual(brandReport.methods, campaignMethods)
  assert.equal(brandReport.groupPin, undefined)
  assert.match(brandReport.staffPin, /^\d{4}$/)
})

test("methods saved before they were split, and e-contracts already confirmed, keep counting", async () => {
  const { upgradeMethods } = await import("./lib/methods.js")
  // The coupon then stood for the QR, the coupon and the store's visits.
  assert.deepEqual(upgradeMethods([{ kind: "coupon", side: "brand" }, { kind: "booth", side: "group" }]), [
    { kind: "qr", side: "group" },
    { kind: "coupon", side: "brand" },
    { kind: "visit", side: "brand" },
    { kind: "booth", side: "group" },
  ])
  const split = [{ kind: "qr", side: "group" }, { kind: "coupon", side: "brand" }] as const
  assert.deepEqual(upgradeMethods([...split]), split)
  assert.equal(upgradeMethods(undefined), undefined)
})

test("both sides of an accepted proposal keep an agreement, confirm it and prove what they did", async () => {
  const { existsSync } = await import("node:fs")
  const { uploadsFolder } = await import("./lib/agreements.js")
  const brand = await login("브랜드")

  // The demo brand's accepted proposal from a group without an account.
  const listed = (await call("GET", "/agreements", undefined, brand)).data.agreements as { id: string; side: string; partner: string; total: number }[]
  const runners = listed.find((item) => item.id === "req-runners")!
  assert.deepEqual([runners.side, runners.partner, runners.total], ["brand", "서울여대 러너스", 6])
  const opened = (await call("GET", "/agreements/req-runners", undefined, brand)).data.agreement
  assert.equal(opened.items[0].label, "협찬 전달: 완주 기념 음료 80잔")
  assert.deepEqual(
    opened.items.map((item: { side: string }) => item.side),
    ["brand", "brand", "group", "group", "group", "group"],
  )
  assert.deepEqual([opened.group.member, opened.brand.member, opened.side], [false, true, "brand"])
  // Only the two sides see it, and only for an accepted proposal.
  assert.equal((await call("GET", "/agreements/req-runners")).status, 401)
  assert.equal((await call("GET", "/agreements/req-runners", undefined, await login("학생단체"))).status, 404)
  assert.equal((await call("GET", "/agreements/req-movement", undefined, brand)).status, 404)
  assert.equal((await call("GET", "/agreements/constructor", undefined, brand)).status, 404)

  // Two members: a group proposes, and the brand accepts.
  const group = await signUpMember("agreement-club@syu.ac.kr", "agreement-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "agreement-club@syu.ac.kr")!.id
  const { token: partner, listingId: partnerListing } = await listedMember("agreement@agreement-cafe.kr", "agreement-pass-123", "브랜드")
  await call("POST", "/events", { name: "약속 공연", date: "2026-12-12", people: "200명", types: ["제품"] }, group)
  assert.equal((await call("POST", "/proposals", { matchId: partnerListing }, group)).status, 201)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).status, 404)
  await call("POST", `/requests/${request.id}/accept`, undefined, partner)
  const forGroup = (await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement
  assert.deepEqual([forGroup.side, forGroup.group.member, forGroup.brand.member], ["group", true, true])
  assert.equal(forGroup.brand.name, "agreement 카페")
  const brandItem = forGroup.items.find((item: { side: string }) => item.side === "brand")
  const groupItem = forGroup.items.find((item: { side: string }) => item.side === "group")
  // The event is the group's, its goals set from here until it begins; the
  // brand reads them, without the PINs and coupons. A group without an
  // account has no event here.
  assert.deepEqual(forGroup.event, { id: request.eventId, owner: "group", started: false })
  assert.deepEqual(Object.keys(forGroup.goals).sort(), ["expectedAudience", "targets"])
  const forBrand = (await call("GET", `/agreements/${request.id}`, undefined, partner)).data.agreement
  assert.deepEqual([forBrand.event.owner, forBrand.goals.targets], ["group", forGroup.goals.targets])
  assert.equal(opened.event, undefined)

  // Each side confirms, and the other hears about it.
  const { mailTransport } = await import("./lib/mailer.js")
  const post = mailTransport.post
  const sent: { to: string[]; subject: string }[] = []
  mailTransport.post = async (message) => {
    sent.push(message)
    return new Response(null, { status: 200 })
  }
  const mail = { apiKey: config.resendApiKey, from: config.mailFrom }
  config.resendApiKey = "test-resend-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  try {
    const confirmed = (await call("POST", `/agreements/${request.id}/confirm`, undefined, group)).data.agreement
    assert.ok(confirmed.confirmed.group)
    assert.equal(confirmed.confirmed.brand, undefined)
    assert.ok(sent.some((message) => message.to.includes("agreement@agreement-cafe.kr")))
    const both = (await call("POST", `/agreements/${request.id}/confirm`, undefined, partner)).data.agreement
    assert.ok(both.confirmed.group && both.confirmed.brand)
    assert.ok(sent.some((message) => message.to.includes("agreement-club@syu.ac.kr") && /양쪽 모두/.test(message.subject)))
  } finally {
    mailTransport.post = post
    config.resendApiKey = mail.apiKey
    config.mailFrom = mail.from
  }

  // The group marks its own item done with a link; never the brand's.
  const link = "https://instagram.com/p/agreement"
  assert.equal((await call("PATCH", `/agreements/${request.id}/items/${brandItem.id}`, { done: true }, group)).status, 403)
  assert.equal((await call("PATCH", `/agreements/${request.id}/items/${groupItem.id}`, { links: ["javascript:alert(1)"] }, group)).status, 400)
  assert.equal(
    (await call("PATCH", `/agreements/${request.id}/items/${groupItem.id}`, { links: Array.from({ length: 6 }, (_, index) => `${link}/${index}`) }, group)).status,
    400,
  )
  const done = (await call("PATCH", `/agreements/${request.id}/items/${groupItem.id}`, { done: true, links: [link] }, group)).data.agreement
  const marked = done.items.find((item: { id: string }) => item.id === groupItem.id)
  assert.ok(marked.doneAt)
  assert.deepEqual(marked.links, [link])
  assert.equal((await call("PATCH", `/agreements/${request.id}/items/nope`, { done: true }, group)).status, 404)

  // A photo as proof is kept on disk, and the other side can see it.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  const photos = `/agreements/${request.id}/items/${groupItem.id}/photos`
  assert.equal((await call("POST", photos, { image: "data:image/png;base64,aGVsbG8=" }, group)).status, 400)
  assert.equal((await call("POST", photos, { image: png.replace("image/png", "image/gif") }, group)).status, 400)
  assert.equal((await call("POST", `/agreements/${request.id}/items/${brandItem.id}/photos`, { image: png }, group)).status, 403)
  const uploaded = await call("POST", photos, { image: png }, group)
  assert.equal(uploaded.status, 201)
  const photo = uploaded.data.agreement.items.find((item: { id: string }) => item.id === groupItem.id).photos[0] as string
  assert.match(photo, /^[\w-]+\.png$/)
  assert.ok(existsSync(path.join(uploadsFolder(request.id), photo)))
  const seen = await fetch(`${baseUrl}/agreements/${request.id}/photos/${photo}`, { headers: { Authorization: `Bearer ${partner}` } })
  assert.equal(seen.status, 200)
  assert.equal(seen.headers.get("content-type"), "image/png")
  assert.equal(Buffer.from(await seen.arrayBuffer()).toString("base64"), png.split(",")[1])
  assert.equal((await fetch(`${baseUrl}/agreements/${request.id}/photos/${photo}`)).status, 401)
  assert.equal((await call("GET", `/agreements/${request.id}/photos/..%2Fdb.json`, undefined, partner)).status, 404)
  await call("POST", photos, { image: png }, group)
  await call("POST", photos, { image: png }, group)
  assert.equal((await call("POST", photos, { image: png }, group)).status, 409)
  const removed = await call("DELETE", `${photos}/${photo}`, undefined, group)
  assert.equal(removed.status, 200)
  assert.ok(!existsSync(path.join(uploadsFolder(request.id), photo)))

  // Changing the items asks both sides again; the items kept keep their proof.
  const items = done.items.map(({ id, side, label }: { id: string; side: string; label: string }) => ({ id, side, label }))
  assert.equal((await call("PUT", `/agreements/${request.id}/items`, { items: [] }, partner)).status, 400)
  assert.equal((await call("PUT", `/agreements/${request.id}/items`, { items: [{ side: "nobody", label: "x" }] }, partner)).status, 400)
  assert.equal((await call("PUT", `/agreements/${request.id}/items`, { items: [{ side: "brand", label: "가".repeat(81) }] }, partner)).status, 400)
  const edited = (
    await call("PUT", `/agreements/${request.id}/items`, { items: [...items, { side: "brand", label: "공연 당일 커피 트럭 보내기" }] }, partner)
  ).data.agreement
  assert.deepEqual(edited.confirmed, {})
  assert.equal(edited.items.length, 7)
  assert.deepEqual(edited.items.find((item: { id: string }) => item.id === groupItem.id).links, [link])
  // Writing the same items again changes nothing.
  const reconfirmed = (await call("POST", `/agreements/${request.id}/confirm`, undefined, group)).data.agreement
  const same = edited.items.map(({ id, side, label }: { id: string; side: string; label: string }) => ({ id, side, label }))
  assert.ok((await call("PUT", `/agreements/${request.id}/items`, { items: same }, partner)).data.agreement.confirmed.group)
  assert.ok(reconfirmed.confirmed.group)

  // The list shows how far it is, and the data download holds it.
  const summary = (await call("GET", "/agreements", undefined, group)).data.agreements[0]
  assert.deepEqual([summary.id, summary.partner, summary.done, summary.total, summary.proof], [request.id, "agreement 카페", 1, 7, 3])
  const exported = (await call("GET", "/auth/export", undefined, group)).data
  assert.deepEqual(exported.agreements.map((item: { id: string }) => item.id), [request.id])

  // When the group leaves, the agreement and its photos go.
  assert.equal((await call("DELETE", "/auth/account", { password: "agreement-pass-123" }, group)).status, 204)
  assert.equal(getDatabase().agreements.some((item) => item.id === request.id), false)
  assert.ok(!existsSync(uploadsFolder(request.id)))
})

test("after the event each side reviews the other, and the reviews show on the listing", async () => {
  const { todayInKorea } = await import("./lib/dates.js")
  type Summary = { count: number; average: number; tags: { tag: string; count: number }[] }
  const about = async (id: string) =>
    (await call("GET", `/reviews?about=${id}`)).data as { summary: Summary; reviews: Record<string, unknown>[] }

  // The seeded reviews, for anyone, without who wrote them behind the name.
  const seeded = await about("afternoon-coffee")
  assert.deepEqual([seeded.summary.count, seeded.summary.average], [2, 4.5])
  // How many picked each tag, the most picked first, for the page's bars.
  assert.deepEqual(
    seeded.summary.tags.map((item) => item.tag),
    ["다시 함께하고 싶어요", "매장 응대가 친절해요", "약속을 잘 지켜요", "응답이 빨라요"],
  )
  assert.equal(seeded.reviews[0].authorName, "삼육대 뮤즈")
  assert.equal(seeded.reviews[0].proposalId, undefined)
  assert.equal(seeded.reviews[0].authorAccountId, undefined)
  const brands = (await call("GET", "/brands")).data.brands as { id: string; rating?: number; reviewCount?: number }[]
  const coffee = brands.find((brand) => brand.id === "afternoon-coffee")!
  assert.deepEqual([coffee.rating, coffee.reviewCount], [4.5, 2])
  assert.equal(brands.find((brand) => brand.id === "freshon")!.reviewCount, undefined)

  // Two members: a group's event today, proposed to a brand and accepted.
  const group = await signUpMember("review-club@syu.ac.kr", "review-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "review-club@syu.ac.kr")!.id
  const { token: brand, listingId: brandListing } = await listedMember("review@review-cafe.kr", "review-pass-123", "브랜드")
  await call("POST", "/events", { name: "후기 공연", date: todayInKorea(), people: "100명", types: ["제품"] }, group)
  assert.equal((await call("POST", "/proposals", { matchId: brandListing }, group)).status, 201)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const route = `/reviews/${request.id}`

  assert.equal((await call("PUT", route, { rating: 5 })).status, 401)
  assert.equal((await call("PUT", "/reviews/req-movement", { rating: 5 }, group)).status, 404)
  // Not before the event's day.
  const day = request.eventDate
  request.eventDate = "2099-01-01"
  assert.equal((await call("PUT", route, { rating: 5 }, group)).status, 409)
  assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.review.canWrite, false)
  request.eventDate = day
  for (const body of [
    { rating: 0 },
    { rating: 4.5 },
    { rating: 5, tags: ["약속을 잘 지켜요", "응답이 빨라요", "협찬 물품이 좋아요", "다시 함께하고 싶어요"] },
    // A tag for reviewing a group, not a brand.
    { rating: 5, tags: ["홍보를 잘해요"] },
    { rating: 5, tags: "약속을 잘 지켜요" },
    { rating: 5, comment: "가".repeat(301) },
  ]) {
    assert.equal((await call("PUT", route, body, group)).status, 400, JSON.stringify(body).slice(0, 60))
  }
  const written = await call("PUT", route, { rating: 5, tags: ["약속을 잘 지켜요", "약속을 잘 지켜요"], comment: "  커피가 맛있었어요.  " }, group)
  assert.equal(written.status, 201)
  assert.deepEqual(written.data.review.tags, ["약속을 잘 지켜요"])
  assert.equal(written.data.review.comment, "커피가 맛있었어요.")
  assert.equal(written.data.review.authorName, "review-club 동아리")
  // The shared demo accounts can't write reviews anyone would see.
  assert.equal((await call("PUT", "/reviews/req-runners", { rating: 1 }, await login("브랜드"))).status, 403)

  // Each side sees its own review and the other's on the agreement (the
  // group has no listing yet, so the brand has nowhere to review it).
  const forGroup = (await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.review
  assert.deepEqual([forGroup.open, forGroup.canWrite, forGroup.mine.rating, forGroup.theirs], [true, true, 5, undefined])
  const forBrand = (await call("GET", `/agreements/${request.id}`, undefined, brand)).data.agreement.review
  assert.deepEqual([forBrand.canWrite, forBrand.theirs.comment], [false, "커피가 맛있었어요."])

  // Writing again changes the one review.
  const rewritten = await call("PUT", route, { rating: 4, tags: [], comment: "" }, group)
  assert.equal(rewritten.status, 200)
  assert.ok(rewritten.data.review.updatedAt)
  const after = await about(brandListing)
  assert.deepEqual([after.summary.count, after.summary.average], [1, 4])
  assert.equal(after.reviews[0].authorName, "review-club 동아리")

  // The data download holds it; deleting it takes it off the listing.
  assert.equal((await call("GET", "/auth/export", undefined, group)).data.reviews.length, 1)
  assert.equal((await call("DELETE", route, undefined, group)).status, 204)
  assert.equal((await call("DELETE", route, undefined, group)).status, 404)
  assert.equal((await about(brandListing)).summary.count, 0)

  // Leaving takes the reviews it wrote with it.
  await call("PUT", route, { rating: 5 }, group)
  assert.equal((await about(brandListing)).summary.count, 1)
  assert.equal((await call("DELETE", "/auth/account", { password: "review-pass-123" }, group)).status, 204)
  assert.equal((await about(brandListing)).summary.count, 0)
})

test("the reviewed side answers a review once, shown under it, and a report can take the answer down", async () => {
  const { todayInKorea } = await import("./lib/dates.js")
  const { mailTransport } = await import("./lib/mailer.js")
  const realPost = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (body) => {
    sent.push(body)
    return new Response(null, { status: 200 })
  }
  config.resendApiKey = "test-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  const admin = async (route: string, body: unknown) =>
    (
      await fetch(baseUrl + route, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
        body: JSON.stringify(body),
      })
    ).status
  try {
    const group = await signUpMember("reply-club@syu.ac.kr", "reply-pass-123")
    const groupId = getDatabase().accounts.find((account) => account.email === "reply-club@syu.ac.kr")!.id
    const { token: brand, listingId: brandListing } = await listedMember("reply@reply-cafe.kr", "reply-pass-123", "브랜드")
    await call("POST", "/events", { name: "답글 공연", date: todayInKorea(), people: "100명", types: ["제품"] }, group)
    await call("POST", "/proposals", { matchId: brandListing }, group)
    const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
    await call("POST", `/requests/${request.id}/accept`, undefined, brand)
    const reply = `/reviews/${request.id}/reply`
    // Nothing to answer before the group's review.
    assert.equal((await call("PUT", reply, { text: "감사해요" }, brand)).status, 404)
    await call("PUT", `/reviews/${request.id}`, { rating: 5, tags: [], comment: "커피가 맛있었어요." }, group)
    assert.equal((await call("GET", `/agreements/${request.id}`, undefined, brand)).data.agreement.review.canReply, true)
    assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.review.canReply, false)

    for (const body of [{}, { text: "  " }, { text: "가".repeat(301) }]) {
      assert.equal((await call("PUT", reply, body, brand)).status, 400)
    }
    sent.length = 0
    const answered = await call("PUT", reply, { text: "  함께해서 즐거웠어요.  " }, brand)
    assert.equal(answered.status, 201)
    assert.equal(answered.data.review.reply.text, "함께해서 즐거웠어요.")
    await settle()
    // The reviewer hears about it once.
    assert.equal(sent.length, 1)
    assert.match(sent[0].subject, /답글/)
    assert.equal((await call("PUT", reply, { text: "다음에도 함께해요." }, brand)).status, 200)
    await settle()
    assert.equal(sent.length, 1)
    // Under the review for anyone, and kept when the group rewrites its review.
    await call("PUT", `/reviews/${request.id}`, { rating: 4, tags: [], comment: "고친 후기" }, group)
    const listed = (await call("GET", `/reviews?about=${brandListing}`)).data.reviews[0]
    assert.equal(listed.comment, "고친 후기")
    assert.equal(listed.reply.text, "다음에도 함께해요.")
    assert.ok(listed.reply.updatedAt)
    // The group has no review of its own part to answer, and the demo accounts can't answer.
    assert.equal((await call("PUT", reply, { text: "저도요" }, group)).status, 404)

    // A third member reports the answer; the operators take it down.
    const third = await signUpMember("reply-reader@syu.ac.kr", "reply-pass-123")
    const reported = await call("POST", "/reports", { kind: "reply", reviewKey: listed.key, reason: "욕설 · 괴롭힘" }, third)
    assert.equal(reported.status, 201)
    const brandId = getDatabase().accounts.find((account) => account.email === "reply@reply-cafe.kr")!.id
    const report = getDatabase().reports.find((item) => item.target.kind === "reply")!
    assert.equal(report.accountId, brandId)
    assert.equal(report.excerpt, "다음에도 함께해요.")
    assert.equal(await admin(`/admin/reports/${report.id}/resolve`, { action: "hide-reply" }), 200)
    // Gone for readers, the review stays; its author sees it was taken down.
    const after = (await call("GET", `/reviews?about=${brandListing}`)).data.reviews[0]
    assert.equal(after.comment, "고친 후기")
    assert.deepEqual(Object.keys(after.reply).sort(), ["createdAt", "hidden"])
    assert.equal((await call("POST", "/reports", { kind: "reply", reviewKey: listed.key, reason: "욕설 · 괴롭힘" }, third)).status, 404)
    assert.equal((await call("DELETE", reply, undefined, brand)).status, 204)
    assert.equal((await call("DELETE", reply, undefined, brand)).status, 404)
    assert.equal((await call("GET", `/reviews?about=${brandListing}`)).data.reviews[0].reply, undefined)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
  }
})

test("a member's calendar link gives calendar apps its events and sponsorship days, until it is replaced", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { token: group } = await listedMember("feed@syu.ac.kr", "feed-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "feed@syu.ac.kr")!.id
  const { token: brand, listingId: brandListing } = await listedMember("feed@feed-cafe.kr", "feed-pass-123", "브랜드")
  const day = addDays(todayInKorea(), 12)
  await call("POST", "/events", { name: "구독; 공연, 가을", date: day, endDate: addDays(day, 1), types: ["현금"] }, group)
  await call("POST", "/proposals", { matchId: brandListing }, group)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)

  assert.deepEqual((await call("GET", "/calendar/feed", undefined, brand)).data, { url: null })
  const made = await call("POST", "/calendar/feed", undefined, brand)
  assert.equal(made.status, 201)
  const url = made.data.url as string
  assert.match(url, /\/api\/calendar\/[\w-]{32}\.ics$/)
  // The calendar itself needs no login: the link is the key.
  const feed = await fetch(url)
  assert.equal(feed.status, 200)
  assert.match(feed.headers.get("content-type") ?? "", /^text\/calendar/)
  const text = await feed.text()
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"))
  // The brand's calendar has the day it sponsors, escaped as RFC 5545 asks.
  assert.match(text, /SUMMARY:협찬 · feed 동아리 구독\; 공연\\, 가을\r\n/)
  // Never in the account the app gets; the same link again from 내 정보.
  assert.equal((await call("GET", "/auth/me", undefined, brand)).data.account.calendarFeed, undefined)
  assert.equal((await call("GET", "/calendar/feed", undefined, brand)).data.url, url)
  // A new link stops the old one at once.
  const next = (await call("POST", "/calendar/feed", undefined, brand)).data.url as string
  assert.notEqual(next, url)
  assert.equal((await fetch(url)).status, 404)
  assert.equal((await fetch(next)).status, 200)
  // The group's own calendar has its event over its two days.
  const groupUrl = (await call("POST", "/calendar/feed", undefined, group)).data.url as string
  const groupText = await (await fetch(groupUrl)).text()
  assert.match(groupText, /SUMMARY:구독\; 공연\\, 가을\r\n/)
  assert.ok(groupText.includes(`DTSTART;VALUE=DATE:${day.replace(/-/g, "")}\r\n`))
  assert.ok(groupText.includes(`DTEND;VALUE=DATE:${addDays(day, 2).replace(/-/g, "")}\r\n`))
  // Deleting it stops it; the demo accounts can't make one, nor can a visitor.
  assert.equal((await call("DELETE", "/calendar/feed", undefined, brand)).status, 204)
  assert.equal((await fetch(next)).status, 404)
  assert.equal((await call("POST", "/calendar/feed", undefined, await login("학생단체"))).status, 403)
  assert.equal((await call("GET", "/calendar/feed")).status, 401)
  assert.equal((await call("GET", "/calendar/not-a-link.ics")).status, 404)
})

test("members choose which notice emails they get, in the language they use the app in", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
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
  const english = { "Content-Type": "application/json", "Accept-Language": "en-US,en;q=0.9" }
  try {
    // Signing up from an English page: the code comes in English, and the
    // account's emails follow.
    const email = "mail-en@syu.ac.kr"
    sent.length = 0
    const asked = await fetch(`${baseUrl}/auth/email-code`, {
      method: "POST",
      headers: english,
      body: JSON.stringify({ role: "학생단체", email }),
    })
    const code = (await asked.json()) as { devCode: string }
    assert.equal(sent[0].subject, "[uniconnect] Your sign-up code")
    assert.match(sent[0].text, /^Your uniconnect sign-up code is \d{6}\.\nEnter it within 3 minutes/)
    const check = await fetch(`${baseUrl}/auth/email-code/verify`, {
      method: "POST",
      headers: english,
      body: JSON.stringify({ email, code: code.devCode }),
    })
    const verified = (await check.json()) as { verificationToken: string }
    const signup = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: english,
      body: JSON.stringify({
        role: "학생단체",
        name: "메일 동아리",
        type: "공연 동아리",
        school: "삼육대학교",
        email,
        password: "mail-pass-123",
        verificationToken: verified.verificationToken,
        agreedToTerms: true,
        contact: testContact,
        over14: true,
      }),
    })
    const { token: group, account } = (await signup.json()) as { token: string; account: { language?: string } }
    assert.equal(account.language, "en")
    await call("PUT", "/profile", { intro: "캠퍼스에서 정기 공연을 여는 동아리예요.", offer: "관객 100명" }, group)

    const { token: brand, listingId: brandListing } = await listedMember("mail@mail-cafe.kr", "mail-pass-123", "브랜드")
    const preferences = (body: unknown, token = brand) => call("PUT", "/auth/preferences", body, token)
    for (const body of [{ language: "fr" }, { mailOff: "messages" }, { mailOff: ["spam"] }]) {
      assert.equal((await preferences(body)).status, 400)
    }
    // The brand turns message emails off: a message sends none, a proposal still goes.
    const saved = await preferences({ mailOff: ["messages", "messages"] })
    assert.deepEqual(saved.data.account.mailOff, ["messages"])
    sent.length = 0
    const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
    await call("POST", `/conversations/${chat.id}/messages`, { text: "안녕하세요" }, group)
    await call("POST", "/events", { name: "메일 공연", date: addDays(todayInKorea(), 10), types: ["현금"] }, group)
    await call("POST", "/proposals", { matchId: brandListing }, group)
    await settle()
    assert.deepEqual(sent.map((mail) => mail.subject), ["[uniconnect] 새 협찬 제안이 왔어요"])
    assert.match(sent[0].text, /받을 메일 바꾸기: https:\/\/uniconnect\.example\/me/)

    // The group uses the app in English: the brand's answer reaches it in English.
    sent.length = 0
    const request = (await call("GET", "/requests", undefined, brand)).data.requests[0]
    await call("POST", `/requests/${request.id}/accept`, undefined, brand)
    await settle()
    assert.equal(sent[0].subject, "[uniconnect] Your sponsorship is confirmed")
    assert.match(sent[0].text, /accepted the proposal for '메일 공연'\./)
    assert.match(sent[0].text, /Open: https:\/\/uniconnect\.example\/matches/)
    assert.match(sent[0].text, /Choose which emails you get: https:\/\/uniconnect\.example\/me/)
    // Back to Korean, and every kind on again.
    assert.equal((await preferences({ language: "ko", mailOff: [] }, group)).data.account.language, "ko")
    assert.equal((await preferences({ mailOff: [] })).data.account.mailOff, undefined)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
    config.siteUrl = undefined
  }
})

test("each Monday a member hears once of the best-fitting partners that joined in the past week", async () => {
  const { sendDigests } = await import("./lib/digest.js")
  const { mailTransport } = await import("./lib/mailer.js")
  const realPost = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (body) => {
    sent.push(body)
    return new Response(null, { status: 200 })
  }
  config.resendApiKey = "test-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  const database = getDatabase()
  const to = (email: string) => sent.filter((mail) => mail.to.includes(email))
  try {
    await listedMember("digest-club@syu.ac.kr", "digest-pass-123")
    await listedMember("digest@digest-cafe.kr", "digest-pass-123", "브랜드")
    await listedMember("digest-old@digest-old.kr", "digest-pass-123", "브랜드")
    const account = (email: string) => database.accounts.find((item) => item.email === email)!
    // Seen from a Monday in 2030: one brand joined that Saturday, one a month before.
    account("digest@digest-cafe.kr").createdAt = "2030-01-05T00:00:00.000Z"
    account("digest-old@digest-old.kr").createdAt = "2029-12-01T00:00:00.000Z"
    const monday = new Date("2030-01-07T01:00:00Z")
    // The sign-up codes went out above.
    sent.length = 0

    assert.ok((await sendDigests(database, monday)) >= 1)
    await settle()
    const [digest, ...more] = to("digest-club@syu.ac.kr")
    assert.equal(more.length, 0)
    assert.equal(digest.subject, "[uniconnect] 이번 주 새로 가입한 잘 맞는 브랜드 1곳")
    assert.match(digest.text, /^지난 일주일 동안 가입한 브랜드 가운데 잘 맞는 곳이에요\.\n· digest 카페 \(일치율 \d+%\)\n/)
    assert.doesNotMatch(digest.text, /digest-old/)
    // Once a Monday, however often the timer runs; not on other days.
    sent.length = 0
    assert.equal(await sendDigests(database, new Date("2030-01-07T05:00:00Z")), 0)
    assert.equal(await sendDigests(database, new Date("2030-01-08T01:00:00Z")), 0)
    await settle()
    assert.equal(sent.length, 0)
    // The next Monday the brand is no longer new; a member who turned the
    // digest off hears nothing, and the demo accounts never do.
    account("digest-old@digest-old.kr").createdAt = "2030-01-12T00:00:00.000Z"
    account("digest-club@syu.ac.kr").mailOff = ["digest"]
    await sendDigests(database, new Date("2030-01-14T01:00:00Z"))
    await settle()
    assert.equal(to("digest-club@syu.ac.kr").length, 0)
    assert.equal(to("muse@syu.ac.kr").length, 0)
    assert.equal(to("hello@afternoon-coffee.kr").length, 0)
  } finally {
    mailTransport.post = realPost
    config.resendApiKey = undefined
    config.mailFrom = undefined
  }
})

test("a group's event page shows its venue, introduction, photos and packages to those who see the group", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { eventPhotos, uploadsFolder } = await import("./lib/photos.js")
  const { existsSync } = await import("node:fs")
  const { token: group, listingId: groupListing } = await listedMember("page-club@syu.ac.kr", "page-pass-123")
  const { token: brand } = await listedMember("page@page-cafe.kr", "page-pass-123", "브랜드")
  const packages = [{ name: "메인 스폰서", gives: "현수막 로고, SNS 게시물 2회", asks: "현금 30만원" }]
  const body = {
    name: "페이지 공연",
    date: addDays(todayInKorea(), 20),
    types: ["현금"],
    venue: " 대강당 ",
    intro: "첫 줄\n둘째 줄",
    packages,
  }
  const made = await call("POST", "/events", body, group)
  assert.equal(made.status, 201)
  const event = made.data.event
  assert.deepEqual([event.venue, event.intro, event.packages], ["대강당", "첫 줄\n둘째 줄", packages])
  for (const extra of [
    { venue: "가".repeat(61) },
    { intro: "가".repeat(1001) },
    { packages: "메인" },
    { packages: [{ name: "", gives: "로고" }] },
    { packages: [{ name: "메인", gives: "가".repeat(201) }] },
    { packages: Array.from({ length: 5 }, () => ({ name: "메인", gives: "로고" })) },
  ]) {
    assert.equal((await call("POST", "/events", { ...body, ...extra }, group)).status, 400)
  }
  // A brand's campaign has no event page.
  const campaign = (await call("POST", "/events", { ...body, budget: "1000" }, brand)).data.event
  assert.deepEqual([campaign.venue, campaign.intro, campaign.packages], [undefined, undefined, undefined])

  // Members who see the group read the page; visitors and the demo accounts
  // (who meet the examples) don't, but they read the demo group's.
  const page = await call("GET", `/events/${event.id}/page`, undefined, brand)
  assert.equal(page.status, 200)
  assert.deepEqual([page.data.group.id, page.data.group.name, page.data.own], [groupListing, "page-club 동아리", false])
  assert.equal(page.data.event.remindedAt, undefined)
  assert.equal((await call("GET", `/events/${event.id}/page`, undefined, group)).data.own, true)
  assert.equal((await call("GET", `/events/${event.id}/page`)).status, 404)
  assert.equal((await call("GET", `/events/${event.id}/page`, undefined, await login("브랜드"))).status, 404)
  const demo = await call("GET", "/events/event-muse-concert/page")
  assert.equal(demo.data.event.venue, "삼육대학교 대강당")
  assert.equal(demo.data.event.packages.length, 2)

  // Up to four photos, from the group only, served to those who see the page.
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  const photoRoute = `/events/${event.id}/photos`
  assert.equal((await call("POST", photoRoute, { image: "data:text/plain;base64,aGk=" }, group)).status, 400)
  assert.equal((await call("POST", photoRoute, { image: png }, brand)).status, 404)
  for (let i = 0; i < 4; i += 1) assert.equal((await call("POST", photoRoute, { image: png }, group)).status, 201)
  assert.equal((await call("POST", photoRoute, { image: png }, group)).status, 409)
  const photos = (await call("GET", `/events/${event.id}/page`, undefined, brand)).data.event.photos as string[]
  assert.equal(photos.length, 4)
  const image = await fetch(`${baseUrl}${photoRoute}/${photos[0]}`, { headers: { Authorization: `Bearer ${brand}` } })
  assert.equal(image.status, 200)
  assert.equal(image.headers.get("content-type"), "image/png")
  assert.equal((await fetch(`${baseUrl}${photoRoute}/${photos[0]}`)).status, 404)
  assert.equal((await call("DELETE", `${photoRoute}/${photos[0]}`, undefined, group)).status, 200)
  assert.ok(!existsSync(path.join(uploadsFolder(eventPhotos(event.id)), photos[0])))

  // An edit replaces the page's words and keeps its photos.
  const edited = await call("PUT", `/events/${event.id}`, { ...body, venue: "", intro: "", packages: [] }, group)
  assert.deepEqual([edited.data.event.venue, edited.data.event.intro, edited.data.event.packages], [undefined, undefined, undefined])
  assert.equal(edited.data.event.photos.length, 3)
  // Deleting the event takes its photos with it, and so does leaving.
  assert.equal((await call("DELETE", `/events/${event.id}`, undefined, group)).status, 204)
  assert.ok(!existsSync(uploadsFolder(eventPhotos(event.id))))
  const again = (await call("POST", "/events", body, group)).data.event
  await call("POST", `/events/${again.id}/photos`, { image: png }, group)
  assert.ok(existsSync(uploadsFolder(eventPhotos(again.id))))
  assert.equal((await call("DELETE", "/auth/account", { password: "page-pass-123" }, group)).status, 204)
  assert.ok(!existsSync(uploadsFolder(eventPhotos(again.id))))
})

test("members post on the recruitment board, and the other side applies with a proposal", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  type Post = { id: string; own: boolean; open: boolean; applied?: string; event?: { name: string }; applications?: { name: string; about: string; status: string }[] }
  const { token: group, listingId: groupListing } = await listedMember("board-club@syu.ac.kr", "board-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("board@board-cafe.kr", "board-pass-123", "브랜드")
  const today = todayInKorea()
  const groupEvent = (await call("POST", "/events", { name: "게시판 공연", date: addDays(today, 20), types: ["현금"] }, group)).data.event
  const campaign = (await call("POST", "/events", { name: "게시판 시음회", date: addDays(today, 15), types: ["제품"] }, brand)).data.event
  const brandPost = { title: "공연을 찾아요", body: "시음 부스를 열 공연을 찾아요.", types: ["제품"], deadline: addDays(today, 14) }
  for (const bad of [
    { title: "" },
    { title: "가".repeat(61) },
    { body: "가".repeat(1001) },
    { types: [] },
    { deadline: addDays(today, -1) },
    { deadline: addDays(today, 61) },
  ]) {
    assert.equal((await call("POST", "/board", { ...brandPost, ...bad }, brand)).status, 400)
  }
  const made = await call("POST", "/board", brandPost, brand)
  assert.equal(made.status, 201)
  const post = made.data.post as Post
  assert.deepEqual([post.own, post.open, post.applications], [true, true, []])
  // A group's post is about one of its coming events.
  const groupFields = { ...brandPost, title: "협찬사를 찾아요", types: ["현금"] }
  assert.equal((await call("POST", "/board", groupFields, group)).status, 400)
  const groupMade = await call("POST", "/board", { ...groupFields, eventId: groupEvent.id }, group)
  assert.equal(groupMade.status, 201)
  const groupPost = groupMade.data.post as Post
  assert.equal(groupPost.event?.name, "게시판 공연")
  assert.equal((await call("POST", "/board", brandPost, await login("브랜드"))).status, 403)

  // Each finds the other side's posts it sees; its own are under mine. Visitors
  // and the demo accounts read the examples, members read members'.
  const groupBoard = (await call("GET", "/board", undefined, group)).data as { posts: Post[]; mine: Post[] }
  assert.ok(groupBoard.posts.some((item) => item.id === post.id))
  assert.equal(groupBoard.posts.some((item) => item.id === groupPost.id || item.id === "post-coffee-tasting"), false)
  assert.deepEqual(groupBoard.mine.map((item) => item.id), [groupPost.id])
  const visitor = (await call("GET", "/board?role=학생단체")).data as { posts: Post[] }
  assert.ok(visitor.posts.some((item) => item.id === "post-coffee-tasting"))
  assert.equal(visitor.posts.some((item) => item.id === post.id), false)

  // The group applies with its event: a proposal in the brand's inbox, once.
  const apply = { matchId: brandListing, eventId: groupEvent.id, message: "로비 부스 자리를 드릴게요.", postId: post.id }
  assert.equal((await call("POST", "/proposals", apply, group)).status, 201)
  const request = getDatabase().requests.find((item) => item.postId === post.id)!
  assert.equal(request.eventId, groupEvent.id)
  assert.equal((await call("POST", "/proposals", apply, group)).status, 409)
  // Its own post is no post of the brand's.
  assert.equal((await call("POST", "/proposals", { ...apply, postId: groupPost.id }, group)).status, 409)
  const seen = (await call("GET", `/board/${post.id}`, undefined, brand)).data.post as Post
  assert.deepEqual(seen.applications?.map((item) => [item.name, item.about, item.status]), [["board-club 동아리", "게시판 공연", "검토 중"]])
  assert.equal(((await call("GET", `/board/${post.id}`, undefined, group)).data.post as Post).applied, "검토 중")
  // The brand applies to the group's post with its campaign.
  assert.equal((await call("POST", "/proposals", { matchId: groupListing, eventId: campaign.id, postId: groupPost.id }, brand)).status, 201)
  assert.ok(getDatabase().offers.some((item) => item.postId === groupPost.id && item.campaignId === campaign.id))

  // Closed, it leaves the board and takes no more applications; its poster still edits it.
  assert.equal((await call("POST", `/board/${post.id}/close`, undefined, brand)).data.post.open, false)
  assert.equal(((await call("GET", "/board", undefined, group)).data.posts as Post[]).some((item) => item.id === post.id), false)
  assert.equal((await call("GET", `/board/${post.id}`, undefined, group)).status, 404)
  assert.equal((await call("PUT", `/board/${post.id}`, brandPost, group)).status, 404)
  assert.equal((await call("PUT", `/board/${post.id}`, { ...brandPost, title: "고친 제목" }, brand)).data.post.title, "고친 제목")
  assert.equal((await call("DELETE", `/board/${post.id}`, undefined, brand)).status, 204)
  // Deleting the group's event closes its post; leaving takes the post away.
  assert.equal((await call("DELETE", `/events/${groupEvent.id}`, undefined, group)).status, 204)
  assert.ok(getDatabase().posts.find((item) => item.id === groupPost.id)?.closedAt)
  assert.equal((await call("DELETE", "/auth/account", { password: "board-pass-123" }, group)).status, 204)
  assert.equal(getDatabase().posts.some((item) => item.id === groupPost.id), false)
})

test("members are emailed once when an event or a sponsored event is three days away or nearer", async () => {
  const { sendReminders } = await import("./lib/reminders.js")
  const { mailTransport } = await import("./lib/mailer.js")
  const database = getDatabase()
  await signUpMember("remind-club@syu.ac.kr", "remind-pass-123")
  await signUpMember("remind@remind-cafe.kr", "remind-pass-123", "브랜드")
  const group = database.accounts.find((account) => account.email === "remind-club@syu.ac.kr")!
  const brand = database.accounts.find((account) => account.email === "remind@remind-cafe.kr")!
  const event = (id: string, name: string, date: string) => ({
    id,
    name,
    date,
    people: "100명",
    types: ["제품"],
    status: "매칭 중" as const,
    createdAt: "2026-11-01T00:00:00.000Z",
  })
  // Only these two members and the demo accounts are looked at: other
  // tests leave members' events at dates counted from today, which some
  // days fall in this test's week (a 30-day-away event did, on 26 October).
  const kept = { events: database.events, sponsorships: database.sponsorships }
  const demoIds = Object.values(database.demoAccountIds)
  const demoOnly = <T,>(byAccount: Record<string, T>) =>
    Object.fromEntries(Object.entries(byAccount).filter(([id]) => demoIds.includes(id)))
  database.events = demoOnly(kept.events)
  database.sponsorships = demoOnly(kept.sponsorships)
  database.events[group.id] = [
    event("in-three", "사흘 뒤 공연", "2026-11-28"),
    event("in-five", "닷새 뒤 공연", "2026-11-30"),
    event("today", "오늘 공연", "2026-11-25"),
    event("past", "어제 공연", "2026-11-24"),
  ]
  database.sponsorships[brand.id] = [
    { id: "sp-remind", groupName: "삼육대 뮤즈", eventName: "종강 공연", date: "2026-11-26", spend: 0, coupons: 0, visits: 0, sales: 0, targetRoas: 150 },
  ]

  const post = mailTransport.post
  const sent: { to: string[]; subject: string; text: string }[] = []
  mailTransport.post = async (message) => {
    sent.push(message)
    return new Response(null, { status: 200 })
  }
  const mail = { apiKey: config.resendApiKey, from: config.mailFrom }
  config.resendApiKey = "test-resend-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  try {
    // Noon on 25 November in Korea: the demo group's 27 November concert is
    // near too, but the demo accounts are never emailed.
    const now = new Date("2026-11-25T03:00:00Z")
    assert.equal(await sendReminders(database, now), 3)
    const subjects = sent.map((message) => `${message.to[0]} ${message.subject}`).sort()
    assert.deepEqual(subjects, [
      "remind-club@syu.ac.kr [uniconnect] '사흘 뒤 공연'까지 3일 남았어요",
      "remind-club@syu.ac.kr [uniconnect] 오늘은 '오늘 공연' 날이에요",
      "remind@remind-cafe.kr [uniconnect] 내일은 협찬하는 '종강 공연' 날이에요",
    ])
    assert.ok(sent.every((message) => !message.to.includes("muse@syu.ac.kr") && !message.to.includes("hello@afternoon-coffee.kr")))
    assert.match(sent.find((message) => message.to.includes("remind@remind-cafe.kr"))!.text, /임시 전자 계약서/)
    // Once each: the next hour sends nothing, and two days later only the
    // event that has come near since.
    assert.equal(await sendReminders(database, new Date("2026-11-25T04:00:00Z")), 0)
    sent.length = 0
    assert.equal(await sendReminders(database, new Date("2026-11-27T03:00:00Z")), 1)
    assert.match(sent[0].subject, /'닷새 뒤 공연'까지 3일 남았어요/)
    assert.equal(database.events[group.id].find((item) => item.id === "past")!.remindedAt, undefined)
  } finally {
    mailTransport.post = post
    config.resendApiKey = mail.apiKey
    config.mailFrom = mail.from
    database.events = kept.events
    database.sponsorships = kept.sponsorships
  }
})

test("operators see the platform's figures, real members' apart from the demo data", async () => {
  type Figures = Record<string, { real: number; total: number }>
  const stats = async (token = "test-admin-token") => {
    const response = await fetch(`${baseUrl}/admin/stats`, { headers: { "X-Admin-Token": token } })
    return { status: response.status, data: (await response.json()) as { stats: Figures } }
  }
  assert.equal((await stats("wrong-token-value")).status, 403)
  assert.equal((await call("GET", "/admin/stats")).status, 403)

  const before = (await stats()).data.stats
  // The demo accounts and the seed's data count only in the totals.
  assert.ok(before.proposals.total > before.proposals.real)
  assert.ok(before.scans.total > before.scans.real)
  for (const figure of Object.values(before)) {
    assert.ok(figure.real >= 0 && figure.real <= figure.total)
  }

  // A new member counts as real, and as new this week.
  await signUpMember("stats@syu.ac.kr", "stats-pass-123")
  const after = (await stats()).data.stats
  assert.equal(after.students.real, before.students.real + 1)
  assert.equal(after.students.total, before.students.total + 1)
  assert.equal(after.newThisWeek.real, before.newThisWeek.real + 1)
  assert.equal(after.brands.real, before.brands.real)
})

test("a group hands its account over by moving the login email, checked with a code to the new address", async () => {
  const token = await signUpMember("handover-old@syu.ac.kr", "handover-pass-123")
  const other = (
    await call("POST", "/auth/login", { role: "학생단체", email: "handover-old@syu.ac.kr", password: "handover-pass-123" })
  ).data.token
  const ask = (body: object, as = token) => call("POST", "/auth/email/code", body, as)

  assert.equal((await ask({ email: "handover-new@syu.ac.kr", password: "wrong-pass-123" })).status, 400)
  assert.equal((await ask({ email: "muse@syu.ac.kr", password: "handover-pass-123" })).status, 409)
  assert.equal((await ask({ email: "handover-old@syu.ac.kr", password: "handover-pass-123" })).status, 400)
  const sent = await ask({ email: "handover-new@syu.ac.kr", password: "handover-pass-123" })
  assert.equal(sent.status, 200)

  // Another account can't use the code; a wrong code is refused.
  const stranger = await signUpMember("handover-other@syu.ac.kr", "handover-pass-123")
  assert.equal((await call("POST", "/auth/email", { email: "handover-new@syu.ac.kr", code: sent.data.devCode }, stranger)).status, 400)
  assert.equal((await call("POST", "/auth/email", { email: "handover-new@syu.ac.kr", code: "000000" }, token)).status, 400)
  const moved = await call("POST", "/auth/email", { email: "handover-new@syu.ac.kr", code: sent.data.devCode }, token)
  assert.equal(moved.status, 200)
  assert.equal(moved.data.account.email, "handover-new@syu.ac.kr")

  // This device stays logged in, the others are logged out, and the new email logs in.
  assert.equal((await call("GET", "/auth/me", undefined, token)).status, 200)
  assert.equal((await call("GET", "/auth/me", undefined, other)).status, 401)
  const login = (email: string) => call("POST", "/auth/login", { role: "학생단체", email, password: "handover-pass-123" })
  assert.equal((await login("handover-new@syu.ac.kr")).status, 200)
  assert.equal((await login("handover-old@syu.ac.kr")).status, 401)

  // The demo accounts stay as they are.
  const demo = await call("POST", "/auth/login", { role: "학생단체", email: "muse@syu.ac.kr", password: DEMO_PASSWORD })
  assert.equal((await ask({ email: "elsewhere@syu.ac.kr", password: DEMO_PASSWORD }, demo.data.token)).status, 403)
})

test("an account downloads everything it made, without its password or participants' passes", async () => {
  const token = await signUpMember("export@syu.ac.kr", "export-pass-123")
  await call("POST", "/inquiries", { category: "이용 방법", question: "내 데이터를 내려받을 수 있나요?" }, token)
  const exported = await call("GET", "/auth/export", undefined, token)
  assert.equal(exported.status, 200)
  assert.equal(exported.data.account.email, "export@syu.ac.kr")
  assert.equal(exported.data.account.passwordHash, undefined)
  assert.equal(exported.data.inquiries[0].question, "내 데이터를 내려받을 수 있나요?")
  for (const key of ["listing", "events", "proposalsSent", "proposalsReceived", "sponsorships", "measurements", "conversations"]) {
    assert.ok(key in exported.data, key)
  }
  assert.equal((await call("GET", "/auth/export")).status, 401)

  // A measured event comes without the participants' passes and records.
  const demo = await login("학생단체")
  const measured = (await call("GET", "/auth/export", undefined, demo)).data.measurements
  assert.ok(measured.length > 0)
  assert.ok(measured.every((item: object) => !("passes" in item) && !("log" in item)))
})

test("the data is backed up at most hourly beside the data file, keeping the latest 24", async () => {
  const { backups, backupFolder } = await import("./store.js")
  const folder = backupFolder()
  await mkdir(folder, { recursive: true })
  for (let hour = 0; hour < 25; hour += 1) {
    await writeFile(path.join(folder, `db-2000-01-01-${String(hour).padStart(2, "0")}.json`), "{}")
  }
  backups.lastAt = 0
  await saveDatabase()
  const copies = async () => (await readdir(folder)).filter((file) => file.startsWith("db-")).sort()
  const kept = await copies()
  assert.equal(kept.length, 24)
  assert.ok(!kept.includes("db-2000-01-01-00.json"))
  assert.ok(JSON.parse(await readFile(path.join(folder, kept.at(-1)!), "utf8")).accounts.length > 0)
  // Within the hour, no new copy.
  await saveDatabase()
  assert.deepEqual(await copies(), kept)
})


test("Vercel serves the pages with the same security headers the API sends", async () => {
  const { fileURLToPath } = await import("node:url")
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const pages = vercel.headers.find((entry) => entry.source === "/(.*)")!.headers
  const answer = await fetch(`${baseUrl}/health`)
  for (const { key, value } of pages) assert.equal(answer.headers.get(key), value, key)
  // All of them, but HSTS, which Vercel adds on its own.
  const sent = [...answer.headers.keys()].filter((key) =>
    ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"].includes(key),
  )
  assert.deepEqual(sent.sort(), pages.map(({ key }) => key.toLowerCase()).sort())
})

test("the Vercel entry reads the data on its first request and serves the API", async () => {
  const { createServer } = await import("node:http")
  const { default: handler } = await import("./vercel.js")
  const vercelServer = createServer(handler).listen(0)
  await new Promise((resolve) => vercelServer.once("listening", resolve))
  try {
    const port = (vercelServer.address() as AddressInfo).port
    const brands = await fetch(`http://127.0.0.1:${port}/api/brands`)
    assert.equal(brands.status, 200)
    assert.ok(((await brands.json()) as { brands: unknown[] }).brands.length > 0)
  } finally {
    await new Promise((resolve) => vercelServer.close(resolve))
  }
})

// Last, as it marks the events near today as reminded.
test("Vercel Cron sends the reminders with its secret, and nobody else can", async () => {
  const reminders = (authorization?: string) =>
    fetch(`${baseUrl}/cron/reminders`, authorization ? { headers: { Authorization: authorization } } : undefined)
  assert.equal((await reminders()).status, 404)
  assert.equal((await reminders("Bearer test-cron-secret")).status, 404)
  config.cronSecret = "test-cron-secret"
  try {
    assert.equal((await reminders()).status, 404)
    assert.equal((await reminders("Bearer wrong")).status, 404)
    const ran = await reminders("Bearer test-cron-secret")
    assert.equal(ran.status, 200)
    assert.equal(typeof ((await ran.json()) as { sent: unknown }).sent, "number")
  } finally {
    config.cronSecret = undefined
  }
})
