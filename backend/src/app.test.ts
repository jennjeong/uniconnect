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
  // Brands propose to any group in the catalog, never to another brand.
  assert.equal((await call("POST", "/proposals", { matchId: "kw-code" }, token)).status, 201)
  await call("DELETE", "/proposals/kw-code", undefined, token)
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

test("the report has the event's goals", async () => {
  const { report } = (await call("GET", "/report")).data
  assert.equal(report.eventName, "가을 버스킹 데이")
  assert.equal(report.targets.roas, 170)
  assert.equal(
    report.valueBreakdown.reduce((sum: number, part: { value: number }) => sum + part.value, 0),
    report.sponsorValue,
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
  const { metrics } = (await call("GET", "/metrics")).data
  assert.equal(sponsorships[0].coupons, metrics.coupons)
  assert.equal(sponsorships[0].visits, metrics.visits)

  const student = await login("학생단체")
  assert.deepEqual((await call("GET", "/analytics", undefined, student)).data.sponsorships, [])
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
  assert.ok(upgraded.metricLog.length > 0)
  assert.equal(upgraded.report.targets.reach, 1100)
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
