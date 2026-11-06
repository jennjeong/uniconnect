import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, beforeEach, test } from "node:test"

// 실행할 때마다 실제 data/db.json이 아니라 임시 파일의 새 시드로 시작한다.
const dataDir = await mkdtemp(path.join(tmpdir(), "uniconnect-api-"))
process.env.DATA_FILE = path.join(dataDir, "db.json")
// 서버가 운영 환경처럼 페이지를 서빙하도록 빌드된 프론트엔드를 흉내 낸다.
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
// 수수료는 정해진 날(lib/fees.ts)부터 받는데 그날은 이미 지났다. 여기 사례들은
// 그날 전인 것처럼 돌리고, 수수료 사례는 스스로 되돌린다.
;(await import("./lib/fees.js")).feeStart.since = "9999-12-31"
// 행사의 새 몫이 시작할 때처럼 모든 현장 집계를 0으로 둔다.
const emptyVenue = (await import("./lib/methods.js")).emptyVenueCounts()

let server: Server
let baseUrl = ""

before(async () => {
  await loadDatabase()
  server = createApp().listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

// 모든 요청이 127.0.0.1에서 오므로 사례마다 제한을 새로 시작한다.
beforeEach(() => clearRateLimits())

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
})

// 가입이 요구하는 대로, 테스트에서 만든 계정을 운영하는 사람이다.
// 운영자가 확인하는 가입 서류다(lib/applications.ts).
const proofDocument = { file: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 proof").toString("base64")}`, name: "재직증명서.pdf" }

async function approveApplication(email: string) {
  const { config: settings } = await import("./config.js")
  const saved = settings.adminToken
  settings.adminToken = "test-admin-token"
  try {
    const application = getDatabase().applications!.find((item) => item.email === email)!
    const response = await fetch(`${baseUrl}/admin/applications/${application.id}/approve`, { method: "POST", headers: { "X-Admin-Token": "test-admin-token" } })
    assert.equal(response.status, 200)
  } finally {
    settings.adminToken = saved
  }
}

// 공동 관리자의 로그인이다. 첫 로그인은 받은 비밀 값으로 2단계 로그인을
// 설정하고, 이후에는 보관한 비밀 값의 코드를 쓴다.
async function logInCoAdmin(email: string, password: string) {
  const { codeAt, stepAt } = await import("./lib/totp.js")
  const { memberByEmail } = await import("./lib/team.js")
  const first = await call("POST", "/auth/login", { role: "학생단체", email, password })
  const member = memberByEmail(getDatabase(), email)!.member
  const secret = (first.data.setup?.secret as string | undefined) ?? member.twoFactor!.secret
  const code = codeAt(secret, stepAt(Date.now()) + (member.twoFactor ? 1 : 0))
  const done = await call("POST", "/auth/login/code", { email, ticket: first.data.ticket, code })
  assert.equal(done.status, 200)
  return done.data as { token: string; account: { email: string; asMember: { id: string; name: string } }; recoveryCodes: string[] }
}

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

test("the site hands out the Kakao map key only once it is set", async () => {
  assert.equal((await call("GET", "/site")).data.maps, undefined)
  config.kakaoMapKey = "test-map-key"
  try {
    assert.deepEqual((await call("GET", "/site")).data.maps, { kakao: "test-map-key" })
  } finally {
    config.kakaoMapKey = undefined
  }
})

test("a group's event keeps its kind, times and who comes, and brands filter by its kind", async () => {
  const { token: group } = await listedMember("kind-club@syu.ac.kr", "kind-pass-123")
  const { token: brand } = await listedMember("kind@kind-cafe.kr", "kind-pass-123", "브랜드")
  const base = { name: "가을 축제", date: "2026-12-05", people: "500명", types: ["제품"] }
  const made = await call(
    "POST",
    "/events",
    { ...base, kind: "축제", startTime: "11:00", endTime: "18:30", makeup: { female: 55, years: ["1학년", "2학년", "없는 학년"], majors: " 인공지능 " } },
    group,
  )
  assert.equal(made.status, 201)
  assert.deepEqual(
    [made.data.event.kind, made.data.event.startTime, made.data.event.endTime, made.data.event.makeup],
    // 여성 비율은 더 이상 묻지 않으므로 보관하지 않는다.
    ["축제", "11:00", "18:30", { years: ["1학년", "2학년"], majors: "인공지능" }],
  )
  for (const wrong of [{ kind: "파티" }, { startTime: "18:00", endTime: "09:00" }, { endTime: "10:00" }]) {
    assert.equal((await call("POST", "/events", { ...base, ...wrong }, group)).status, 400)
  }
  // 비어 있는 구성은 뺀다. 브랜드는 단체에서 다음 행사의 종류를 본다.
  const plain = await call("POST", "/events", { ...base, name: "평범한 행사", date: "2027-03-01", makeup: { years: [] } }, group)
  assert.equal(plain.data.event.makeup, undefined)
  const groups = (await call("GET", "/groups", undefined, brand)).data.groups as { name: string; eventKind?: string }[]
  assert.equal(groups.find((item) => item.name.startsWith("kind-club"))?.eventKind, "축제")
})

test("a group's promotion plan needs its agreement, and becomes its items on the agreement", async () => {
  const group = await signUpMember("promo-club@syu.ac.kr", "promo-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "promo-club@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("promo@promo-cafe.kr", "promo-pass-123", "브랜드")
  const promo = { spots: ["현수막", "SNS 카드뉴스", "없는 자리"], handouts: ["선착순 배포"], posts: ["협찬 게시물 1회", "행사 당일 스토리"] }
  const base = { name: "홍보 축제", date: "2026-12-12", people: "300명", types: ["제품"], promo }
  assert.equal((await call("POST", "/events", base, group)).status, 400)
  const made = await call("POST", "/events", { ...base, promoAgreed: true }, group)
  assert.equal(made.status, 201)
  assert.deepEqual(made.data.event.promo.spots, ["현수막", "SNS 카드뉴스"])
  assert.ok(made.data.event.promo.agreedAt)
  // 고른 것이 없으면 계약이 필요 없고 계획도 보관하지 않는다.
  const none = await call("POST", "/events", { ...base, name: "홍보 없는 행사", date: "2027-01-10", promo: { spots: [], handouts: [], posts: [] } }, group)
  assert.equal(none.data.event.promo, undefined)
  // 수락되면 계약서는 단체가 약속한 것으로 시작한다.
  await call("POST", "/proposals", { matchId: listingId, eventId: made.data.event.id }, group)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const labels = (await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.items
    .filter((item: { side: string }) => item.side === "group")
    .map((item: { label: string }) => item.label)
  assert.deepEqual(labels, [
    "로고 노출: 현수막, SNS 카드뉴스",
    "현장 배포: 선착순 배포",
    "SNS 홍보: 협찬 게시물 1회",
    "SNS 홍보: 행사 당일 스토리",
    "참여자에게 쿠폰 나눠 주기",
    "행사 후 사진과 성과 리포트 공유하기",
  ])
})

test("a group puts its plan PDF on the event page, and brands who see the page download it", async () => {
  const { token: group } = await listedMember("plan-club@syu.ac.kr", "plan-pass-123")
  const { token: brand } = await listedMember("plan@plan-cafe.kr", "plan-pass-123", "브랜드")
  const made = await call("POST", "/events", { name: "기획안 공연", date: "2026-12-18", people: "100명", types: ["제품"] }, group)
  const id = made.data.event.id
  const pdf = (text: string) => `data:application/pdf;base64,${Buffer.from(`%PDF-1.4\n${text}\n%%EOF`).toString("base64")}`
  assert.equal((await call("POST", `/events/${id}/plan`, { file: "data:application/pdf;base64,aGVsbG8=", name: "a.pdf" }, group)).status, 400)
  const first = await call("POST", `/events/${id}/plan`, { file: pdf("first"), name: "기획/안.pdf" }, group)
  assert.equal(first.status, 201)
  assert.equal(first.data.event.plan.name, "기획 안.pdf")
  // 페이지를 보는 브랜드는 자기 이름으로 내려받는다.
  const download = await fetch(`${baseUrl}/events/${id}/plan`, { headers: { Authorization: `Bearer ${brand}` } })
  assert.equal(download.status, 200)
  assert.equal(download.headers.get("content-type"), "application/pdf")
  assert.match(download.headers.get("content-disposition") ?? "", /filename\*=UTF-8''/)
  assert.ok((await download.text()).includes("first"))
  // 새 것이 대체하며, 단체만 바꾸거나 지울 수 있다.
  const firstFile = first.data.event.plan.file
  const second = await call("POST", `/events/${id}/plan`, { file: pdf("second"), name: "새 기획안.pdf" }, group)
  assert.notEqual(second.data.event.plan.file, firstFile)
  assert.equal((await call("POST", `/events/${id}/plan`, { file: pdf("x"), name: "x.pdf" }, brand)).status, 404)
  assert.equal((await call("DELETE", `/events/${id}/plan`, undefined, group)).data.event.plan, undefined)
  assert.equal((await fetch(`${baseUrl}/events/${id}/plan`, { headers: { Authorization: `Bearer ${brand}` } })).status, 404)
})

test("groups explore each other's coming events, and similar events' sponsorships by kind", async () => {
  const { token: host } = await listedMember("explore-host@syu.ac.kr", "explore-pass-123")
  const hostId = getDatabase().accounts.find((account) => account.email === "explore-host@syu.ac.kr")!.id
  const { token: viewer } = await listedMember("explore-viewer@syu.ac.kr", "explore-pass-123")
  const { token: brand, listingId } = await listedMember("explore@explore-cafe.kr", "explore-pass-123", "브랜드")
  const made = await call(
    "POST",
    "/events",
    { name: "탐색 축제", date: "2026-12-20", people: "400명", types: ["제품"], kind: "축제", intro: "가".repeat(400), packages: [{ name: "메인", gives: "현수막 로고", asks: "음료 300잔" }] },
    host,
  )
  await call("POST", "/proposals", { matchId: listingId, eventId: made.data.event.id }, host)
  const request = getDatabase().requests.find((item) => item.fromAccountId === hostId)!
  request.ask = "음료 300잔"
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)

  const seen = (await call("GET", "/events/explore", undefined, viewer)).data
  const event = seen.events.find((item: { name: string }) => item.name === "탐색 축제")
  assert.ok(event)
  assert.equal(event.kind, "축제")
  assert.equal(event.intro.length, 220)
  assert.deepEqual(event.packages, [{ name: "메인", gives: "현수막 로고" }])
  assert.equal(event.own, undefined)
  // 회원은 회원만 보고 예시는 절대 보지 않는다.
  assert.ok(!seen.events.some((item: { group: { name: string } }) => item.group.name === "삼육대 뮤즈"))
  const festival = seen.cases.find((item: { kind: string }) => item.kind === "축제")
  assert.deepEqual([festival.sponsorships, festival.averagePeople, festival.asks], [1, 400, ["음료 300잔"]])
  // 주최자는 자기 것에 표시가 붙은 것을 본다.
  const own = (await call("GET", "/events/explore", undefined, host)).data.events.find((item: { name: string }) => item.name === "탐색 축제")
  assert.equal(own.own, true)
})

test("a group publishes its sponsorship ledger by a link, amounts only when it chooses, and can stop", async () => {
  const group = await signUpMember("ledger-club@syu.ac.kr", "ledger-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "ledger-club@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("ledger@ledger-cafe.kr", "ledger-pass-123", "브랜드")
  await call("POST", "/events", { name: "결산 공연", date: "2026-12-19", people: "150명", types: ["제품"] }, group)
  await call("POST", "/proposals", { matchId: listingId }, group)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  await call("PUT", `/agreements/${request.id}/value`, { value: { cash: 100000, inKind: 50000 } }, group)

  const mine = (await call("GET", "/ledger", undefined, group)).data
  assert.deepEqual([mine.token, mine.showValues, mine.entries.length], [null, false, 1])
  assert.equal(mine.entries[0].value, 150000)
  // 브랜드와 데모 계정은 아무것도 공개하지 않는다.
  assert.equal((await call("GET", "/ledger", undefined, brand)).status, 403)
  assert.equal((await call("GET", "/ledger", undefined, await login("학생단체"))).status, 403)
  const linked = (await call("POST", "/ledger/link", undefined, group)).data
  assert.match(linked.token, /^[\w-]{24}$/)
  assert.equal((await call("PUT", "/ledger", { notes: { "not-mine": "x" } }, group)).status, 404)
  await call("PUT", "/ledger", { notes: { [request.id]: "음료를 부스에서 나눴어요." } }, group)
  // 공개 페이지는 로그인이 필요 없고, 단체가 보여 주기 전에는 금액을 숨긴다.
  const open = (await call("GET", `/ledger/public/${linked.token}`)).data
  assert.equal(open.entries[0].note, "음료를 부스에서 나눴어요.")
  assert.equal(open.entries[0].value, undefined)
  assert.equal(open.totals.value, undefined)
  await call("PUT", "/ledger", { showValues: true }, group)
  const shown = (await call("GET", `/ledger/public/${linked.token}`)).data
  assert.deepEqual([shown.entries[0].value, shown.totals.value, shown.totals.brands], [150000, 150000, 1])
  // 새 링크는 옛 링크를 멈추고, 멈추면 둘 다 멈춘다.
  const renewed = (await call("POST", "/ledger/link", undefined, group)).data
  assert.equal((await call("GET", `/ledger/public/${linked.token}`)).status, 404)
  await call("DELETE", "/ledger/link", undefined, group)
  assert.equal((await call("GET", `/ledger/public/${renewed.token}`)).status, 404)
})

test("a group writes down its terms, latest first, and only groups that are members can", async () => {
  const group = await signUpMember("terms-club@syu.ac.kr", "terms-pass-123")
  const saved = await call("PUT", "/auth/terms", { terms: [{ name: "제3대", from: "2026-03-01" }, { name: " 제4대 하성 ", from: "2026-09-01" }] }, group)
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.data.account.terms, [
    { name: "제4대 하성", from: "2026-09-01" },
    { name: "제3대", from: "2026-03-01" },
  ])
  for (const wrong of [[{ name: "", from: "2026-03-01" }], [{ name: "제5대", from: "언젠가" }], [{ name: "a", from: "2026-03-01" }, { name: "b", from: "2026-03-01" }]]) {
    assert.equal((await call("PUT", "/auth/terms", { terms: wrong }, group)).status, 400)
  }
  assert.equal((await call("PUT", "/auth/terms", { terms: [] }, group)).data.account.terms, undefined)
  assert.equal((await call("PUT", "/auth/terms", { terms: [] }, await login("학생단체"))).status, 403)
  const brand = await signUpMember("terms@terms-cafe.kr", "terms-pass-123", "브랜드")
  assert.equal((await call("PUT", "/auth/terms", { terms: [] }, brand)).status, 403)
})

test("every sponsorship whose day has come has a detailed report, from its record when no event was measured", async () => {
  const brand = await login("브랜드")
  const { sponsorships } = (await call("GET", "/analytics", undefined, brand)).data as { sponsorships: { id: string; report?: string }[] }
  assert.ok(sponsorships.length > 1)
  assert.ok(sponsorships.every((item) => item.report && item.report !== "none"))
  // 사기 전에는 잠겨 있고 기록에서 계산하며, 방문 수는 기록의 것이다.
  const database = getDatabase()
  const owner = database.accounts.find((account) => account.id === database.demoAccountIds["브랜드"])!
  const unmeasured = database.sponsorships[owner.id].find((item) => !item.eventId)!
  assert.equal((await call("GET", `/insights/${unmeasured.id}`, undefined, brand)).data.locked, true)
  const { premiumReport } = await import("./lib/premiumReport.js")
  const report = premiumReport(database, owner, unmeasured.id)!
  assert.equal(report.scorecard.find((item) => item.key === "visits")!.actual, unmeasured.visits)
})

test("participants may say their gender on the survey, and the students' report carries the counts", async () => {
  const { todayInKorea } = await import("./lib/dates.js")
  const group = await signUpMember("gender-club@syu.ac.kr", "gender-pass-123")
  const made = (await call("POST", "/events", { name: "설문 공연", date: todayInKorea(), people: "50명", types: ["제품"] }, group)).data.event
  const code = (await call("GET", `/measurements/${made.id}`, undefined, group)).data.report.code
  const { pass } = (await call("POST", `/check-in/${code}/scans`)).data
  assert.equal((await call("POST", `/check-in/${code}/survey`, { pass, gender: "여성", grade: "1학년" })).status, 201)
  const { pass: other } = (await call("POST", `/check-in/${code}/scans`)).data
  assert.equal((await call("POST", `/check-in/${code}/survey`, { pass: other, gender: "모름" })).status, 400)
  const report = (await call("GET", `/measurements/${made.id}`, undefined, group)).data.report
  assert.deepEqual([report.survey.gender, report.survey.grade], [{ 여성: 1 }, { "1학년": 1 }])
})

test("the site's counts are members only and grow with each sign-up", async () => {
  const before = (await call("GET", "/site")).data.counts
  assert.deepEqual(Object.keys(before).sort(), ["brands", "groups", "schools", "sponsorships"])
  await signUpMember("counted@toolscafe.kr", "Counted-pass1!", "브랜드")
  await signUpMember("counted@syu.ac.kr", "Counted-pass1!")
  const after = (await call("GET", "/site")).data.counts
  assert.equal(after.brands, before.brands + 1)
  assert.equal(after.groups, before.groups + 1)
  assert.ok(after.schools >= 1)
})

test("an invitation link's code ties a sign-up to its inviter, rewarded once at the first sponsorship", async () => {
  const { token: brand, listingId } = await listedMember("inviter@invite-cafe.kr", "invite-pass-123", "브랜드")
  const stats = (await call("GET", "/auth/referral", undefined, brand)).data
  assert.match(stats.code, /^[A-Z2-9]{8}$/)
  assert.deepEqual([stats.joined, stats.rewarded, stats.rewardDays], [0, 0, 30])
  // 매번 같은 코드이고 데모 계정에는 없다.
  assert.equal((await call("GET", "/auth/referral", undefined, brand)).data.code, stats.code)
  assert.equal((await call("GET", "/auth/referral", undefined, await login("브랜드"))).status, 403)
  // 코드가 아닌 것은 조용히 넘기고, 진짜 코드는 새 계정을 묶는다.
  await signUpMember("invite-wrong@syu.ac.kr", "invite-pass-123", "학생단체", { referral: "NOTACODE" })
  const group = await signUpMember("invited@syu.ac.kr", "invite-pass-123", "학생단체", { referral: stats.code })
  const groupAccount = getDatabase().accounts.find((account) => account.email === "invited@syu.ac.kr")!
  const brandAccount = getDatabase().accounts.find((account) => account.email === "inviter@invite-cafe.kr")!
  assert.equal(groupAccount.referredBy, brandAccount.id)
  assert.equal(getDatabase().accounts.find((account) => account.email === "invite-wrong@syu.ac.kr")!.referredBy, undefined)
  assert.equal((await call("GET", "/auth/referral", undefined, brand)).data.joined, 1)
  const grants = () => (getDatabase().payments ?? []).filter((item) => item.accountId === brandAccount.id && item.orderName.includes("친구 초대 보상"))
  const propose = async (name: string, to: string, token: string) => {
    await call("POST", "/events", { name, date: "2026-12-24", people: "100명", types: ["제품"] }, group)
    assert.equal((await call("POST", "/proposals", { matchId: to }, group)).status, 201)
    const request = getDatabase().requests.filter((item) => item.fromAccountId === groupAccount.id && item.status === "검토 중").at(-1)!
    assert.equal((await call("POST", `/requests/${request.id}/accept`, undefined, token)).status, 200)
    return request.id
  }
  const confirm = async (id: string, brandToken: string) => {
    await call("POST", `/agreements/${id}/confirm`, undefined, group)
    await call("POST", `/agreements/${id}/confirm`, undefined, brandToken)
  }
  // 초대한 계정 자신과의 협찬은 확정되어도 아무에게도 보상하지 않는다.
  await confirm(await propose("초대 공연", listingId, brand), brand)
  assert.equal(grants().length, 0)
  // 다른 브랜드와의 협찬은 수락될 때가 아니라 양쪽이 e-contract를 확정할 때
  // 초대한 사람에게 보상하며, 처음 한 번만이다.
  const other = await listedMember("invite-other@other-cafe.kr", "invite-pass-123", "브랜드")
  const first = await propose("초대 공연 2", other.listingId, other.token)
  assert.equal(grants().length, 0)
  await confirm(first, other.token)
  assert.equal(grants().length, 1)
  await confirm(await propose("초대 공연 3", other.listingId, other.token), other.token)
  assert.equal(grants().length, 1)
  assert.equal((await call("GET", "/auth/referral", undefined, brand)).data.rewarded, 1)
})

test("a member keeps up to ten proposal templates; the demo accounts keep none", async () => {
  const token = await signUpMember("templates@syu.ac.kr", "Templates-pass1!")
  const saved = await call("PUT", "/auth/templates", { templates: [{ name: " 카페 첫 제안 ", text: "{상대}에 {행사} 협찬을 제안해요." }] }, token)
  assert.equal(saved.status, 200)
  assert.equal(saved.data.account.templates.length, 1)
  assert.equal(saved.data.account.templates[0].name, "카페 첫 제안")
  assert.match(saved.data.account.templates[0].id, /^[\w-]+$/)
  // 계정과 함께 돌아오고, 계정의 데이터와 함께 나간다.
  assert.equal((await call("GET", "/auth/me", undefined, token)).data.account.templates[0].text, "{상대}에 {행사} 협찬을 제안해요.")
  assert.equal((await call("GET", "/auth/export", undefined, token)).data.account.templates.length, 1)
  const many = Array.from({ length: 11 }, (_, index) => ({ name: `문구 ${index}`, text: "안녕하세요" }))
  assert.equal((await call("PUT", "/auth/templates", { templates: many }, token)).status, 400)
  assert.equal((await call("PUT", "/auth/templates", { templates: [{ name: "", text: "x" }] }, token)).status, 400)
  assert.equal((await call("PUT", "/auth/templates", { templates: [{ name: "긴 글", text: "가".repeat(301) }] }, token)).status, 400)
  const cleared = await call("PUT", "/auth/templates", { templates: [] }, token)
  assert.equal(cleared.data.account.templates, undefined)
  assert.equal((await call("PUT", "/auth/templates", { templates: [] }, await login("학생단체"))).status, 403)
})

test("security: tokens, stale prices, refunds, late edits, codes and invitations are guarded", async () => {
  const { feeOf, parseValue } = await import("./lib/fees.js")
  const { markCancelled, markPaid, orderFor, paymentsOf } = await import("./lib/billing.js")
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()

  // 토큰 값으로는 수수료를 반올림해 없앨 수 없다. 최소 10,000원이고
  // 수수료는 올림한다.
  assert.throws(() => parseValue({ cash: 33 }), /1만 원 이상/)
  assert.equal(feeOf({ cash: 10_001, inKind: 0 }), 1510)

  // 광고는 보낸 대상이 몇 개든 기다리는 주문 하나이므로 재가입 할인을 쌓아 둘
  // 수 없고, 낡은 금액은 확인할 때 승인하지 않는다.
  const { token: brand } = await listedMember("sec@sec-cafe.kr", "sec-pass-123", "브랜드")
  const account = getDatabase().accounts.find((item) => item.email === "sec@sec-cafe.kr")!
  const first = orderFor(getDatabase(), account, "ad", "one")
  assert.equal(orderFor(getDatabase(), account, "ad", "two"), first)
  assert.equal(first.targetId, "")
  markPaid(getDatabase(), first, { method: "transfer" })
  const renewal = (await call("POST", "/billing/orders", { kind: "ad", targetId: "x" }, brand)).data.order
  assert.equal(renewal.amount, 98010)
  const pay = paymentsOf(getDatabase()).find((item) => item.id === renewal.id)!
  pay.amount = 50_000
  const { config: settings } = await import("./config.js")
  const saved = { client: settings.tossClientKey, secret: settings.tossSecretKey }
  settings.tossClientKey = "live_ck_example"
  settings.tossSecretKey = "live_sk_example"
  try {
    const stale = await call("POST", "/billing/confirm", { orderId: renewal.id, paymentKey: "pk", amount: 50_000 }, brand)
    assert.equal(stale.status, 409)
    assert.equal(paymentsOf(getDatabase()).find((item) => item.id === renewal.id)!.amount, 98010)
    // 부가세 전에 만든 주문은 총액이 맞아도 낡은 주문이다.
    delete pay.supply
    assert.equal((await call("POST", "/billing/confirm", { orderId: renewal.id, paymentKey: "pk", amount: 98010 }, brand)).status, 409)
    assert.ok(pay.supply)
  } finally {
    settings.tossClientKey = saved.client
    settings.tossSecretKey = saved.secret
  }
  // 환불한 달은 그다음 달들에서 그 일수를 되찾는다.
  markPaid(getDatabase(), pay, { method: "transfer" })
  assert.equal((await call("GET", "/billing", undefined, brand)).data.ad.until, addDays(today, 59))
  markCancelled(getDatabase(), first, "환불")
  assert.equal((await call("GET", "/billing", undefined, brand)).data.ad.until, addDays(today, 29))
  // 여기서 끝나므로 광고가 이 브랜드를 이후 테스트에서 맨 앞에 두지 않는다.
  markCancelled(getDatabase(), pay, "정리")

  // 회원의 행사가 시작되면 목표는 그대로 있고, 행사를 이미 지난 날로 옮길
  // 수 없다.
  const group = await signUpMember("sec-club@syu.ac.kr", "sec-pass-123")
  const event = (await call("POST", "/events", { name: "보안 공연", date: addDays(today, 3), people: "100명", types: ["제품"] }, group)).data.event
  const moved = await call("PUT", `/events/${event.id}`, { name: "보안 공연", date: addDays(today, -1), people: "100명", types: ["제품"] }, group)
  assert.equal(moved.status, 400)
  const stored = Object.values(getDatabase().events).flat().find((item) => item.id === event.id)!
  stored.date = today
  const goals = (await call("GET", `/measurements/${event.id}`, undefined, group)).data.report.goals
  assert.equal((await call("PUT", `/measurements/${event.id}/goals`, goals, group)).status, 409)

  // 주소에 가입 코드를 요청해도 그 주소의 초기화 코드는 끝나지 않는다.
  await call("POST", "/auth/password-reset/code", { email: "sec-club@syu.ac.kr" })
  const resets = () => getDatabase().emailCodes.filter((item) => item.email === "sec-club@syu.ac.kr" && item.purpose === "reset").length
  assert.equal(resets(), 1)
  await call("POST", "/auth/email-code", { role: "학생단체", email: "sec-club@syu.ac.kr" })
  assert.equal(resets(), 1)

  // 두 계정이 같은 이메일을 초대한다. 각 초대의 코드가 각자 동작하므로 먼저 온
  // 초대가 다른 초대를 가로막을 수 없다.
  const first2 = await signUpMember("sec-a@syu.ac.kr", "sec-pass-123")
  const second = await signUpMember("sec-b@syu.ac.kr", "sec-pass-123")
  await call("POST", "/team/invites", { name: "가", email: "sec-vice@syu.ac.kr" }, first2)
  const code = (await call("POST", "/team/invites", { name: "나", email: "sec-vice@syu.ac.kr" }, second)).data.devCode
  const joined = await call("POST", "/team/join", { email: "sec-vice@syu.ac.kr", code, password: "Vice-pass-123!", document: proofDocument })
  assert.equal(joined.status, 202)
  await approveApplication("sec-vice@syu.ac.kr")
  const { account: joinedAccount } = await logInCoAdmin("sec-vice@syu.ac.kr", "Vice-pass-123!")
  assert.equal(joinedAccount.email, "sec-b@syu.ac.kr")
})

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

  // 비밀번호는 8자에서 64자이며 글자, 숫자, 기호가 있어야 한다.
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
  // 브랜드는 카탈로그의 어느 단체에든 제안하고, 다른 브랜드에는 절대 하지 않는다.
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
  // 버스킹 날의 유일한 협찬사가 그 쿠폰을 넘겨받았다.
  assert.deepEqual(page.coupons, [{ id: "sp-busking", store: "오후의 커피 공릉점", title: "아메리카노 1+1" }])

  const recorded = (await call("POST", "/check-in/20261012/scans")).data
  assert.equal(recorded.entry.participant, `참여자 #${initial.scans + 1}`)
  assert.match(recorded.pass, /^[0-9a-f]{32}$/)
  assert.equal((await call("GET", busking)).data.metrics.scans, initial.scans + 1)

  // 쿠폰은 스캔의 패스가 있어야 하고 번호와 함께 한 번만 나온다. 방문은 매장
  // 직원의 기기에서 그 번호와 PIN으로 확인하며, 참여자의 폰에서는 절대 하지
  // 않는다.
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
  // PIN은 방문자가 아니라 행사를 가진 단체를 위한 것이다.
  assert.equal((await call("GET", busking)).data.report.staffPin, undefined)
  const owner = await login("학생단체")
  const owned = (await call("GET", busking, undefined, owner)).data.report
  assert.equal(owned.staffPin, "1012")
  assert.equal(owned.sponsors[0].staffPin, "1012")

  const scans = (await call("GET", `${busking}/log?kind=scans`)).data.entries
  assert.equal(scans[0].id, recorded.entry.id)
  assert.ok(scans.every((entry: { kind: string }) => entry.kind === "scans"))
  assert.ok((await call("GET", `${busking}/log`)).data.entries.length > scans.length)

  // 단체의 다른 행사는 자기 코드를 가지고 0에서 시작한다.
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
  // 브랜드는 자기 캠페인을 측정하고, 단체의 행사는 측정하지 않는다.
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
  // 예시는 시드된 기본 정보를 보여 주고, 계정이 가진 데모 브랜드는 활동이 말하는
  // 것을 보여 준다(lib/brandProfile.ts).
  type Shown = { id: string; intro?: string; facts?: { label: string; value: string }[]; tags: string[]; sns?: { followers?: string }[] }
  const shown = brands as Shown[]
  assert.ok(shown.every((brand) => brand.intro && brand.facts?.length))
  assert.ok(shown.filter((brand) => brand.id !== "afternoon-coffee").every((brand) => brand.facts?.length === 4))
  const coffee = shown.find((brand) => brand.id === "afternoon-coffee")!
  assert.deepEqual(coffee.facts?.slice(0, 2), [
    { label: "위치", value: "서울 노원구" },
    { label: "제공 서비스", value: "할인 쿠폰 · 현금 후원 · 시음 · 샘플링" },
  ])
  // 어느 브랜드도 팔로워 수를 보여 주지 않는다.
  assert.ok(shown.every((brand) => (brand.sns ?? []).every((row) => row.followers === undefined)))
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
  // 도달은 QR 스캔에 행사장 밖의 도달을 더한 것이고, ROAS는 추정 매출(방문 ×
  // 평균 지출)을 협찬의 가치로 나눈 것이다.
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
  // 모든 단체에는 상세 페이지가 보여 주는 것이 있다.
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
  // 두 번 보내도 요청이 두 건 접수되지 않는다.
  await call("POST", "/proposals", { matchId: "afternoon-coffee" }, student)

  const inbox = (await call("GET", "/requests", undefined, brand)).data.requests
  const fromMuse = inbox.filter((request: { groupName: string }) => request.groupName === "삼육대 뮤즈")
  assert.equal(fromMuse.length, 1)
  const [request] = fromMuse
  assert.equal(request.status, "검토 중")
  assert.equal(request.ask, "쿠폰 150장 + 현금 20만원")

  // 제안은 단체의 다음 행사가 있으면 그 행사에 대한 것이다.
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

  // 수락된 제안은 행사에 연결된 브랜드의 협찬 하나가 되며, 행사의 날이
  // 오면 분석에 나타난다.
  const brandId = (await call("GET", "/auth/me", undefined, brand)).data.account.id
  const record = getDatabase().sponsorships[brandId].find((item) => item.id === `sp-${request.id}`)
  assert.ok(record)
  assert.equal(record.groupName, "삼육대 뮤즈")
  assert.equal(record.eventId, next?.id)
  const analytics = async () => (await call("GET", "/analytics", undefined, brand)).data.sponsorships
  // 아직 그 날이 오지 않았다.
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

  // 계정이 없는 브랜드에 한 제안은 보여 줄 답이 없다.
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

  // 다가오는 행사가 없으면 제안이 분석에 닿지 않으므로, 행사가 생길 때까지
  // 기다린다.
  const none = await call("POST", "/proposals", { matchId: brandId }, student)
  assert.equal(none.status, 409)
  assert.match(none.data.error, /행사를 먼저/)
  assert.equal((await call("GET", "/proposals", undefined, student)).data.proposals.includes(brandId), false)

  const first = (await call("POST", "/events", { name: "첫 공연", date: addDays(today, 5), types: ["현금"] }, student)).data.event
  const second = (await call("POST", "/events", { name: "둘째 공연", date: addDays(today, 30), types: ["현금"] }, student)).data.event
  assert.equal((await call("POST", "/proposals", { matchId: brandId }, student)).status, 201)
  const mine = () => getDatabase().requests.filter((item) => item.groupName === "proposer 동아리")
  assert.deepEqual(mine().map((item) => item.eventId), [first.id])
  // 기다리는 동안 다시 보내도 달라지는 것이 없다.
  assert.equal((await call("POST", "/proposals", { matchId: brandId }, student)).status, 201)
  assert.equal(mine().length, 1)
  assert.equal((await call("GET", "/proposals", undefined, student)).data.confirmed, 0)
  await call("POST", `/requests/${mine()[0].id}/accept`, undefined, brand)
  // 확정된 협찬은 방향에 상관없이 센다. 브랜드의 것은 전부 그 기록이다.
  assert.equal((await call("GET", "/proposals", undefined, student)).data.confirmed, 1)
  const brandAccount = (await call("GET", "/auth/me", undefined, brand)).data.account.id as string
  assert.equal(
    (await call("GET", "/proposals", undefined, brand)).data.confirmed,
    getDatabase().sponsorships[brandAccount].length,
  )
  const again = await call("POST", "/proposals", { matchId: brandId }, student)
  assert.equal(again.status, 409)
  assert.match(again.data.error, /이미 협찬이 확정/)

  // 첫 행사가 끝나면 다음 행사로 제안할 수 있다.
  Object.values(getDatabase().events).flat().find((item) => item.id === first.id)!.date = addDays(today, -2)
  const next = await call("POST", "/proposals", { matchId: brandId }, student)
  assert.equal(next.status, 201)
  assert.deepEqual(mine().map((item) => item.eventId), [first.id, second.id])
  assert.equal(next.data.statuses[brandId], "검토 중")
  // 철회해도 수락된 것과 브랜드는 제안 목록에 남는다.
  const withdrawn = await call("DELETE", `/proposals/${brandId}`, undefined, student)
  assert.equal(withdrawn.status, 200)
  assert.ok(withdrawn.data.proposals.includes(brandId))
  assert.equal(withdrawn.data.statuses[brandId], "수락")
  assert.equal((await call("DELETE", `/proposals/${brandId}`, undefined, student)).status, 409)

  // 브랜드도 마찬가지로 다가오는 캠페인이 필요하다.
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

    // 주인만 고칠 수 있으며, 등록할 때의 검사를 그대로 거친다.
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

    // 브랜드의 제안과 협찬은 새 이름과 날을 따라가고, 브랜드는 무엇이
    // 바뀌었는지 알림을 받는다.
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
    // 파트너가 읽을 일이 없는 변경(종류)은 아무것도 보내지 않는다.
    sent.length = 0
    await call("PUT", `/events/${event.id}`, { ...edit, endDate: "", types: ["현금", "제품"] }, group)
    await settle()
    assert.equal(sent.length, 0)

    // 브랜드의 캠페인도 반대 방향으로 같게 동작한다.
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

    // 시작한 뒤에는 결과를 그 날짜로 집계했으므로 날짜는 그대로 두고, 나머지는
    // 바꿀 수 있다.
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

  // 행사가 진행되는 동안은 기다리고, 마지막 날의 다음 날부터 닫힌다.
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
  // 보낸 그대로 남는다.
  assert.equal(getDatabase().requests.find((item) => item.id === closed.id)?.status, "검토 중")

  // 단체는 닫힌 것으로 보며, 다음 행사에 대해 다시 제안할 수 있다.
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

  // 끝난 캠페인에 대한 브랜드의 제안도 같은 방식으로 닫힌다.
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
    // 계약서를 열면 브랜드의 몫과 함께 행사의 측정이 만들어진다.
    assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.cancelable, true)
    const measurement = () => getDatabase().measurements.find((item) => item.eventId === event.id)!
    assert.equal(measurement().sponsors.length, 1)
    sent.length = 0

    // 한쪽이 이유를 말하며 요청하고, 동의할 수 있는 것은 상대편뿐이다.
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

    // 거절되면 협찬은 남고, 다시 요청할 수 있다.
    const declined = await call("DELETE", `/agreements/${request.id}/cancel`, undefined, group)
    assert.equal(declined.data.agreement.cancel, undefined)
    assert.equal(getDatabase().requests.find((item) => item.id === request.id)?.status, "수락")
    await call("POST", `/agreements/${request.id}/cancel`, { reason }, brand)

    // 동의하면 취소된다. 제안, 브랜드의 기록과 몫이 사라지고 행사는 다시
    // 매칭 상태가 된다.
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

    // 계약서는 기록으로 남는다. 읽을 수는 있지만 아무것도 바꿀 수 없고, 목록에
    // 표시한다.
    assert.equal((await call("GET", `/agreements/${request.id}`, undefined, brand)).status, 200)
    assert.equal((await call("POST", `/agreements/${request.id}/confirm`, undefined, brand)).status, 409)
    assert.equal((await call("PUT", `/reviews/${request.id}`, { rating: 5, tags: [], comment: "" }, group)).status, 409)
    const list = (await call("GET", "/agreements", undefined, group)).data.agreements as { id: string; canceled?: boolean }[]
    assert.equal(list.find((item) => item.id === request.id)?.canceled, true)
    // 이제 행사를 협찬하는 곳이 없으므로 삭제할 수 있다.
    assert.equal((await call("DELETE", `/events/${event.id}`, undefined, group)).status, 204)

    // 브랜드에게 다시 요청할 수 있다. 행사가 끝나면 그 협찬은 취소할 수
    // 없다.
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

    // 공유 데모 계정은 자기 협찬을 취소할 수 없다.
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

    // 남의 행사, 끝난 행사, 너무 긴 메모는 거절한다.
    const propose = (body: object) => call("POST", "/proposals", { matchId: brandListing, ...body }, group)
    assert.equal((await propose({ eventId: "not-mine" })).status, 404)
    assert.equal((await propose({ eventId: past.id })).status, 409)
    assert.equal((await propose({ message: "가".repeat(301) })).status, 400)

    // 나중 행사의 이름을 쓰고, 메모를 브랜드의 받은편지함과 메일로 가져간다.
    sent.length = 0
    assert.equal((await propose({ eventId: far.id, message: note })).status, 201)
    const [request] = (await call("GET", "/requests", undefined, brand)).data.requests
    assert.deepEqual([request.eventName, request.message], ["먼 공연", note])
    await settle()
    assert.match(sent.find((mail) => mail.to[0] === brandEmail)?.text ?? "", /메시지: 공연이 끝나면/)
    // The group sees its note under 보낸 제안.
    assert.equal((await call("GET", "/proposals", undefined, group)).data.sent[0].message, note)

    // 둘 다 없으면 가장 가까운 행사에 대한 것이며 기본 인사말을 쓴다.
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

test("a meeting proposed in a conversation is accepted by the other side, and only the sender calls it off", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { token: group } = await listedMember("meeting@syu.ac.kr", "meeting-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("meeting@meeting-cafe.kr", "meeting-pass-123", "브랜드")
  const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
  const day = addDays(todayInKorea(), 3)
  const meeting = { date: day, time: "14:30", minutes: 60, place: "학생회관 2층 카페" }
  const sent = await call("POST", `/conversations/${chat.id}/meetings`, meeting, group)
  assert.equal(sent.status, 201)
  const message = sent.data.conversation.messages.at(-1)
  assert.deepEqual(message.meeting, { ...meeting, status: "proposed" })
  assert.equal(message.text, `미팅 제안: ${day} 14:30 · 학생회관 2층 카페`)
  // 지난 날, 이상한 길이, 장소 없음은 거절한다.
  for (const wrong of [{ date: addDays(todayInKorea(), -1) }, { minutes: 45 }, { place: "" }, { time: "25:00" }]) {
    assert.equal((await call("POST", `/conversations/${chat.id}/meetings`, { ...meeting, ...wrong }, group)).status, 400)
  }
  const answer = (token: string, value: string) =>
    call("POST", `/conversations/${chat.id}/meetings/${message.id}/answer`, { answer: value }, token)
  // 보낸 쪽은 자기 것을 수락할 수 없고, 상대편은 취소할 수 없다.
  assert.equal((await answer(group, "accept")).status, 403)
  assert.equal((await answer(brand, "cancel")).status, 403)
  const accepted = await answer(brand, "accept")
  assert.equal(accepted.data.conversation.messages.at(-1).meeting.status, "accepted")
  assert.equal((await answer(brand, "decline")).status, 409)
  // 고칠 수 없고, 수락된 뒤에도 보낸 쪽이 취소할 수 있다.
  assert.equal((await call("PUT", `/conversations/${chat.id}/messages/${message.id}`, { text: "바꿔요" }, group)).status, 409)
  assert.equal((await answer(group, "cancel")).data.conversation.messages.at(-1).meeting.status, "canceled")
  const listed = (await call("GET", "/conversations", undefined, brand)).data.conversations
  assert.equal(listed.find((item: { id: string }) => item.id === chat.id).lastMessage.meeting, true)
})

test("an account sending messages or proposals in a flood is held back, and others aren't", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { token: group } = await listedMember("flood@syu.ac.kr", "flood-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("flood@flood-cafe.kr", "flood-pass-123", "브랜드")
  const chat = (await call("POST", "/conversations", { partnerId: brandListing }, group)).data.conversation
  const say = (token: string, text: string) => call("POST", `/conversations/${chat.id}/messages`, { text }, token)

  // 1분에 스무 번은 통과하고, 그다음은 보여 줄 이유와 함께 기다린다.
  for (let count = 1; count <= 20; count += 1) assert.equal((await say(group, `메시지 ${count}`)).status, 201)
  const held = await say(group, "하나 더")
  assert.equal(held.status, 429)
  assert.match(held.data.error, /1분 뒤에/)
  // 따로 세는 상대편은 여전히 답한다.
  assert.equal((await say(brand, "천천히 보내 주세요.")).status, 201)

  // 한 시간에 서른 번의 제안은 달라지는 것이 없어도 통과하고, 그다음은 기다린다.
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
  // RFC 6238의 SHA-1 벡터를 여섯 자리로 쓴다.
  const secret = toBase32(Buffer.from("12345678901234567890"))
  assert.equal(codeAt(secret, stepAt(59_000)), "287082")
  assert.equal(codeAt(secret, stepAt(1_111_111_109_000)), "081804")
  assert.equal(codeAt(secret, stepAt(2_000_000_000_000)), "279037")
  // 앞뒤 한 단계는 받아들이고, 이미 쓴 코드는 받아들이지 않는다.
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

  // 비밀번호로 설정한 뒤 앱의 첫 코드로 켠다. 데모 계정은 할 수 없다.
  assert.equal((await call("POST", "/auth/two-factor/setup", { password: DEMO_PASSWORD }, await login("학생단체"))).status, 403)
  assert.equal((await call("POST", "/auth/two-factor/setup", { password: "wrong-pass-1!" }, token)).status, 400)
  const { secret, url } = (await call("POST", "/auth/two-factor/setup", { password }, token)).data
  assert.match(url, /^otpauth:\/\/totp\/uniconnect%3Atwostep%40syu\.ac\.kr\?secret=[A-Z2-7]+&issuer=uniconnect/)
  assert.equal((await call("POST", "/auth/two-factor/enable", { code: "000000" }, token)).status, 400)
  const code = () => codeAt(secret, stepAt(Date.now()))
  // 보관한다. 그사이 시계가 다음 30초의 코드로 넘어갔을 수 있다.
  const used = code()
  const enabled = (await call("POST", "/auth/two-factor/enable", { code: used }, token)).data
  assert.equal(enabled.account.twoFactorOn, true)
  assert.equal(enabled.account.twoFactor, undefined)
  assert.equal(enabled.recoveryCodes.length, 10)
  assert.match(enabled.recoveryCodes[0], /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)

  // 이제 비밀번호는 세션이 아니라 티켓을 주고, 티켓은 코드를 요구한다.
  const first = (await logIn()).data
  assert.equal(first.twoFactor, true)
  assert.equal(first.token, undefined)
  const withCode = (body: object) => call("POST", "/auth/login/code", { email, ticket: first.ticket, ...body })
  assert.equal((await call("POST", "/auth/login/code", { email, ticket: "nope", code: code() })).status, 401)
  // 켤 때 쓴 코드는 두 번 동작하지 않고, 복구 코드는 한 번 동작한다.
  assert.equal((await withCode({ code: used })).status, 401)
  const recovered = await withCode({ code: enabled.recoveryCodes[0].toLowerCase() })
  assert.equal(recovered.status, 200)
  assert.equal(recovered.data.recoveryLeft, 9)
  assert.equal((await call("GET", "/auth/me", undefined, recovered.data.token)).status, 200)
  const again = (await logIn()).data
  assert.equal((await call("POST", "/auth/login/code", { email, ticket: again.ticket, code: enabled.recoveryCodes[0] })).status, 401)

  // 틀린 코드가 다섯 번이면 티켓이 끝난다.
  const third = (await logIn()).data
  for (let count = 1; count <= 4; count += 1) {
    assert.equal((await call("POST", "/auth/login/code", { email, ticket: third.ticket, code: "111111" })).status, 401)
  }
  const ended = await call("POST", "/auth/login/code", { email, ticket: third.ticket, code: "111111" })
  assert.match(ended.data.error, /너무 많이/)
  assert.equal((await call("POST", "/auth/login/code", { email, ticket: third.ticket, code: enabled.recoveryCodes[1] })).status, 401)

  // 이메일로 한 비밀번호 초기화도 코드를 요구하고 다른 로그인을 끝낸다.
  const newPassword = "twostep-pass-456!"
  await call("POST", "/auth/password-reset/code", { email })
  const resetCode = getDatabase().emailCodes.find((item) => item.email === email && item.purpose === "reset")!.code
  const reset = (await call("POST", "/auth/password-reset", { email, code: resetCode, password: newPassword })).data
  assert.equal(reset.twoFactor, true)
  assert.equal(reset.token, undefined)
  assert.equal((await call("GET", "/auth/me", undefined, recovered.data.token)).status, 401)
  const afterReset = await call("POST", "/auth/login/code", { email, ticket: reset.ticket, code: enabled.recoveryCodes[2] })
  assert.equal(afterReset.status, 200)

  // 끄려면 비밀번호와 코드가 필요하다.
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

  // 총학생회만 이 페이지를 가지며 코드는 처음 열 때 만든다.
  assert.equal((await call("GET", "/council/clubs", undefined, club)).status, 403)
  const first = (await call("GET", "/council/clubs", undefined, council)).data
  assert.match(first.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.deepEqual(first.clubs, [])

  // 동아리는 어떤 형태로 입력해도 코드로 연결한다. 틀린 코드와 데모 계정은 안 된다.
  assert.equal((await call("POST", "/council/links", { code: "AAAA-AAAA" }, club)).status, 400)
  assert.equal((await call("POST", "/council/links", { code: first.code }, await login("학생단체"))).status, 403)
  assert.equal((await call("POST", "/council/links", { code: first.code }, council)).status, 400)
  const linked = await call("POST", "/council/links", { code: first.code.toLowerCase().replace("-", "") }, club)
  assert.equal(linked.status, 201)
  assert.equal(linked.data.councils[0].type, "총학생회")
  assert.equal((await call("POST", "/council/links", { code: first.code }, club)).status, 409)

  // 총학생회는 동아리의 다가오는 행사, 제안, 결과를 읽고, 사적인 것은 읽지 않는다.
  await call("POST", "/events", { name: "소속 공연", date: addDays(todayInKorea(), 12), types: ["현금"] }, club)
  const { clubs } = (await call("GET", "/council/clubs", undefined, council)).data
  assert.equal(clubs.length, 1)
  assert.deepEqual(clubs[0].events.map((event: { name: string }) => event.name), ["소속 공연"])
  assert.deepEqual(clubs[0].results, { scans: 0, coupons: 0, visits: 0 })
  assert.equal(typeof clubs[0].openProposals, "number")
  for (const secret of ["010-1234-5678", "council-club@syu.ac.kr", "passwordHash", "contact"]) {
    assert.equal(JSON.stringify(clubs).includes(secret), false, secret)
  }
  // 연결하지 않은 동아리는 보이지 않는다.
  assert.equal(clubs.some((item: { id: string }) => item.id === getDatabase().accounts.find((a) => a.email === "council-other@syu.ac.kr")!.id), false)
  void other

  // 새 코드로는 더 이상 동아리를 연결할 수 없고, 연결된 곳은 그대로다.
  const renewed = (await call("POST", "/council/code", undefined, council)).data.code
  assert.notEqual(renewed, first.code)
  assert.equal((await call("POST", "/council/links", { code: first.code }, other)).status, 400)
  assert.equal((await call("GET", "/council/clubs", undefined, council)).data.clubs.length, 1)

  // 동아리가 연결을 끊거나 총학생회가 동아리를 빼면 총학생회는 더 이상 그 동아리를 보지 못한다.
  const councilId = linked.data.councils[0].id
  assert.deepEqual((await call("DELETE", `/council/links/${councilId}`, undefined, club)).data.councils, [])
  assert.deepEqual((await call("GET", "/council/clubs", undefined, council)).data.clubs, [])
  await call("POST", "/council/links", { code: renewed }, club)
  const clubId = (await call("GET", "/council/clubs", undefined, council)).data.clubs[0].id
  assert.equal((await call("DELETE", `/council/clubs/${clubId}`, undefined, council)).status, 204)
  assert.deepEqual((await call("GET", "/council/links", undefined, club)).data.councils, [])

  // 총학생회가 떠나면 동아리의 연결이 끊긴다.
  await call("POST", "/council/links", { code: renewed }, club)
  assert.equal((await call("DELETE", "/auth/account", { password: "council-pass-123" }, council)).status, 204)
  assert.deepEqual((await call("GET", "/council/links", undefined, club)).data.councils, [])
})

test("a linked Kakao account logs in, with the state bound to the browser and no token in an address", async () => {
  const { socialAuth } = await import("./routes/social.js")
  const realExchange = socialAuth.exchange
  const realRevoke = socialAuth.revoke
  const revoked: string[] = []
  socialAuth.revoke = async (_provider, token) => {
    revoked.push(token)
  }
  const saved = { kakao: config.kakaoClientId, naverId: config.naverClientId, naverSecret: config.naverClientSecret }
  const origin = baseUrl.replace(/\/api$/, "")
  // 페이지처럼 흐름을 시작한다. 제공자의 주소와 state 쿠키가 온다.
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
  // 제공자가 브라우저를 돌려보낸다.
  const back = async (state: string, cookie: string, code = "auth-code") => {
    const response = await fetch(`${baseUrl}/auth/social/kakao/callback?code=${code}&state=${state}`, {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: "manual",
    })
    // state의 쿠키를 지우는 것 말고도 페이지를 위해 설정하는 쿠키다.
    const set = response.headers.getSetCookie().find((item) => item.startsWith("uc_social_login=") && !item.startsWith("uc_social_login=;"))
    return { to: response.headers.get("location") ?? "", cookie: set?.split(";")[0] ?? "" }
  }
  try {
    // 키가 없으면 내놓을 것이 없다.
    config.kakaoClientId = undefined
    config.naverClientId = undefined
    assert.deepEqual((await call("GET", "/auth/social")).data.providers, [])
    assert.equal((await call("POST", "/auth/social/kakao/start", { intent: "login" })).status, 404)
    // Kakao는 키만 있으면 되고, Naver는 비밀 키도 설정해야 한다.
    config.kakaoClientId = "kakao-rest-key"
    config.naverClientId = "naver-id"
    config.naverClientSecret = undefined
    assert.deepEqual((await call("GET", "/auth/social")).data.providers, ["kakao"])
    socialAuth.exchange = async (_provider, code) => (code === "other" ? { id: "999", token: "t-999" } : { id: "4242", token: "t-4242" })

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
    // 쿠키가 없는 다른 브라우저는 끝낼 수 없다.
    assert.equal((await back(state, "")).to, "/?social=error")
    assert.equal((await back(state, link.cookie)).to, "/me?social=linked-kakao")
    // state는 한 번만 동작한다.
    assert.equal((await back(state, link.cookie)).to, "/?social=error")
    const me = (await call("GET", "/auth/me", undefined, owner)).data.account
    assert.deepEqual(me.socialLinks, ["kakao"])
    assert.equal(JSON.stringify(me).includes("4242"), false)

    // 로그인이면 콜백이 쿠키로 일회용 코드를 페이지에 넘기고, 주소에는 결과만
    // 실린다.
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

    // 아무에게도 연결되지 않은 Kakao 계정은 아무도 로그인시키지 못하고, 계정 하나에만 연결된다.
    const stranger = await start("login")
    assert.equal((await back(stranger.url.searchParams.get("state")!, stranger.cookie, "other")).to, "/?social=unlinked-kakao")
    // 앱과의 연결은 거두고, 연결된 계정의 연결은 절대 거두지 않는다.
    assert.deepEqual(revoked, ["t-999"])
    const second = await signUpMember("social-two@syu.ac.kr", "social-pass-123")
    const taken = await start("link", second)
    assert.equal((await back(taken.url.searchParams.get("state")!, taken.cookie)).to, "/me?social=link-taken")

    // 연결을 끊으면 더 이상 로그인하지 못한다.
    assert.equal((await call("DELETE", "/auth/social/kakao", undefined, owner)).data.account.socialLinks, undefined)
    const after = await start("login")
    assert.equal((await back(after.url.searchParams.get("state")!, after.cookie)).to, "/?social=unlinked-kakao")
    assert.deepEqual(revoked, ["t-999", "t-4242"])
  } finally {
    socialAuth.exchange = realExchange
    socialAuth.revoke = realRevoke
    config.kakaoClientId = saved.kakao
    config.naverClientId = saved.naverId
    config.naverClientSecret = saved.naverSecret
  }
})

test("wrong invitation codes pause joining without deleting anyone's invitation", async () => {
  const first = await signUpMember("share-team-one@syu.ac.kr", "team-pass-123")
  const second = await signUpMember("share-team-two@syu.ac.kr", "team-pass-123")
  const invited = await call("POST", "/team/invites", { name: "부회장", email: "wanted@syu.ac.kr" }, first)
  await call("POST", "/team/invites", { name: "총무", email: "wanted@syu.ac.kr" }, second)
  const join = (code: string) =>
    call("POST", "/team/join", { email: "wanted@syu.ac.kr", code, password: "vice-pass-123", document: proofDocument })
  for (let turn = 0; turn < 5; turn += 1) assert.equal((await join("000000")).status, 400)
  assert.equal((await join("000000")).status, 429)
  for (const token of [first, second]) {
    assert.equal((await call("GET", "/team", undefined, token)).data.team.invites.length, 1)
  }
  await clearRateLimits()
  assert.equal((await join(invited.data.devCode)).status, 202)
  await approveApplication("wanted@syu.ac.kr")
})

test("refunding a granted period moves later periods by that period's length", async () => {
  const { grantPartners } = await import("./lib/adminTools.js")
  const { markCancelled } = await import("./lib/billing.js")
  await listedMember("grant-shift@grant-cafe.kr", "grant-pass-1234", "브랜드")
  const database = getDatabase()
  const brand = database.accounts.find((account) => account.email === "grant-shift@grant-cafe.kr")!
  const year = grantPartners(database, brand, 365)
  const month = grantPartners(database, brand, 30)
  const end = new Date(`${month.periodEnd}T00:00:00Z`).getTime()
  markCancelled(database, year, "테스트 환불")
  assert.equal((end - new Date(`${month.periodEnd}T00:00:00Z`).getTime()) / 86_400_000, 365)
})

test("a document keeps the extension of what it is, and an email can't dodge the free-mail list with a dot", async () => {
  const { parseDocument } = await import("./lib/applications.js")
  const { isPersonalMail, normalizeEmail } = await import("./lib/email.js")
  assert.equal(parseDocument({ ...proofDocument, name: "재직증명서.html" }, "없음").name, "재직증명서.pdf")
  assert.equal(parseDocument({ ...proofDocument, name: "a.pdf.exe" }, "없음").name, "a.pdf.pdf")
  assert.equal(parseDocument({ ...proofDocument, name: "" }, "없음").name, "서류.pdf")
  assert.equal(isPersonalMail(normalizeEmail("shop@Gmail.com.")), true)
})

test("an owner invites co-admins, who log in with their own password and can't do the owner's part", async () => {
  const ownerPassword = "team-pass-123"
  const owner = await signUpMember("team@syu.ac.kr", ownerPassword)
  const join = (body: object) => call("POST", "/team/join", body)

  // 주인이 이메일로 초대하고, 코드는 개발 중에만 돌아온다.
  assert.equal((await call("POST", "/team/invites", { name: "부회장", email: "team@syu.ac.kr" }, owner)).status, 409)
  assert.equal((await call("POST", "/team/invites", { name: "부회장", email: "vice@gmail.com" }, owner)).status, 400)
  const invited = await call("POST", "/team/invites", { name: "부회장", email: "vice@syu.ac.kr" }, owner)
  assert.equal(invited.status, 201)
  assert.match(invited.data.devCode, /^\d{6}$/)
  assert.deepEqual(invited.data.team.invites.map((item: { email: string }) => item.email), ["vice@syu.ac.kr"])
  assert.equal(JSON.stringify(invited.data.team).includes("codeHash"), false)
  assert.equal((await call("POST", "/team/invites", { name: "x", email: "x@syu.ac.kr" }, await login("학생단체"))).status, 403)

  // 틀린 코드는 합류시키지 않고, 맞는 코드는 그 사람의 비밀번호로 합류시킨다.
  assert.equal((await join({ email: "vice@syu.ac.kr", code: "000000", password: "vice-pass-123", document: proofDocument })).status, 400)
  assert.equal((await join({ email: "vice@syu.ac.kr", code: invited.data.devCode, password: "vice-pass-123" })).status, 400)
  const joined = await join({ email: "vice@syu.ac.kr", code: invited.data.devCode, password: "vice-pass-123", document: proofDocument })
  assert.deepEqual([joined.status, joined.data], [202, { pending: true }])
  assert.equal((await join({ email: "vice@syu.ac.kr", code: invited.data.devCode, password: "vice-pass-123", document: proofDocument })).status, 400)
  // 이제 그 이메일은 가입에 쓰인 것이다.
  assert.equal((await call("POST", "/auth/email-code", { role: "학생단체", email: "vice@syu.ac.kr" })).status, 409)
  // 운영자가 승인하기 전에는 로그인할 수 없고, 주인은 기다리는 중임을 본다.
  const waiting = await call("POST", "/auth/login", { role: "학생단체", email: "vice@syu.ac.kr", password: "vice-pass-123" })
  assert.equal(waiting.status, 403)
  assert.match(waiting.data.error, /서류/)
  assert.deepEqual((await call("GET", "/team", undefined, owner)).data.team.waiting.map((item: { name: string }) => item.name), ["부회장"])
  await approveApplication("vice@syu.ac.kr")
  assert.deepEqual((await call("GET", "/team", undefined, owner)).data.team.waiting, [])

  // 2단계 로그인이 먼저다. 코드 없이는 세션이 없고, 첫 로그인에서 설정한다.
  const first = await call("POST", "/auth/login", { role: "학생단체", email: "vice@syu.ac.kr", password: "vice-pass-123" })
  assert.deepEqual([first.data.token, first.data.twoFactor], [undefined, true])
  assert.ok(first.data.setup.secret)
  const wrong = await call("POST", "/auth/login/code", { email: "vice@syu.ac.kr", ticket: first.data.ticket, code: "000000" })
  assert.equal(wrong.status, 401)
  const vice = await logInCoAdmin("vice@syu.ac.kr", "vice-pass-123")
  assert.equal(vice.recoveryCodes.length > 0, true)
  // 설정한 뒤에는 새 비밀 값 없이 코드를 다시 묻는다.
  const again = await call("POST", "/auth/login", { role: "학생단체", email: "vice@syu.ac.kr", password: "vice-pass-123" })
  assert.deepEqual([again.data.token, again.data.twoFactor, again.data.setup], [undefined, true, undefined])
  assert.equal(vice.account.email, "team@syu.ac.kr")
  assert.equal(vice.account.asMember.name, "부회장")
  assert.equal((await call("POST", "/events", { name: "함께 여는 공연", date: "2099-05-01", types: ["현금"] }, vice.token)).status, 201)
  const ownersEvents = (await call("GET", "/events", undefined, owner)).data.events as { name: string }[]
  assert.ok(ownersEvents.some((event) => event.name === "함께 여는 공연"))
  assert.equal((await call("GET", "/auth/me", undefined, owner)).data.account.asMember, undefined)

  // 주인의 몫은 주인의 것으로 남는다.
  for (const [method, route, body] of [
    ["DELETE", "/auth/account", { password: "vice-pass-123" }],
    ["POST", "/auth/email/code", { email: "new@syu.ac.kr", password: "vice-pass-123" }],
    ["POST", "/auth/two-factor/setup", { password: "vice-pass-123" }],
    ["POST", "/team/invites", { name: "총무", email: "treasurer@syu.ac.kr" }],
  ] as const) {
    assert.equal((await call(method, route, body, vice.token)).status, 403, route)
  }
  // 각자 자기 비밀번호를 바꾼다.
  assert.equal((await call("POST", "/auth/password", { current: "vice-pass-123", next: "vice-pass-456!" }, vice.token)).status, 204)
  assert.equal((await call("POST", "/auth/login", { role: "학생단체", email: "team@syu.ac.kr", password: ownerPassword })).status, 200)
  assert.equal((await call("POST", "/auth/login", { role: "학생단체", email: "vice@syu.ac.kr", password: "vice-pass-123" })).status, 401)

  // 주인의 기기 목록에는 공동 관리자의 로그인이 이름과 함께 나오고, 공동 관리자는 자기 것만 본다.
  const ownerSessions = (await call("GET", "/auth/sessions", undefined, owner)).data.sessions as { member?: string }[]
  assert.ok(ownerSessions.some((session) => session.member === "부회장"))
  const viceSessions = (await call("GET", "/auth/sessions", undefined, vice.token)).data.sessions as { member?: string }[]
  assert.ok(viceSessions.length >= 1 && viceSessions.every((session) => session.member === undefined))

  // 데이터 다운로드는 팀을 비밀번호 없이 나열한다.
  const exported = (await call("GET", "/auth/export", undefined, owner)).data
  assert.deepEqual(exported.team.map((item: { name: string }) => item.name), ["부회장"])
  assert.equal(JSON.stringify(exported).includes("passwordHash"), false)

  // 공동 관리자를 팀에서 빼면 그 로그인이 바로 끝난다.
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
  // 세션 id는 세션을 가리킬 뿐 그 토큰이 아니다.
  assert.ok(listed.every((session: { id: string }) => /^[0-9a-f]{16}$/.test(session.id)))

  // 기기 하나를 내보내면 그 로그인이 끝난다.
  const phoneId = listed.find((session: { device: string }) => session.device.startsWith("Samsung")).id
  assert.equal((await call("DELETE", `/auth/sessions/${phoneId}`, undefined, mac)).status, 204)
  assert.equal((await call("GET", "/auth/me", undefined, phone)).status, 401)
  assert.equal((await call("DELETE", `/auth/sessions/${phoneId}`, undefined, mac)).status, 404)
  // 나머지를 모두 내보내도 이 기기는 남는다.
  assert.equal((await call("DELETE", "/auth/sessions", undefined, mac)).status, 204)
  assert.equal((await call("GET", "/auth/me", undefined, tablet)).status, 401)
  assert.equal((await call("GET", "/auth/sessions", undefined, mac)).data.sessions.length, 1)
  // 다른 계정의 세션은 찾을 수 없고, 공유 데모 계정에는 목록이 없다.
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

    // 최신 것을 보여 주는 페이지는 기다리다가 답이 오면 바로 안다.
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

    // 더 오래된 표식은 바로 답한다.
    const begun = Date.now()
    assert.equal((await read(group, stamp)).data.conversation.messages.length, 1)
    assert.ok(Date.now() - begun < 500)

    // 보낸 쪽은 메시지가 읽히면 안다.
    await call("POST", `/conversations/${chat.id}/messages`, { text: "고마워요" }, group)
    const mine = (await read(group)).data
    assert.equal(mine.conversation.messages.at(-1).read, false)
    const waitingRead = read(group, mine.stamp)
    await new Promise((resolve) => setTimeout(resolve, 150))
    await read(brand)
    assert.equal((await waitingRead).data.conversation.messages.at(-1).read, true)

    // 새것이 없으면 대기 시간이 끝날 때도 같게 답한다.
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

  // 2MB 이하의 사진과 진짜 PDF만 받고, 공유 데모 계정에서는 받지 않는다.
  assert.equal((await call("POST", files, { file: "data:application/pdf;base64,aGVsbG8=", name: "a.pdf" }, group)).status, 400)
  assert.equal((await call("POST", files, { file: png.replace("image/png", "image/gif") }, group)).status, 400)
  assert.equal((await call("POST", files, { file: pdfOf(2 * 1024 * 1024 + 1), name: "big.pdf" }, group)).status, 400)
  const demoBrand = await login("브랜드")
  const [demoChat] = (await call("GET", "/conversations", undefined, demoBrand)).data.conversations
  assert.equal((await call("POST", `/conversations/${demoChat.id}/attachments`, { file: png }, demoBrand)).status, 403)

  // 사진은 고른 이름 그대로 따로 하나의 메시지로 간다.
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

  // 양쪽은 열 수 있고 다른 누구도 열 수 없다.
  const seen = await open(brand, photo.attachment.file)
  assert.equal(seen.status, 200)
  assert.equal(seen.headers.get("content-type"), "image/png")
  assert.equal(Buffer.from(await seen.arrayBuffer()).toString("base64"), png.split(",")[1])
  assert.equal((await open(group, photo.attachment.file)).status, 200)
  assert.equal((await open(stranger, photo.attachment.file)).status, 404)
  assert.equal((await open(undefined, photo.attachment.file)).status, 401)
  assert.equal((await open(brand, "..%2Fdb.json")).status, 404)

  // PDF는 저장할 이름으로 내려온다.
  const pdf = (await call("POST", files, { file: pdfOf(1000), name: "제안서.pdf" }, brand)).data.conversation.messages.at(-1)
  assert.equal(pdf.attachment.type, "pdf")
  const saved = await open(group, pdf.attachment.file)
  assert.equal(saved.headers.get("content-type"), "application/pdf")
  assert.match(saved.headers.get("content-disposition") ?? "", /^attachment;.*filename\*=UTF-8''%EC%A0%9C%EC%95%88%EC%84%9C\.pdf/)

  // 파일은 수정하지 않고, 그 메시지를 지우면 파일도 사라진다.
  assert.equal((await call("PUT", `/conversations/${chat.id}/messages/${photo.id}`, { text: "고친 글" }, group)).status, 409)
  const removed = (await call("DELETE", `/conversations/${chat.id}/messages/${photo.id}`, undefined, group)).data
  assert.equal(removed.conversation.messages[0].attachment, undefined)
  assert.equal((await open(brand, photo.attachment.file)).status, 404)
  assert.ok(!existsSync(path.join(uploadsFolder(chatFiles(chat.id)), photo.attachment.file)))

  // 계정마다 파일은 최대 10MB까지 보관한다.
  for (let count = 1; count <= 5; count += 1) {
    assert.equal((await call("POST", files, { file: pdfOf(2 * 1024 * 1024), name: `${count}.pdf` }, group)).status, 201)
  }
  const full = await call("POST", files, { file: png }, group)
  assert.equal(full.status, 409)
  assert.match(full.data.error, /10MB/)

  // 단체가 떠나면 대화의 파일도 함께 사라진다.
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

  // 아직 아니다. 그날 전의 테스트는 세지 않는다.
  const later = await create(addDays(today, 3))
  const early = await call("POST", `/check-in/${later.report.code}/scans`)
  assert.equal(early.status, 409)
  assert.match(early.data.error, /아직 참여를 받지 않는/)

  // 그날에는 날짜와 시간별 스캔과 쿠폰이 센다.
  const now = await create(today)
  const code = now.report.code
  const { pass } = (await call("POST", `/check-in/${code}/scans`)).data
  const { coupon } = (await call("POST", `/check-in/${code}/coupons`, { pass })).data
  await call("POST", `/check-in/${code}/scans`)
  const measured = (await call("GET", `/measurements/${now.event.id}`, undefined, student)).data.report
  assert.equal(measured.hourlyScans.length, 1)
  assert.equal(measured.hourlyScans[0].date, today)
  assert.equal(measured.hourlyScans[0].scans, 2)

  // 사흘 뒤에는 스캔이 더 늘지 않지만 쿠폰은 여전히 방문을 가져온다.
  const event = Object.values(getDatabase().events).flat().find((item) => item.id === now.event.id)!
  event.date = addDays(today, -3)
  const over = await call("POST", `/check-in/${code}/scans`)
  assert.equal(over.status, 409)
  assert.match(over.data.error, /참여 기간이 끝난/)
  assert.equal((await call("POST", `/check-in/${code}/coupons`, { pass })).status, 409)
  const measurement = getDatabase().measurements.find((item) => item.eventId === now.event.id)!
  assert.equal(Object.keys(measurement.passes).length, 2)
  // 쿠폰이 없는 기록은 더 이상 필요하지 않다.
  assert.equal(prunePasses(getDatabase(), measurement, event), true)
  assert.deepEqual(Object.keys(measurement.passes), [pass])
  const visit = await call("POST", `/check-in/${code}/staff/visits`, { pin: now.report.staffPin, coupon })
  assert.equal(visit.status, 200)

  // 쿠폰 기간이 끝나면 방문도 기록도 받지 않는다.
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

  // 두 번째 브랜드가 버스킹 날을 협찬하면 자기 쿠폰을 받고, 단체가 몫을
  // 정하기 전까지 행사의 가치는 똑같이 나뉜다.
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

    // 참여자가 두 쿠폰을 모두 받고, 각 매장은 자기 쿠폰만 확인한다.
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

    // 데모 브랜드의 분석에는 자기 쿠폰의 수치만 담긴다.
    const after = await analytics()
    assert.equal(after.coupons, before.coupons + 1)
    assert.equal(after.visits, before.visits)
    const split = (await call("GET", "/measurements/event-busking-day", undefined, owner)).data
    assert.deepEqual([split.report.sponsors[1].coupons, split.report.sponsors[1].visits], [1, 1])
    assert.equal(split.metrics.visits, before.visits + 1)

    // 단체가 협찬사마다의 몫을 정하며, 합이 맞아야 한다.
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
    // 행사의 가치만 바꿔도 몫의 합은 계속 맞아야 한다.
    const smaller = { ...goalsBefore, valueBreakdown: [{ type: "현금", value: 100000 }] }
    assert.equal((await call("PUT", route, smaller, owner)).status, 400)
  } finally {
    delete database.sponsorships["another-brand"]
    measurement.sponsors = measurement.sponsors.filter((sponsor) => sponsor.id !== "sp-another")
    measurement.goals = goalsBefore
  }
})

test("events and campaigns take an optional budget", async () => {
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
  const event = await call("POST", "/events", { ...campaign, budget: 300000 }, student)
  assert.equal(event.data.event.budget, 300000)
  assert.equal((await call("POST", "/events", { ...campaign, budget: -1 }, student)).status, 400)
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

  // 첫날에 끝나면 하루짜리 행사다.
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

  // 질문한 사람만 질문을 본다.
  const brand = await login("브랜드")
  assert.equal((await call("GET", "/inquiries", undefined, brand)).data.inquiries.length, 0)

  // 운영자에게는 관리자 토큰이 필요하다.
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
    // 답이 보내는 것만 담고 가입 코드는 담지 않는다.
    sent.length = 0

    assert.equal((await answer(id, "내 정보의 '로그인 이메일 바꾸기'에서 바꿀 수 있어요.")).status, 200)
    await settle()
    const mail = sent.find((item) => item.to[0] === email)
    assert.equal(mail?.subject, "[uniconnect] 문의에 답변이 왔어요")
    assert.match(mail?.text ?? "", /답변: 내 정보의 '로그인 이메일 바꾸기'/)
    assert.match(mail?.text ?? "", /https:\/\/uniconnect\.example\/faq/)
    const [unread] = (await call("GET", "/inquiries", undefined, member)).data.inquiries
    assert.equal(unread.answerReadAt, undefined)

    // 보았다면 더 이상 소식이 아니며, 같은 답을 다시 달아도 달라지는 것이 없다.
    const [read] = (await call("POST", "/inquiries/read", undefined, member)).data.inquiries
    assert.ok(read.answerReadAt)
    sent.length = 0
    await answer(id, "내 정보의 '로그인 이메일 바꾸기'에서 바꿀 수 있어요.")
    await settle()
    assert.equal(sent.length, 0)
    assert.ok((await call("GET", "/inquiries", undefined, member)).data.inquiries[0].answerReadAt)

    // 바뀐 답은 다시 소식이다.
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

  // 내려진 후기는 리스팅의 후기에서 빠진다.
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

  // 운영자는 신고된 것을 당시 글과 함께, 대기 중인 것부터 본다.
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

  // 차단하면 둘이 서로의 리스팅, 제안, 대화를 보지 못한다.
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

  // 정지되면 계정은 로그인할 수도 로그인을 유지할 수도 없고 누구에게도 보이지 않는다.
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
  // 다시 저장해도 하나만 남고, 가장 최근 것이 먼저 온다.
  assert.equal((await call("PUT", `/saved/${cafe}`, undefined, group)).status, 204)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [bakery, cafe])
  // 회원이 볼 수 있는 반대편의 리스팅만 되고 예시나 모르는 것은 안 되며,
  // 방문자는 절대 안 된다.
  const database = getDatabase()
  const example = database.brands.find((item) => !database.accounts.some((account) => account.brandId === item.id))!
  assert.equal((await call("PUT", `/saved/${example.id}`, undefined, group)).status, 404)
  assert.equal((await call("PUT", "/saved/nope", undefined, group)).status, 404)
  assert.equal((await call("PUT", `/saved/${cafe}`)).status, 401)
  assert.equal((await call("DELETE", `/saved/${bakery}`, undefined, group)).status, 204)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [cafe])
  assert.deepEqual((await call("GET", "/auth/export", undefined, group)).data.saved, [{ id: cafe, name: "saved 카페" }])
  // 차단한 파트너는 차단을 풀 때까지 목록에서 빠진다.
  await call("POST", "/blocks", { listingId: cafe }, group)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [])
  await call("DELETE", `/blocks/${cafe}`, undefined, group)
  assert.deepEqual((await call("GET", "/saved", undefined, group)).data.saved, [cafe])
  // 떠난 브랜드는 모든 목록에서 사라진다.
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
  // 새 제안은 거절하지만, 진행 중인 제안은 여전히 수락할 수 있다.
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
  // 잘못된 입력, 데모 계정, 리스팅이 없는 계정은 거절한다.
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

    // 키가 없으면 아직 내놓지 않는다.
    assert.deepEqual((await call("GET", "/profile/business", undefined, brand)).data, { ready: false, business: null })
    assert.equal((await verify(form)).status, 503)
    config.ntsServiceKey = "test-key"
    assert.equal((await verify(form, group)).status, 403)
    assert.equal((await verify(form, await login("브랜드"))).status, 403)
    assert.equal((await verify({ ...form, number: "123" })).status, 400)

    // 일치하지 않는 정보, 폐업한 사업자, 서비스 중단이다.
    answer = "invalid"
    const unmatched = await verify(form)
    assert.equal(unmatched.status, 400)
    assert.match(unmatched.data.error, /확인되지 않았어요/)
    answer = "closed"
    assert.match((await verify(form)).data.error, /폐업/)
    answer = "down"
    assert.equal((await verify(form)).status, 502)

    // 확인되면 번호만 보관하고, 단체는 리스팅을 확인된 것으로 본다.
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

    // 사업자 하나는 계정 하나만 확인한다.
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

  // 브랜드는 새 소개를 바로 본다.
  const { groups } = (await call("GET", "/groups")).data
  assert.equal(groups.find((group: { id: string }) => group.id === "syu-muse").offer, draft.offer)

  // 새 계정은 소개를 저장해야 목록에 오른다.
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
  // 대화하려면 먼저 리스팅이 필요하다.
  const early = await call("POST", "/conversations", { partnerId: "syu-muse" }, newBrand)
  assert.equal(early.status, 409)
  // 브랜드는 제안을 목록에서 하나 이상 고르며, 태그, 기본 정보, 팔로워 수로
  // 입력하려던 것은 보관하지 않는다.
  const typed = { intro: "대학생을 위한 온라인 강의 플랫폼이에요.", offer: "수강권 50장" }
  assert.equal((await call("PUT", "/profile", typed, newBrand)).status, 400)
  const created = await call(
    "PUT",
    "/profile",
    {
      ...typed,
      offers: [{ kind: "제품 협찬" }, { kind: "없는 협찬" }, { kind: "할인 쿠폰", detail: " 100장 " }, { kind: "할인 쿠폰" }],
      tags: ["직접 쓴 태그"],
      facts: [{ label: "평균 응답", value: "1분 이내" }],
      sns: [{ platform: "인스타그램", handle: "@newbrand", followers: "9,999명" }],
    },
    newBrand,
  )
  assert.equal(created.data.profile.industry, "education")
  assert.deepEqual(created.data.profile.offers, [{ kind: "제품 협찬" }, { kind: "할인 쿠폰", detail: "100장" }])
  assert.equal(created.data.profile.offer, "제품 협찬 · 할인 쿠폰 100장")
  const long = { ...typed, offers: [{ kind: "현금 후원", detail: "가".repeat(31) }] }
  assert.equal((await call("PUT", "/profile", long, newBrand)).status, 400)
  assert.deepEqual(created.data.profile.sns, [{ platform: "인스타그램", handle: "@newbrand" }])
  // Its 기본 정보 and tags come from what it does: its offers so far.
  assert.deepEqual(created.data.profile.facts, [{ label: "제공 서비스", value: "제품 협찬 · 할인 쿠폰" }])
  assert.deepEqual(created.data.profile.tags, ["제품 협찬"])
  // 반대편의 회원은 찾을 수 있고, 방문자와 데모 계정이 보는 예시에는
  // 나타나지 않는다.
  const named = async (token?: string) =>
    ((await call("GET", "/brands", undefined, token)).data.brands as { name: string }[]).map((brand) => brand.name)
  assert.ok((await named(await signUpMember("finder@syu.ac.kr", "finder-pass-123"))).includes("새로운 브랜드"))
  assert.ok(!(await named()).includes("새로운 브랜드"))
  assert.ok(!(await named(student)).includes("새로운 브랜드"))
})

test("불러오기 offers a brand's past sponsorships and a group's past events as portfolio rows", async () => {
  const brand = await login("브랜드")
  const { items } = (await call("GET", "/profile/history", undefined, brand)).data as {
    items: { id: string; date: string; title: string; detail: string }[]
  }
  assert.ok(items.length > 0)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  assert.ok(items.every((item) => item.date <= today && /\(\d{4}\.\d{2}\)$/.test(item.title) && item.title.length <= 40))
  // 최신순이다.
  assert.deepEqual(items.map((item) => item.date), [...items.map((item) => item.date)].sort().reverse())
  const group = await login("학생단체")
  const events = (await call("GET", "/profile/history", undefined, group)).data.items as { date: string }[]
  assert.ok(events.every((item) => item.date < today))
  assert.equal((await call("GET", "/profile/history")).status, 401)
})

test("the proposal state lists what an account sent, until it is taken back", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const today = todayInKorea()
  const { token: group, listingId: groupListing } = await listedMember("sender@syu.ac.kr", "sender-pass-123")
  const { token: brand, listingId: brandListing } = await listedMember("sender@sender-cafe.kr", "sender-pass-123", "브랜드")
  await call("POST", "/events", { name: "보낸 공연", date: addDays(today, 9), types: ["현금"] }, group)
  await call("POST", "/events", { name: "보낸 캠페인", date: addDays(today, 11), types: ["제품"] }, brand)

  // 단체의 요청이다. 어느 브랜드에, 어느 행사에 대해, 무엇을 요청하는지다.
  const sent = (await call("POST", "/proposals", { matchId: brandListing }, group)).data.sent
  assert.equal(sent.length, 1)
  assert.deepEqual(
    [sent[0].partnerId, sent[0].partnerName, sent[0].eventName, sent[0].offer, sent[0].status],
    [brandListing, "sender 카페", "보낸 공연", "음료 · 식품 · 할인 쿠폰", "검토 중"],
  )
  // 브랜드의 제안이며, 학교와 함께 단체에 간다.
  const offered = (await call("POST", "/proposals", { matchId: groupListing }, brand)).data.sent
  assert.deepEqual([offered[0].partnerName, offered[0].school, offered[0].eventName], ["sender 동아리", "삼육대학교", "보낸 캠페인"])
  // 방문자는 보낸 것이 없고, 하나를 거두면 목록이 빈다.
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

  // 회원의 카탈로그와 매칭에는 회원의 리스팅만 있다.
  const forGroup = await ids("/brands", "brands", group)
  assert.ok(forGroup.includes(brandListing))
  assert.ok(forGroup.every((id) => byMember("brandId", id)))
  assert.ok((await ids("/matches", "matches", group)).every((id) => forGroup.includes(id)))
  const forBrand = await ids("/groups", "groups", brand)
  assert.ok(forBrand.includes(groupListing))
  assert.ok(forBrand.every((id) => byMember("groupId", id)))

  // 방문자와 데모 계정은 예시를 보고 회원은 보지 않는다.
  for (const token of [undefined, demoGroup]) {
    const shown = await ids("/brands", "brands", token)
    assert.ok(shown.includes("afternoon-coffee") && shown.includes("studymate"))
    assert.ok(!shown.some((id) => byMember("brandId", id)))
  }
  assert.ok(!(await ids("/groups", "groups", demoBrand)).some((id) => byMember("groupId", id)))

  // 둘은 서로에게 제안이나 메시지를 보낼 수 없다.
  await call("POST", "/events", { name: "따로 공연", date: "2026-12-19", types: ["현금"] }, group)
  for (const matchId of ["studymate", "afternoon-coffee"]) {
    assert.equal((await call("POST", "/proposals", { matchId }, group)).status, 404, matchId)
  }
  assert.equal((await call("POST", "/proposals", { matchId: groupListing }, demoBrand)).status, 404)
  assert.equal((await call("POST", "/proposals", { matchId: brandListing }, demoGroup)).status, 404)
  assert.equal((await call("POST", "/conversations", { partnerId: "afternoon-coffee" }, group)).status, 404)
  assert.equal((await call("POST", "/conversations", { partnerId: brandListing }, demoGroup)).status, 404)

  // 예시를 분리하기 전에 보낸 예시에 대한 제안은 더 이상 세지 않는다.
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

  // 열면 읽은 것이 되고, 답하면 학생단체에 닿는다.
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

  // 대화를 두 번 시작하면 같은 대화가 열리고, 파트너가 있어야 한다.
  const started = await call("POST", "/conversations", { partnerId: "glowlab" }, student)
  assert.equal(started.status, 201)
  assert.equal(started.data.conversation.partner.hasAccount, false)
  const again = await call("POST", "/conversations", { partnerId: "glowlab" }, student)
  assert.equal(again.data.conversation.id, started.data.conversation.id)
  assert.equal((await call("POST", "/conversations", { partnerId: "nope" }, student)).status, 404)

  // 다른 계정은 읽을 수 없고, 방문자에게는 대화가 없다.
  assert.equal((await call("GET", `/conversations/${started.data.conversation.id}`, undefined, brand)).status, 404)
  assert.deepEqual((await call("GET", "/conversations")).data.conversations, [])
})

test("senders see when messages are read, and both sides see edits and deletions", async () => {
  const student = await login("학생단체")
  const brand = await login("브랜드")
  const forStudent = (await call("GET", "/conversations", undefined, student)).data.conversations
  const { id } = forStudent.find((item: { partner: { id: string } }) => item.partner.id === "afternoon-coffee")

  // 브랜드가 대화를 열기 전까지는 읽지 않은 상태이고, 읽음 표시는 보낸 쪽만의 것이다.
  const sent = await call("POST", `/conversations/${id}/messages`, { text: "내일 오후 3시에 통화 가능할까요?" }, student)
  const message = sent.data.conversation.messages.at(-1)
  assert.equal(message.read, false)
  const forBrand = (await call("GET", `/conversations/${id}`, undefined, brand)).data.conversation
  assert.equal(forBrand.messages.at(-1).read, undefined)
  const reread = (await call("GET", `/conversations/${id}`, undefined, student)).data.conversation
  assert.equal(reread.messages.at(-1).read, true)

  // 보낸 쪽만 수정하며, 양쪽은 수정됨으로 표시된 새 본문을 본다.
  const route = `/conversations/${id}/messages/${message.id}`
  assert.equal((await call("PUT", route, { text: "제가 고칠게요" }, brand)).status, 403)
  assert.equal((await call("PUT", route, { text: " " }, student)).status, 400)
  const edited = await call("PUT", route, { text: "내일 오후 4시에 통화 가능할까요?" }, student)
  assert.equal(edited.status, 200)
  assert.ok(edited.data.conversation.messages.at(-1).editedAt)
  const brandSees = (await call("GET", `/conversations/${id}`, undefined, brand)).data.conversation.messages.at(-1)
  assert.equal(brandSees.text, "내일 오후 4시에 통화 가능할까요?")
  assert.ok(brandSees.editedAt)

  // 보낸 쪽만 지우며, 본문은 양쪽에서 사라지고 삭제된 채로 남는다.
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
  // 읽기 전에 삭제한 메시지는 읽기를 기다리지 않는다.
  const slip = await call("POST", `/conversations/${id}/messages`, { text: "잘못 보냈어요" }, student)
  await call("DELETE", `/conversations/${id}/messages/${slip.data.conversation.messages.at(-1).id}`, undefined, student)
  const unread = (await call("GET", "/conversations", undefined, brand)).data.conversations.find(
    (item: { id: string }) => item.id === id,
  ).unread
  assert.equal(unread, 0)
})

test("the demo's sentences saved before PR #283 read as they do now; anyone else's stay", async () => {
  const { upgradeDatabase } = await import("./store.js")
  const { createSeed, museConcertPage } = await import("./data/seed.js")
  const stored = await createSeed()
  const comma = (text: string) => text.replace(/(서고|좋고|주셨고|드리고) /, "$1, ")
  // 저장된 그대로, 쉼표가 있는 같은 문장이다.
  const concert = Object.values(stored.events).flat().find((event) => event.id === "event-muse-concert")!
  concert.intro = comma(museConcertPage.intro)
  const review = stored.reviews.find((item) => item.comment.startsWith("버스킹 날 커피를"))!
  review.comment = comma(review.comment)
  const offer = stored.offers.find((item) => item.message.startsWith("종강 공연 관객에게"))!
  offer.message = comma(offer.message)
  const message = stored.conversations.flatMap((item) => item.messages).find((item) => item.text.startsWith("반가워요! 현장 배부도"))!
  message.text = comma(message.text)
  assert.ok([concert.intro, review.comment, offer.message, message.text].every((text) => text.includes(", ")))
  // 비슷해 보일 뿐인 회원 자신의 글은 건드리지 않는다.
  const mine = "우리 공연은 밴드가 무대에 서고, 관객이 함께 노래해요."
  const own = { ...concert, id: "event-mine", intro: mine }
  stored.events.someone = [own]

  const upgraded = upgradeDatabase(structuredClone(stored))
  const events = Object.values(upgraded.events).flat()
  assert.equal(events.find((event) => event.id === "event-muse-concert")!.intro, museConcertPage.intro)
  assert.equal(events.find((event) => event.id === "event-mine")!.intro, mine)
  assert.ok(!upgraded.reviews.find((item) => item.id === review.id)!.comment.includes(", "))
  assert.ok(!upgraded.offers.find((item) => item.id === offer.id)!.message.includes(", "))
  const texts = upgraded.conversations.flatMap((item) => item.messages).map((item) => item.text)
  assert.ok(texts.some((text) => text.startsWith("반가워요! 현장 배부도 좋고 QR")))
})

test("older data files gain the new collections and calendar dates", async () => {
  const { upgradeDatabase } = await import("./store.js")
  const old = {
    events: { someone: [{ date: "2026. 11. 27." }, { date: "미정" }] },
  } as unknown as Parameters<typeof upgradeDatabase>[0]
  const upgraded = upgradeDatabase(old)
  assert.equal(upgraded.brands.length, 12)
  // 데모 단체가 없으면 측정할 버스킹 날도 없다.
  assert.deepEqual(upgraded.measurements, [])
  assert.equal(upgraded.groups.length, 8)
  assert.equal(upgraded.catalogVersion, 4)
  assert.ok(upgraded.brands.every((brand) => brand.intro && brand.sns && brand.portfolio))
  assert.equal(upgraded.conversations.length, 3)

  // 버전 2 카탈로그는 수정을 유지하고 데모 매장 위치를 한 번 얻는다. 이후에
  // 주소를 지운 브랜드는 지운 채로 둔다.
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

  // 버전 3 데이터는 Kakao 주소 검색이 준 좌표를 잃고(보관할 수 없다) 주소는
  // 유지하며, 데모 매장은 자기 좌표를 유지한다.
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

  // 목표가 생기기 전에 저장된 협찬은 목표를 받는다.
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
  // 파일이 들어 있는 폴더로 이름을 바꾸면 디스크가 가득 찼을 때처럼 실패한다.
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
  // 메모리에 남은 것이 없으므로 다시 시도하면 행사가 둘이 아니라 하나 생긴다.
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
    // 저장에 실패한 요청은 그 메서드와 경로와 함께 남는다.
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
    // 운영자는 메일로 알게 된다.
    assert.equal(alerts().length, 1)
    assert.equal(alerts()[0].subject, "[uniconnect] 오류가 생겼어요")

    // 브라우저의 오류도 쿼리 없는 페이지 경로와 함께 남지만, 바로 뒤따르면
    // 아무에게도 메일을 보내지 않는다.
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
    // 운영자만 읽을 수 있다.
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

  // 허용되는 최대 크기의 행사는 목표 양식이 그대로 받아들이는 목표를 얻는다.
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
  // 검사 전에 보관된 아주 큰 수도 범위 안의 목표를 준다.
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
  // 같은 곳의 다른 주소는 여전히 하나를 얻는다.
  const other = await call("POST", "/auth/email-code", { role: "학생단체", email: "other@syu.ac.kr" })
  assert.equal(other.status, 200)
})

test("repeated wrong passwords lock that login for a while", async () => {
  const attempt = (password: string) =>
    call("POST", "/auth/login", { role: "학생단체", email: "muse@syu.ac.kr", password })
  for (let i = 0; i < 10; i += 1) assert.equal((await attempt("wrong-password")).status, 401)
  assert.equal((await attempt(DEMO_PASSWORD)).status, 429)
  // 다른 계정은 여전히 로그인한다.
  assert.ok(await login("브랜드"))
})

test("the admin token check fails safely and slows guessing", async () => {
  const admin = (token: string) =>
    fetch(`${baseUrl}/admin/inquiries`, { headers: { "X-Admin-Token": token } }).then(
      (response) => response.status,
    )
  // 진짜 토큰과 길이는 같고 ASCII 밖의 글자가 있다.
  assert.equal(await admin("tést-admin-token"), 403)
  assert.equal(await admin("test-admin-token"), 200)
  for (let i = 0; i < 9; i += 1) assert.equal(await admin("wrong"), 403)
  assert.equal(await admin("test-admin-token"), 429)
})

test("check-in records are limited per address", async () => {
  // 한도까지 스캔하면 최근 기록이 밀려나므로 뒤의 테스트를 위해 되돌린다.
  const sample = getDatabase().measurements.find((item) => item.code === "20261012")!
  const { log, metrics, hourlyScans, passes } = structuredClone(sample)
  for (let i = 0; i < 600; i += 1) {
    assert.equal((await call("POST", "/check-in/20261012/scans")).status, 200)
  }
  assert.equal((await call("POST", "/check-in/20261012/scans")).status, 429)
  Object.assign(sample, { log, metrics, hourlyScans, passes })
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

  // 여러 주소(신뢰하는 프록시)에서 와도 틀린 PIN이 30번이면 행사 자체가
  // 잠긴다.
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
  // 나중에 생긴 현장 집계는 단체의 현장 PIN과 함께 0에서 시작한다.
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

// 테스트를 위해 가입해 로그인한 회원과 그 토큰이다. 브랜드를 요청하지
// 않으면 학생단체다.
async function signUpMember(email: string, password: string, role: "학생단체" | "브랜드" = "학생단체", extra: Record<string, unknown> = {}) {
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
    ...extra,
  })
  assert.equal(signup.status, 201)
  return signup.data.token as string
}

// 리스팅을 써서 반대편 회원이 찾을 수 있게 한 회원이다. 토큰과 리스팅의
// id를 돌려준다.
async function listedMember(email: string, password: string, role: "학생단체" | "브랜드" = "학생단체") {
  const token = await signUpMember(email, password, role)
  const students = role === "학생단체"
  const profile = students
    ? { intro: "캠퍼스에서 정기 공연을 여는 동아리예요.", offer: "관객 100명" }
    : { intro: "대학가에서 학생 행사를 돕는 카페예요.", offers: ["음료 · 식품", "할인 쿠폰"] }
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
  // 코드는 메일로만 간다(메일 서비스가 없으면 로그로만 간다). EXPOSE_EMAIL_CODES가
  // 켜져 있어도 응답에는 절대 담지 않으며, 테스트는 데이터에서 읽는다.
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
  // 가입 확인은 초기화 코드를 쓸 수 없다.
  assert.equal((await call("POST", "/auth/email-code/verify", { email, code })).status, 400)
  // 새 비밀번호는 가입과 같은 규칙을 따르며, 코드보다 먼저 확인한다.
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
  // 초기화 전의 세션은 끝나고 새 세션은 동작한다.
  assert.equal((await call("GET", "/auth/me", undefined, before)).status, 401)
  assert.equal((await call("GET", "/auth/me", undefined, done.data.token)).status, 200)
  // 코드는 소진된다.
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
    // 동시에 시작해도 무엇이 먼저 끝나든 옛 비밀번호가 동작하는 세션을
    // 남기면 안 된다.
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

  // 데모 계정은 모두를 위해 남는다.
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
  // 같은 이메일로 다시 가입할 수 있다.
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
  // 다시 제안해도 두 번째 제안은 가지 않는다.
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
  // 브랜드는 단체의 행사 목표를 정할 수 없다.
  assert.equal((await call("PUT", route, goals, brand)).status, 404)

  const student = await login("학생단체")
  const bad = await call("PUT", route, { ...goals, expectedAudience: 0 }, student)
  assert.equal(bad.status, 400)
  assert.match(bad.data.error, /예상 인원은/)
  const badType = { ...goals, valueBreakdown: [{ type: "주식", value: 1000 }] }
  assert.equal((await call("PUT", route, badType, student)).status, 400)
  assert.equal((await call("PUT", route, { ...goals, coupon: { store: "", title: "x" } }, student)).status, 400)
  assert.equal((await call("PUT", route, { ...goals, staffPin: "12a4" }, student)).status, 400)
  // ROAS 목표 0은 나누게 된다.
  const noGoal = await call("PUT", route, { ...goals, targets: { ...goals.targets, roas: 0 } }, student)
  assert.equal(noGoal.status, 400)
  assert.match(noGoal.data.error, /목표 ROAS는 1부터/)

  // 브랜드가 행사를 협찬하면 협찬사마다의 쿠폰이 목표와 함께 온다.
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
  // 한국 22일 01:00은 UTC로는 아직 21일이다.
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
  // 상세 페이지의 막대를 위해 점수의 각 부분을 최선에 대한 몫으로 나타낸다.
  type Part = { label: string; value: number }
  assert.deepEqual(
    coffee.scoreParts.map((part: Part) => part.label),
    ["업종 궁합", "관심사", "협찬 경험", "함께한 이력", "응답 준비"],
  )
  assert.ok(coffee.scoreParts.every((part: Part) => part.value >= 0 && part.value <= 1))
  assert.equal(coffee.scoreParts[3].value, 1)

  // 새 브랜드의 리스팅은 처음의 70에 머물지 않고 다른 리스팅처럼 점수가 매겨진다.
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
  // 데모를 써 보는 모두가 데모 계정을 쓰므로 그 주소는 아무도 가리키지 않는다.
  const toDemo = () => sent.filter((mail) => ["muse@syu.ac.kr", "hello@afternoon-coffee.kr"].includes(mail.to[0]))
  try {
    // 단체와 브랜드이며 각각 리스팅이 있다.
    const email = "notice@syu.ac.kr"
    const brandEmail = "notice@notice-cafe.kr"
    const { token: group, listingId: groupListing } = await listedMember(email, "notice-pass-123")
    const { token: brand, listingId: brandListing } = await listedMember(brandEmail, "notice-pass-123", "브랜드")
    sent.length = 0

    // 단체의 제안은 메일로 브랜드에 닿고, 브랜드의 답은 단체에게 돌아온다.
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

    // 브랜드의 캠페인에 대한 제안도 같은 방식으로 단체에 닿는다.
    sent.length = 0
    await call("POST", "/events", { name: "알림 캠페인", date: addDays(today, 12), types: ["제품"] }, brand)
    await call("POST", "/proposals", { matchId: groupListing }, brand)
    await settle()
    const offerMail = sent.find((mail) => mail.to[0] === email)
    assert.equal(offerMail?.subject, "[uniconnect] 새 협찬 제안이 왔어요")
    assert.match(offerMail?.text ?? "", /notice 카페에서/)
    assert.match(offerMail?.text ?? "", /https:\/\/uniconnect\.example\/offers/)

    const [offer] = (await call("GET", "/offers", undefined, group)).data.offers
    await call("POST", `/offers/${offer.id}/accept`, undefined, brand) // 브랜드는 답할 수 없다
    await call("POST", `/offers/${offer.id}/accept`, undefined, group)
    await settle()
    assert.ok(sent.some((mail) => mail.to[0] === brandEmail && mail.subject === "[uniconnect] 협찬이 확정됐어요"))

    // 메시지는 읽지 않은 묶음마다 메일 한 통이다.
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

    // 서로만 만나는 데모 계정 사이에는 메일이 가지 않는다.
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
  // 예전의 더 넓은 종류는 목록에서 사라졌다.
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

  // 수락된 제안의 계약서는 양쪽의 연락처를 양쪽에 보여 준다.
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
  // 같은 계정에 로그인한 다른 기기가 읽어 온다.
  const other = (await call("POST", "/auth/login", { role: "학생단체", email: "bell@syu.ac.kr", password: "bell-pass-123" }))
    .data.token as string
  assert.deepEqual((await call("GET", "/auth/me", undefined, other)).data.account.readNotices, read)
  // 앱이 아직 보이는 부분만 보내므로 저장할 때마다 목록을 바꾼다.
  await call("PUT", "/auth/notices", { read: ["match:m1"] }, other)
  assert.deepEqual((await call("GET", "/auth/me", undefined, token)).data.account.readNotices, ["match:m1"])
  await call("PUT", "/auth/notices", { read: [] }, token)
  assert.equal((await call("GET", "/auth/me", undefined, token)).data.account.readNotices, undefined)
  // 그 밖의 것은 거절하고, 방문자도 거절한다.
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
  // 연락처를 묻기 전의 데모 계정도 연락처를 얻는다.
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
  // 14세 미만은 가입할 수 없다.
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

  // 빼 두면 그대로이고, SVG와 다른 종류와 큰 것은 거절한다.
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

  // 기다리는 동안 삭제하면 제안은 브랜드의 받은편지함과 단체의 보낸 목록에서
  // 사라진다.
  assert.equal((await call("DELETE", `/events/${first.id}`, undefined, student)).status, 204)
  assert.equal(getDatabase().requests.some((item) => item.id === pending!.id), false)
  const sent = (await call("GET", "/proposals", undefined, student)).data
  assert.equal(sent.proposals.includes(brandId), false)
  assert.equal((await call("POST", `/requests/${pending!.id}/accept`, undefined, brand)).status, 404)

  // 브랜드가 수락하면 행사를 삭제할 수 없다.
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

  // 부분으로 만든 메시지는 그 안의 항목 이름을 번역한다.
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
  // 영어 안에 한국어가 남아 있으면 번역이 없거나, 의도하지 않은 메시지를 잡은
  // 패턴이 있다는 뜻이다.
  const missing = [...messages].filter((message) => /[가-힣]/.test(message) && /[가-힣]/.test(translate(message, "en")))
  assert.deepEqual(missing, [])
  // 부분으로 만든 메시지는 코드가 쓰는 형태마다 영어로 받는다.
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
  // 캠퍼스는 이메일 도메인(하위 도메인도)으로 찾고, 없으면 학교 이름으로 찾는다.
  assert.equal(campusOf({ email: "muse@syu.ac.kr" })?.name, "삼육대학교")
  assert.equal(campusOf({ email: "lab@cs.kw.ac.kr" })?.name, "광운대학교")
  assert.equal(campusOf({ email: "who@unknown.ac.kr", school: "서울여자대학교" })?.name, "서울여자대학교")
  assert.equal(campusOf({ email: "who@unknown.ac.kr", school: "어느대학교" }), undefined)
  assert.equal(distanceKm({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 }), 0)

  // The demo group (삼육대) sees each brand's store distance; online brands have none.
  type Placed = {
    id: string
    distanceKm?: number
    mapOffset?: { east: number; north: number }
    mapPoint?: { lat: number; lng: number }
  }
  const brands = (await call("GET", "/brands")).data.brands as Placed[]
  const coffee = brands.find((brand) => brand.id === "afternoon-coffee")!
  assert.ok(coffee.distanceKm! > 3 && coffee.distanceKm! < 4.5, String(coffee.distanceKm))
  assert.equal(brands.find((brand) => brand.id === "freshon")!.distanceKm, undefined)
  // 카탈로그 지도의 오프셋은 10m 단위로 거리와 맞는다.
  const { east, north } = coffee.mapOffset!
  assert.ok(east % 10 === 0 && north % 10 === 0)
  assert.ok(Math.abs(Math.hypot(east, north) / 1000 - coffee.distanceKm!) < 0.1)
  assert.equal(brands.find((brand) => brand.id === "freshon")!.mapOffset, undefined)
  // 그 위치는 있는 곳일 뿐이며 Kakao의 핀에 쓴다.
  assert.deepEqual(Object.keys(coffee.mapPoint!).sort(), ["lat", "lng"])
  assert.equal(brands.find((brand) => brand.id === "freshon")!.mapPoint, undefined)

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
    offers: ["음료 · 식품"],
    tags: listing.tags,
    facts: listing.facts,
    sns: listing.sns,
    portfolio: listing.portfolio,
    ...(address === undefined ? {} : { address }),
  })
  const search = geocoder.search
  // 이 컴퓨터의 환경에 있는 지오코더에 테스트가 닿으면 안 된다.
  const nominatim = config.nominatimUrl
  config.nominatimUrl = undefined
  try {
    // 빼 두면 주소와 위치가 남는다.
    assert.equal((await call("PUT", "/profile", form(), brand)).data.profile.location.lat, saved.location!.lat)
    // 지오코더가 없으면 새 주소는 위치 없이 보관되므로 거리가 없다.
    const unplaced = (await call("PUT", "/profile", form("서울 노원구 화랑로 815"), brand)).data.profile
    assert.deepEqual(unplaced.location, { address: "서울 노원구 화랑로 815" })
    const far = (await call("GET", "/groups", undefined, brand)).data.groups
    assert.ok(far.every((group: { distanceKm?: number }) => group.distanceKm === undefined))

    // 지오코더가 있으면 OpenStreetMap의 답이 위치를 잡으며(여기서는 서울과기대
    // 캠퍼스), 그 전에 저장한 주소는 다시 저장할 때 찾는다.
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
    // 위치가 잡힌 주소는 다시 찾지 않는다.
    await call("PUT", "/profile", form("서울 노원구 공릉로 232"), brand)
    assert.equal(asked.length, 2)
    // 찾지 못하는 주소나 실패하는 지오코더도 주소는 위치 없이 저장한다.
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
    // 키가 없으면 보여 줄 것이 없고 Kakao에도 묻지 않는다.
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
          // Kakao Map 페이지가 아니면 빼고, 위치가 없는 것도 뺀다.
          { id: "3", place_name: "어딘가", distance: "50", place_url: "https://example.com/3", x: "127.1", y: "37.6" },
          { id: "4", place_name: "위치 없음", distance: "60", place_url: "http://place.map.kakao.com/4" },
        ],
      }
    }
    // 단체는 캠퍼스 주변의 매장을 가까운 순으로 본다.
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
    // 캠퍼스는 화면에 그리는 지도를 위한 좌표와 함께 온다.
    assert.deepEqual(found.center, { lat: campus.lat, lng: campus.lng })
    assert.deepEqual(asked[0], { category: "CE7", lat: campus.lat, lng: campus.lng })
    // 같은 조회는 Kakao에 다시 묻는다. 아무것도 보관하지 않았다.
    await call("GET", "/places?category=CE7", undefined, muse)
    assert.equal(asked.length, 2)
    // 모든 종류를 함께 보면 종류마다 한 번씩 묻고, 장소마다 한 번씩 담고, 가까운 순이다.
    const all = (await call("GET", "/places?category=all", undefined, muse)).data
    assert.deepEqual(asked.slice(2).map((item) => item.category), ["CE7", "FD6", "CS2", "AC5", "CT1"])
    assert.deepEqual(
      all.places.map((place: { name: string }) => place.name),
      ["스마일하우스", "이디야커피 삼육대점"],
    )

    assert.equal((await call("GET", "/places?category=constructor")).status, 400)
    assert.equal((await call("GET", "/places")).status, 400)

    // 캠퍼스 표에 없는 학교는 보여 줄 매장이 없다.
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

    // Kakao가 실패하면 화면은 보여 줄 수 있는 메시지를 받는다.
    placeSearch.search = async () => {
      throw new Error("403 disabled")
    }
    const failed = await call("GET", "/places?category=FD6", undefined, muse)
    assert.equal(failed.status, 502)
    assert.match(failed.data.error, /주변 가게/)

    // 주소마다 1분에 Kakao에 30번 물을 수 있고, 모든 종류를 보면 다섯으로
    // 센다. 지금까지 8번이다(단일 조회 둘, 모든 종류 하나, 실패한 것). 방문자가
    // 예시를 보는 것은 아무것도 묻지 않는다.
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
    // 칩이 내놓는 모든 종류에 매장이 있다.
    for (const kind of placeCategories) assert.ok(exampleShops.some((shop) => shop.kind === kind), kind)
    // 지도 키가 있든 없든 같은 예시다.
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
        // 캠퍼스 가까이에 말하는 대로 놓여 있고, 주소는 거기서 읽으며 지도
        // 페이지나 전화번호는 없다.
        assert.ok(place.distanceM <= placeRadius, place.name)
        assert.ok(Math.abs(distanceKm(campus, place) * 1000 - place.distanceM) < 100, place.name)
        assert.ok(place.address.startsWith("삼육대학교 "), place.name)
        assert.equal(place.url, undefined)
        assert.equal(place.phone, undefined)
      }
    }
    // 칩이 고르는 대로 한 번에 한 종류다.
    const cafes = (await call("GET", "/places?category=CE7")).data.places
    assert.ok(cafes.length > 0)
    assert.ok(cafes.every((place: { kind: string }) => place.kind === "CE7"))
    assert.equal(asked, 0)
    // 로그인한 단체는 여전히 캠퍼스 주변의 진짜 매장을 본다.
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

    // 로그인한 학생단체만 Kakao 장소 ID로 매장을 초대할 수 있고, 공유 데모
    // 단체는 안 된다. 초대는 실제 매장에 닿는다.
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
    // 매장에 대해 보관하는 것은 Kakao가 허락하는 것, 곧 ID와 지도 페이지뿐이다.
    const stored = getDatabase().invites.find((invite) => invite.code === code)!
    assert.deepEqual(Object.keys(stored).sort(), ["accountId", "code", "createdAt", "placeId", "placeUrl"])
    assert.equal(stored.placeUrl, "https://place.map.kakao.com/26338954")
    // 같은 매장을 다시 요청하면 같은 초대가 돌아온다.
    const again = await call("POST", "/invites", { placeId: "26338954" }, group)
    assert.equal(again.status, 200)
    assert.equal(again.data.invite.code, code)

    // 링크를 가진 누구나 누가 초대했는지 보되, 그들이 누구인지는 보지 못한다.
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
    // 방문자는 만들어진 예시만 보고, 단체가 찾은 매장은 절대 보지 않는다.
    const examplesOnly = async () => (await shops()).every((place) => place.id.startsWith("example-") && !place.invited && !place.brandId)
    assert.ok(await examplesOnly())

    // 브랜드만 받을 수 있고, 공유 데모 브랜드는 안 된다.
    assert.equal((await call("POST", `/invites/${code}/accept`)).status, 401)
    assert.equal((await call("POST", `/invites/${code}/accept`, undefined, group)).status, 403)
    assert.equal((await call("POST", `/invites/${code}/accept`, undefined, brand)).status, 403)
    assert.equal((await call("POST", "/invites/nope/accept", undefined, await signUpMember("nobody@nope-cafe.kr", "nope-pass-123", "브랜드"))).status, 404)

    // 근처의 다른 단체가 같은 매장을 초대했다.
    const neighbour = await signUpMember("invite-one@syu.ac.kr", "invite-one-123")
    const neighbourCode = (await call("POST", "/invites", { placeId: "26338954" }, neighbour)).data.invite.code

    // 매장 주인이 브랜드로 가입해 받으면 새 브랜드가 그 매장으로 바로 목록에
    // 오른다.
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
    // 두 번 받아도 달라지는 것이 없다.
    assert.equal((await call("POST", `/invites/${code}/accept`, undefined, owner)).status, 200)
    // The groups that invited it hear about it, with the brand's page on 추천 매칭.
    for (const address of ["inviter@syu.ac.kr", "invite-one@syu.ac.kr"]) {
      const notice = sent.find((message) => message.to.includes(address) && message.subject.includes("초대"))!
      assert.match(notice.subject, /초대한 가게가 uniconnect에 가입했어요/)
      assert.match(notice.text, /owner 카페에서 초대를 받고/)
    }

    // 이제 가까운 순은 근처 회원에게 합류한 매장을 보여 주고, 방문자는 여전히
    // 예시만 본다.
    assert.equal((await shops(group))[0].brandId, listing.id)
    assert.ok(await examplesOnly())

    // 같은 매장에 대한 다른 단체의 초대가 그것을 두 번째 브랜드에 넘길 수는 없다.
    const otherGroup = await signUpMember("invite-two@syu.ac.kr", "invite-two-123")
    const second = (await call("POST", "/invites", { placeId: "26338954" }, otherGroup)).data.invite.code
    const rival = await signUpMember("rival@rival-cafe.kr", "rival-pass-123", "브랜드")
    const taken = await call("POST", `/invites/${second}/accept`, undefined, rival)
    assert.equal(taken.status, 409)
    assert.match(taken.data.error, /이미 다른 브랜드와 연결된 가게/)
    // 이미 한 매장인 브랜드가 다른 매장이 될 수도 없다.
    const elsewhere = (await call("POST", "/invites", { placeId: "777" }, otherGroup)).data.invite.code
    const twice = await call("POST", `/invites/${elsewhere}/accept`, undefined, owner)
    assert.equal(twice.status, 409)
    assert.match(twice.data.error, /이미 다른 가게와 연결된 브랜드/)

    // 데이터 다운로드는 양쪽의 초대를 담는다.
    const groupExport = (await call("GET", "/auth/export", undefined, otherGroup)).data
    assert.deepEqual(groupExport.invites.map((item: { placeId: string }) => item.placeId).sort(), ["26338954", "777"])
    const ownerExport = (await call("GET", "/auth/export", undefined, owner)).data
    assert.deepEqual(ownerExport.invites.map((item: { code: string }) => item.code), [code, neighbourCode])

    // 브랜드가 떠나면 매장이 다시 열리고, 단체가 떠나면 그 초대가 사라진다.
    assert.equal((await call("DELETE", "/auth/account", { password: "golmok-pass-123" }, owner)).status, 204)
    const reopened = getDatabase().invites.find((invite) => invite.code === code)!
    assert.equal(reopened.brandId, undefined)
    assert.equal(reopened.acceptedAt, undefined)
    assert.equal((await shops(group))[0].brandId, undefined)
    assert.equal((await call("DELETE", "/auth/account", { password: "invite-two-123" }, otherGroup)).status, 204)
    assert.equal(getDatabase().invites.some((invite) => invite.code === second || invite.code === elsewhere), false)

    // 단체는 최대 100개의 매장을 초대할 수 있다.
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

  // 어느 쪽도 행사 전날까지는 보이지 않는다.
  const early = (await call("GET", `/measurements/${request.eventId}`, undefined, group)).data.report
  assert.deepEqual([early.groupPin, early.staffPin, early.pinsFrom], [undefined, undefined, addDays(day, -1)])
  const hidden = (await call("GET", agreementPath, undefined, brand)).data.agreement.measure.venue
  assert.deepEqual([hidden.pin, hidden.pinsFrom], [undefined, addDays(day, -1)])
  const exported = (await call("GET", "/auth/export", undefined, group)).data
  assert.equal(/staffPin|groupPin/.test(JSON.stringify(exported)), false)
  const sponsoredEvent = getDatabase().events[groupId].find((item) => item.id === request.eventId)!
  sponsoredEvent.date = addDays(todayInKorea(), 1)
  // e-contract가 달리 정하기 전에는 QR, 그 쿠폰, 매장 방문이며, 매장 방문은
  // 브랜드가 직원 페이지에서 매장 PIN으로 확인한다. 단체가 손으로 기록할 것이
  // 없으므로 현장 페이지는 아직 없다.
  const before = (await call("GET", agreementPath, undefined, group)).data.agreement
  assert.deepEqual(before.measure.methods, defaults)
  assert.equal(before.measure.confirmedMethods, undefined)
  assert.equal(before.measure.venue, undefined)
  const code = before.measure.code
  const brandBefore = (await call("GET", agreementPath, undefined, brand)).data.agreement
  assert.equal(brandBefore.measure.venue.page, "staff")
  assert.match(brandBefore.measure.venue.pin, /^\d{4}$/)

  // 어느 쪽이든 정할 수 있다. 모르는 것, 되풀이한 것, 빈 것은 돌려보내고,
  // 매장 방문은 계속 브랜드의 것이며, 쿠폰은 QR이, 방문은 쿠폰이 필요하다.
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
  // 나열한 순서대로 두며, 항목처럼 바꾸면 확정을 거둔다.
  const measure = set.data.agreement.measure
  assert.deepEqual(measure.methods.map((method: { kind: string }) => method.kind), ["sampling", "booth", "sns", "survey"])
  assert.deepEqual(set.data.agreement.confirmed, {})
  // 현장 페이지는 양쪽이 확정할 때까지 기다리고, PIN은 처음부터 리포트
  // (성과의 현장 QR)에 있다.
  assert.equal(measure.venue, undefined)
  const groupPin = (await call("GET", `/measurements/${request.eventId}`, undefined, group)).data.report.groupPin
  assert.match(groupPin, /^\d{4}$/)
  // 브랜드는 자기 매장 PIN을 받고 단체의 PIN은 절대 받지 않는다.
  const forBrand = (await call("GET", agreementPath, undefined, brand)).data.agreement
  assert.equal(forBrand.measure.venue.page, "staff")
  const staffPin = forBrand.measure.venue.pin
  assert.equal(staffPin, getDatabase().measurements.find((item) => item.code === code)!.sponsors[0].staffPin)
  assert.equal(JSON.stringify(forBrand).includes("groupPin"), false)

  // 아직 양쪽이 확정하지 않았으므로 기본값이 계속 센다. 쿠폰은 내놓고, 새
  // 방법은 현장에서 셀 수 없다.
  assert.equal((await call("GET", `/check-in/${code}`)).data.coupons.length, 1)
  const groupShares = async () => (await call("POST", `/check-in/${code}/group/session`, { pin: groupPin })).data.shares
  assert.deepEqual((await groupShares())[0].kinds, ["qr"])

  // 양쪽이 확정하면 e-contract의 방법이 센다.
  await call("POST", `${agreementPath}/confirm`, undefined, group)
  const settled = (await call("POST", `${agreementPath}/confirm`, undefined, brand)).data.agreement
  assert.deepEqual(settled.measure.confirmedMethods, settled.measure.methods)
  assert.deepEqual(
    (await call("GET", agreementPath, undefined, group)).data.agreement.measure.venue,
    { page: "group", pin: groupPin, misses: 0, canRotate: true },
  )
  // 쿠폰이 없으면 참여자에게 아무것도 내놓지 않는다.
  assert.deepEqual((await call("GET", `/check-in/${code}`)).data.coupons, [])

  // 현장 페이지는 각자의 PIN으로 열려서 그쪽이 확정하는 것을 보여 주고, 양쪽이
  // 확정하는 방법은 양쪽에 보여 준다.
  assert.equal((await call("POST", `/check-in/${code}/group/session`, { pin: groupPin === "0000" ? "0001" : "0000" })).status, 403)
  const shares = await groupShares()
  assert.deepEqual(
    shares.map((share: { brandName: string; kinds: string[] }) => [share.brandName, share.kinds]),
    [["methods 카페", ["booth", "sns"]]],
  )
  const share = shares[0].id
  assert.deepEqual((await call("POST", `/check-in/${code}/staff/session`, { pin: staffPin })).data.shares[0].kinds, ["sampling", "booth", "survey"])

  // 행사 날 전에는 아무것도 세지 않는다.
  const count = (page: "group" | "staff", body: Record<string, unknown>) =>
    call("POST", `/check-in/${code}/${page}/count`, { pin: page === "group" ? groupPin : staffPin, share, ...body })
  assert.equal((await count("group", { method: "booth" })).status, 409)

  const event = getDatabase().events[groupId].find((item) => item.id === request.eventId)!
  const sponsorship = getDatabase().sponsorships[brandId].find((item) => item.id === `sp-${request.id}`)!
  event.date = todayInKorea()
  sponsorship.date = todayInKorea()
  try {
    // 그날에는 각자 자기 것을 세고, 도장은 둘 다 센다.
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
    // 이 협찬에서는 매장 방문을 확인하지 않는다.
    assert.equal((await call("POST", `/check-in/${code}/staff/visits`, { pin: staffPin, coupon: "UC-AAAAAA" })).status, 409)
    // 샘플은 한 상자씩, 도장은 한 번에 하나씩 세고, 실수는 되돌리되 0 밑으로는
    // 내려가지 않는다.
    assert.equal((await count("staff", { method: "sampling", amount: 501 })).status, 400)
    assert.equal((await count("staff", { method: "sampling", amount: 40 })).data.share.counts.samples, 40)
    assert.equal((await count("staff", { method: "sampling", amount: -5 })).data.share.counts.samples, 35)
    assert.equal((await count("group", { method: "booth", amount: 2 })).status, 400)
    assert.equal((await count("group", { method: "booth", amount: -1 })).data.share.counts.stamps, 1)
    assert.equal((await count("group", { method: "sns", amount: -1 })).data.share.counts.posts, 0)
    assert.equal((await count("group", { method: "sns", amount: -1 })).status, 409)

    // 양쪽이 e-contract에서 집계를 읽는다. 단체는 리포트에서 현장 PIN과 확정된
    // 방법만, 브랜드는 분석에서 읽는다.
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

    // 행사가 시작되면 방법은 그대로 둔다.
    assert.equal((await call("PUT", `${agreementPath}/methods`, { methods }, brand)).status, 409)
  } finally {
    event.date = day
    sponsorship.date = day
  }

  // 브랜드의 캠페인은 통째로 확정한다. 제안의 e-contract가 캠페인 자신의 방법을
  // 정하고, 단체의 페이지는 그것을 하나의 몫으로 연다.
  const { token: campaignGroup, listingId: campaignListing } = await listedMember("campaign-club@syu.ac.kr", "campaign-pass-123")
  await call("POST", "/events", { name: "측정 캠페인", date: addDays(todayInKorea(), 1), types: ["제품"] }, brand)
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
  // 쿠폰은 여전히 내놓고, 브랜드 자신의 리포트에는 단체 PIN이 없다.
  assert.equal((await call("GET", `/check-in/${confirmed.code}`)).data.coupons.length, 1)
  const campaignId = getDatabase().offers.find((item) => item.id === offer.id)!.campaignId!
  const brandReport = (await call("GET", `/measurements/${campaignId}`, undefined, brand)).data.report
  assert.deepEqual(brandReport.methods, campaignMethods)
  assert.equal(brandReport.groupPin, undefined)
  assert.match(brandReport.staffPin, /^\d{4}$/)
})

test("methods saved before they were split, and e-contracts already confirmed, keep counting", async () => {
  const { upgradeMethods } = await import("./lib/methods.js")
  // 그때는 쿠폰이 QR, 쿠폰, 매장 방문을 모두 뜻했다.
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

test("either side notes the parcels it sent on the agreement, and only it takes one off", async () => {
  const group = await signUpMember("parcel-club@syu.ac.kr", "parcel-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "parcel-club@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("parcel@parcel-cafe.kr", "parcel-pass-123", "브랜드")
  await call("POST", "/events", { name: "택배 공연", date: "2026-12-20", people: "100명", types: ["제품"] }, group)
  assert.equal((await call("POST", "/proposals", { matchId: listingId }, group)).status, 201)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const path = `/agreements/${request.id}/shipments`
  const added = await call("POST", path, { carrier: "CJ대한통운", number: "1234-5678-9012", note: "음료 3박스" }, brand)
  assert.equal(added.status, 201)
  const [shipment] = added.data.agreement.shipments
  assert.deepEqual([shipment.side, shipment.carrier, shipment.number, shipment.note], ["brand", "CJ대한통운", "123456789012", "음료 3박스"])
  // 단체가 읽으며, 택배사는 목록에서 고르고 번호를 검사한다.
  assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.shipments.length, 1)
  assert.equal((await call("POST", path, { carrier: "아무 택배", number: "123456" }, group)).status, 400)
  assert.equal((await call("POST", path, { carrier: "우체국택배", number: "12" }, group)).status, 400)
  // 적은 쪽만 뺄 수 있다.
  assert.equal((await call("DELETE", `${path}/${shipment.id}`, undefined, group)).status, 403)
  const removed = await call("DELETE", `${path}/${shipment.id}`, undefined, brand)
  assert.equal(removed.data.agreement.shipments, undefined)
  assert.equal((await call("POST", path, { carrier: "CJ대한통운", number: "123456789" })).status, 401)
})

test("each side can replace its venue PIN during the event, and the old one stops at once", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const group = await signUpMember("pin-club@syu.ac.kr", "pin-pass-1234")
  const groupId = getDatabase().accounts.find((account) => account.email === "pin-club@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("pin@pin-cafe.kr", "pin-pass-1234", "브랜드")
  await call("POST", "/events", { name: "PIN 공연", date: addDays(todayInKorea(), 9), people: "100명", types: ["제품"] }, group)
  await call("POST", "/proposals", { matchId: listingId }, group)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const path = `/agreements/${request.id}`
  const eventPath = `/measurements/${request.eventId}`
  await call("GET", path, undefined, brand)

  // PIN이 보이기 전에는 바꿀 수 없다.
  assert.equal((await call("POST", `${path}/pin`, undefined, brand)).status, 409)
  assert.equal((await call("POST", `${eventPath}/pin`, { page: "group" }, group)).status, 409)

  getDatabase().events[groupId].find((item) => item.id === request.eventId)!.date = todayInKorea()
  const venue = (await call("GET", path, undefined, brand)).data.agreement.measure
  assert.equal(venue.venue.canRotate, true)
  const old = venue.venue.pin as string
  const session = (pin: string) => call("POST", `/check-in/${venue.code}/staff/session`, { pin })
  assert.equal((await session(old)).status, 200)

  // 계약서의 두 쪽이 아니면 찾을 수 없고, 로그인이 필요하다.
  assert.equal((await call("POST", `${path}/pin`, undefined, await login("학생단체"))).status, 404)
  assert.equal((await call("POST", `${path}/pin`)).status, 401)
  assert.equal((await call("POST", `${eventPath}/pin`, { page: "group" })).status, 401)
  assert.equal((await call("POST", `${eventPath}/pin`, { page: "group" }, brand)).status, 404)

  // 브랜드는 자기 매장 PIN을 바꾸고, 예전 PIN은 바로 막힌다.
  const changed = await call("POST", `${path}/pin`, undefined, brand)
  assert.equal(changed.status, 200)
  const fresh = changed.data.agreement.measure.venue.pin as string
  assert.notEqual(fresh, old)
  assert.equal((await session(old)).status, 403)
  assert.equal((await session(fresh)).status, 200)
  // 틀린 시도는 PIN을 가진 쪽에게 보인다.
  assert.equal((await call("GET", path, undefined, brand)).data.agreement.measure.venue.misses, 1)

  // 혼자인 첫 협찬사는 행사의 PIN을 넘겨받았으므로 함께 바뀐다. 협찬이 취소돼도
  // 막은 PIN이 되살아나지 않는다.
  const measurement = getDatabase().measurements.find((item) => item.code === venue.code)!
  assert.equal(measurement.staffPin, fresh)

  // 열어 둔 목표 양식이 막은 PIN을 되돌리지 못한다.
  const goals = (await call("GET", eventPath, undefined, group)).data.report
  measurement.sponsors[0].staffPin = fresh
  const { applySponsorGoals } = await import("./lib/measurements.js")
  applySponsorGoals(measurement, measurement.goals, [{ id: measurement.sponsors[0].id, store: "가게", title: "쿠폰", staffPin: old }], true)
  assert.equal(measurement.sponsors[0].staffPin, fresh)
  assert.equal(goals.canRotatePin, true)

  // 단체는 자기 PIN을 바꾸지만 브랜드의 매장 PIN은 바꾸지 못한다.
  const before = (await call("GET", eventPath, undefined, group)).data.report
  const rotated = await call("POST", `${eventPath}/pin`, { page: "group" }, group)
  assert.equal(rotated.status, 200)
  assert.notEqual(rotated.data.report.groupPin, before.groupPin)
  assert.equal((await call("POST", `${eventPath}/pin`, { page: "staff" }, group)).status, 409)
  assert.equal((await call("POST", `${eventPath}/pin`, { page: "constructor" }, group)).status, 400)

  // 공용 데모 계정은 체험하는 모두가 쓰므로 바꿀 수 없다.
  assert.equal((await call("POST", "/agreements/req-runners/pin", undefined, await login("브랜드"))).status, 403)
})

test("a venue PIN several groups share on a campaign is changed only by the brand", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const { token: brand } = await listedMember("share-pin@share-cafe.kr", "share-pass-1234", "브랜드")
  const { token: first, listingId: firstListing } = await listedMember("share-one@syu.ac.kr", "share-pass-1234")
  const { token: second, listingId: secondListing } = await listedMember("share-two@syu.ac.kr", "share-pass-1234")
  await call("POST", "/events", { name: "공유 캠페인", date: addDays(todayInKorea(), 5), types: ["제품"] }, brand)
  await call("POST", "/proposals", { matchId: firstListing }, brand)
  await call("POST", "/proposals", { matchId: secondListing }, brand)
  const [offerOne] = (await call("GET", "/offers", undefined, first)).data.offers
  const [offerTwo] = (await call("GET", "/offers", undefined, second)).data.offers
  await call("POST", `/offers/${offerOne.id}/accept`, undefined, first)
  await call("POST", `/offers/${offerTwo.id}/accept`, undefined, second)
  const methods = [{ kind: "qr", side: "group" }, { kind: "experience", side: "group" }]
  for (const [id, group] of [[offerOne.id, first], [offerTwo.id, second]]) {
    await call("PUT", `/agreements/${id}/methods`, { methods }, group)
    await call("POST", `/agreements/${id}/confirm`, undefined, group)
    await call("POST", `/agreements/${id}/confirm`, undefined, brand)
  }
  const brandId = getDatabase().accounts.find((account) => account.email === "share-pin@share-cafe.kr")!.id
  getDatabase().events[brandId][0].date = todayInKorea()
  const shown = (await call("GET", `/agreements/${offerOne.id}`, undefined, first)).data.agreement.measure
  assert.equal(shown.venue.canRotate, false)
  assert.equal((await call("POST", `/agreements/${offerOne.id}/pin`, undefined, first)).status, 409)
  assert.equal((await call("POST", `/agreements/${offerOne.id}/pin`, { page: "group" }, first)).status, 409)
  const byBrand = await call("POST", `/agreements/${offerOne.id}/pin`, { page: "group" }, brand)
  assert.equal(byBrand.status, 200)
  const after = (await call("GET", `/agreements/${offerTwo.id}`, undefined, second)).data.agreement.measure
  assert.notEqual(after.venue.pin, shown.venue.pin)
})

test("a group's SNS posts count toward reach once the brand confirms them, with YouTube's views where it can read them", async () => {
  const { youtube, refreshViews } = await import("./lib/snsPosts.js")
  const { config } = await import("./config.js")
  const realViews = youtube.views
  const realKey = config.youtubeApiKey
  const group = await signUpMember("post-club@syu.ac.kr", "post-pass-1234")
  const groupId = getDatabase().accounts.find((account) => account.email === "post-club@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("post@post-cafe.kr", "post-pass-1234", "브랜드")
  const event = (await call("POST", "/events", { name: "게시물 공연", date: "2026-12-21", people: "100명", types: ["제품"] }, group)).data.event
  await call("POST", "/proposals", { matchId: listingId }, group)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const path = `/agreements/${request.id}/sns-posts`
  const reach = async () => (await call("GET", `/measurements/${event.id}`, undefined, group)).data.report
  const before = (await reach()).reach
  // 브랜드는 화면에서 본 내용을 함께 보낸다.
  const confirmPost = (postId: string) => {
    const shown = getDatabase().agreements.find((entry) => entry.id === request.id)!.snsPosts!.find((entry) => entry.id === postId)!
    return call("POST", `${path}/${postId}/confirm`, { url: shown.url, reach: shown.reach, photos: shown.photos }, brand)
  }
  try {
    // 키가 없으면 유튜브 링크도 다른 링크와 같다.
    config.youtubeApiKey = undefined
    const added = await call("POST", path, { url: "https://www.instagram.com/p/abc/", reach: 500 }, group)
    assert.equal(added.status, 201)
    const [post] = added.data.agreement.snsPosts
    assert.deepEqual([post.status, post.reach, post.youtube], ["pending", 500, undefined])
    // 기다리는 동안은 도달과 따로 보인다.
    assert.deepEqual([(await reach()).reach, (await reach()).pendingReach, (await reach()).postedReach], [before, 500, 0])
    // https, 올바른 숫자, 게시물당 하나만 받고 단체만 올리거나 고친다.
    assert.equal((await call("POST", path, { url: "http://example.com/a", reach: 1 }, group)).status, 400)
    assert.equal((await call("POST", path, { url: "javascript:alert(1)", reach: 1 }, group)).status, 400)
    assert.equal((await call("POST", path, { url: "https://example.com/a", reach: -1 }, group)).status, 400)
    assert.equal((await call("POST", path, { url: "https://user:secret@example.com/a", reach: 1 }, group)).status, 400)
    assert.equal((await call("POST", path, { url: post.url, reach: 1 }, group)).status, 409)
    // 추적 값이나 언어, www만 다른 주소도 같은 게시물이다.
    assert.equal((await call("POST", path, { url: "https://instagram.com/p/abc?igsh=xyz", reach: 1 }, group)).status, 409)
    assert.equal((await call("POST", path, { url: "https://www.instagram.com/some.user/p/abc/?hl=en", reach: 1 }, group)).status, 409)
    assert.equal((await call("POST", path, { url: "https://example.com/a", reach: 1 }, brand)).status, 403)
    assert.equal((await call("POST", path, { url: "https://example.com/a", reach: 1 }, await login("학생단체"))).status, 404)
    assert.equal((await call("PUT", `${path}/${post.id}`, { url: post.url, reach: 1 }, brand)).status, 403)
    // 브랜드만 확인하고, 다시 요청하려면 이유가 필요하다.
    assert.equal((await call("POST", `${path}/${post.id}/confirm`, undefined, group)).status, 403)
    assert.equal((await call("POST", `${path}/${post.id}/reject`, { reason: " " }, brand)).status, 400)
    const asked = await call("POST", `${path}/${post.id}/reject`, { reason: "도달 수가 보이지 않아요" }, brand)
    assert.deepEqual([asked.data.agreement.snsPosts[0].status, asked.data.agreement.snsPosts[0].reason], ["rejected", "도달 수가 보이지 않아요"])
    assert.equal((await reach()).pendingReach, 0)
    // 브랜드가 본 뒤에 바뀐 게시물은 확인할 수 없다.
    assert.equal((await call("POST", `${path}/${post.id}/confirm`, { url: post.url, reach: 1, photos: [] }, brand)).status, 409)
    assert.equal((await call("POST", `${path}/${post.id}/confirm`, undefined, brand)).status, 409)
    // 고치면 브랜드에게 돌아가고 브랜드가 확인한다.
    const fixed = await call("PUT", `${path}/${post.id}`, { url: post.url, reach: 600 }, group)
    assert.deepEqual([fixed.data.agreement.snsPosts[0].status, fixed.data.agreement.snsPosts[0].reason], ["pending", undefined])
    await confirmPost(post.id)
    assert.deepEqual([(await reach()).reach, (await reach()).postedReach], [before + 600, 600])

    // 캡처는 두 쪽만 보고 단체만 지운다.
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const photo = await call("POST", `${path}/${post.id}/photos`, { image: png }, group)
    assert.equal(photo.status, 201)
    const [shot] = photo.data.agreement.snsPosts[0].photos
    assert.equal((await fetch(`${baseUrl}/agreements/${request.id}/photos/${shot}`, { headers: { Authorization: `Bearer ${brand}` } })).status, 200)
    assert.equal((await fetch(`${baseUrl}/agreements/${request.id}/photos/${shot}`, { headers: { Authorization: `Bearer ${await login("학생단체")}` } })).status, 404)
    assert.equal((await call("DELETE", `${path}/${post.id}/photos/${shot}`, undefined, brand)).status, 403)
    assert.equal((await call("DELETE", `${path}/${post.id}/photos/${shot}`, undefined, group)).status, 200)
    // 확인된 게시물의 캡처가 바뀌면 다시 확인받는다.
    assert.equal(photo.data.agreement.snsPosts[0].status, "pending")
    assert.deepEqual([(await reach()).reach, (await reach()).postedReach], [before, 0])
    await confirmPost(post.id)

    // 키가 있으면 조회수가 적은 숫자를 대신하고, 읽을 수 없는 영상은 숫자를
    // 그대로 쓴다.
    config.youtubeApiKey = "test-key"
    let views = new Map([["dQw4w9WgXcQ", 1234]])
    youtube.views = async () => views
    const video = await call("POST", path, { url: "https://youtu.be/dQw4w9WgXcQ", reach: 10 }, group)
    const videoPost = video.data.agreement.snsPosts[1]
    assert.equal(videoPost.youtube.views, 1234)
    const shorts = await call("POST", path, { url: "https://www.youtube.com/shorts/aaaaaaaaaaa", reach: 20 }, group)
    assert.equal(shorts.data.agreement.snsPosts[2].youtube.views, undefined)
    await confirmPost(videoPost.id)
    await confirmPost(shorts.data.agreement.snsPosts[2].id)
    assert.equal((await reach()).postedReach, 600 + 1234 + 20)
    // 오늘 읽었으니 건너뛰고, 하루 뒤에는 다시 읽는다.
    assert.equal(await refreshViews(), 0)
    for (const item of getDatabase().agreements.find((entry) => entry.id === request.id)!.snsPosts!) {
      if (item.youtube) item.youtube.at = new Date(Date.now() - 86_400_000).toISOString()
    }
    views = new Map([["dQw4w9WgXcQ", 2000]])
    assert.equal(await refreshViews(), 2)
    assert.equal((await reach()).postedReach, 600 + 2000 + 20)
    // 다른 꼴의 주소도 같은 영상이다.
    assert.equal((await call("POST", path, { url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", reach: 1 }, group)).status, 409)
    assert.equal((await call("POST", path, { url: "https://www.youtube.com./watch?v=dQw4w9WgXcQ", reach: 1 }, group)).status, 409)
    // 영상을 내려도 마지막 조회수가 남고, 적은 숫자로 돌아가지 않는다.
    for (const item of getDatabase().agreements.find((entry) => entry.id === request.id)!.snsPosts!) {
      if (item.youtube) item.youtube.at = new Date(Date.now() - 86_400_000).toISOString()
    }
    views = new Map()
    await refreshViews()
    assert.equal((await reach()).postedReach, 600 + 2000 + 20)

    // 취소된 협찬의 게시물은 도달에서 빠진다.
    const stored = getDatabase().requests.find((item) => item.id === request.id)!
    await call("POST", `/agreements/${request.id}/cancel`, { reason: "행사가 취소됐어요" }, group)
    await call("POST", `/agreements/${request.id}/cancel/accept`, undefined, brand)
    assert.equal(stored.status, "취소됨")
    assert.deepEqual([(await reach()).postedReach, (await reach()).reach], [0, before])
    assert.equal((await call("POST", path, { url: "https://example.com/late", reach: 1 }, group)).status, 409)
  } finally {
    youtube.views = realViews
    config.youtubeApiKey = realKey
  }
  // 공용 데모 계정은 올릴 수 없다.
  assert.equal((await call("POST", "/agreements/req-runners/sns-posts", { url: "https://example.com/d", reach: 1 }, await login("브랜드"))).status, 403)
})

test("posts can't be changed without limit, which would spend the YouTube quota", async () => {
  const group = await signUpMember("post-limit@syu.ac.kr", "post-pass-1234")
  const groupId = getDatabase().accounts.find((account) => account.email === "post-limit@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("post-limit@limit-cafe.kr", "post-pass-1234", "브랜드")
  await call("POST", "/events", { name: "한도 공연", date: "2026-12-21", people: "100명", types: ["제품"] }, group)
  await call("POST", "/proposals", { matchId: listingId }, group)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const path = `/agreements/${request.id}/sns-posts`
  const added = await call("POST", path, { url: "https://example.com/one", reach: 1 }, group)
  const [post] = added.data.agreement.snsPosts
  for (let turn = 0; turn < 29; turn += 1) {
    assert.equal((await call("PUT", `${path}/${post.id}`, { url: post.url, reach: turn }, group)).status, 200)
  }
  assert.equal((await call("PUT", `${path}/${post.id}`, { url: post.url, reach: 99 }, group)).status, 429)
})

test("both sides of an accepted proposal keep an agreement, confirm it and prove what they did", async () => {
  const { existsSync } = await import("node:fs")
  const { uploadsFolder } = await import("./lib/agreements.js")
  const brand = await login("브랜드")

  // 계정이 없는 단체의 제안을 수락한 데모 브랜드의 것이다.
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
  // 양쪽만 보며, 수락된 제안만 본다.
  assert.equal((await call("GET", "/agreements/req-runners")).status, 401)
  assert.equal((await call("GET", "/agreements/req-runners", undefined, await login("학생단체"))).status, 404)
  assert.equal((await call("GET", "/agreements/req-movement", undefined, brand)).status, 404)
  assert.equal((await call("GET", "/agreements/constructor", undefined, brand)).status, 404)

  // 회원 둘이다. 단체가 제안하고 브랜드가 수락한다.
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
  // 행사는 단체의 것이며, 목표는 시작할 때까지 여기서 정한다. 브랜드는 PIN과
  // 쿠폰 없이 목표를 읽는다. 계정이 없는 단체는 여기에 행사가 없다.
  assert.deepEqual(forGroup.event, { id: request.eventId, owner: "group", started: false })
  assert.deepEqual(Object.keys(forGroup.goals).sort(), ["expectedAudience", "targets"])
  const forBrand = (await call("GET", `/agreements/${request.id}`, undefined, partner)).data.agreement
  assert.deepEqual([forBrand.event.owner, forBrand.goals.targets], ["group", forGroup.goals.targets])
  assert.equal(opened.event, undefined)

  // 각 쪽이 확정하면 상대편이 알게 된다.
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

  // 단체는 자기 항목을 링크와 함께 완료로 표시할 수 있고, 브랜드의 항목은 절대 안 된다.
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

  // 증빙 사진은 디스크에 보관하며 상대편이 볼 수 있다.
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

  // 항목을 바꾸면 양쪽에게 다시 묻고, 유지한 항목은 증빙을 유지한다.
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
  // 같은 항목을 다시 써도 달라지는 것이 없다.
  const reconfirmed = (await call("POST", `/agreements/${request.id}/confirm`, undefined, group)).data.agreement
  const same = edited.items.map(({ id, side, label }: { id: string; side: string; label: string }) => ({ id, side, label }))
  assert.ok((await call("PUT", `/agreements/${request.id}/items`, { items: same }, partner)).data.agreement.confirmed.group)
  assert.ok(reconfirmed.confirmed.group)

  // 목록은 진행 정도를 보여 주고 데이터 다운로드가 그것을 담는다.
  const summary = (await call("GET", "/agreements", undefined, group)).data.agreements[0]
  assert.deepEqual([summary.id, summary.partner, summary.done, summary.total, summary.proof], [request.id, "agreement 카페", 1, 7, 3])
  const exported = (await call("GET", "/auth/export", undefined, group)).data
  assert.deepEqual(exported.agreements.map((item: { id: string }) => item.id), [request.id])

  // 단체가 떠나면 계약서와 그 사진이 사라진다.
  assert.equal((await call("DELETE", "/auth/account", { password: "agreement-pass-123" }, group)).status, 204)
  assert.equal(getDatabase().agreements.some((item) => item.id === request.id), false)
  assert.ok(!existsSync(uploadsFolder(request.id)))
})

test("after the event each side reviews the other, and the reviews show on the listing", async () => {
  const { todayInKorea } = await import("./lib/dates.js")
  type Summary = { count: number; average: number; tags: { tag: string; count: number }[] }
  const about = async (id: string) =>
    (await call("GET", `/reviews?about=${id}`)).data as { summary: Summary; reviews: Record<string, unknown>[] }

  // 시드된 후기는 누구에게나 보이며, 이름 뒤에 쓴 사람은 없다.
  const seeded = await about("afternoon-coffee")
  assert.deepEqual([seeded.summary.count, seeded.summary.average], [2, 4.5])
  // 태그마다 고른 수를 많이 고른 것부터 세어, 페이지의 막대에 쓴다.
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

  // 회원 둘이다. 단체의 오늘 행사를 브랜드에 제안하고 수락한다.
  const group = await signUpMember("review-club@syu.ac.kr", "review-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "review-club@syu.ac.kr")!.id
  const { token: brand, listingId: brandListing } = await listedMember("review@review-cafe.kr", "review-pass-123", "브랜드")
  await call("POST", "/events", { name: "후기 공연", date: todayInKorea(), people: "100명", types: ["제품"] }, group)
  assert.equal((await call("POST", "/proposals", { matchId: brandListing }, group)).status, 201)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  const route = `/reviews/${request.id}`
  // 양쪽이 e-contract를 확정하기 전에는 안 된다.
  assert.equal((await call("PUT", route, { rating: 5 }, group)).status, 409)
  assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.review.canWrite, false)
  await call("POST", `/agreements/${request.id}/confirm`, undefined, group)
  await call("POST", `/agreements/${request.id}/confirm`, undefined, brand)

  assert.equal((await call("PUT", route, { rating: 5 })).status, 401)
  assert.equal((await call("PUT", "/reviews/req-movement", { rating: 5 }, group)).status, 404)
  // 행사 날 전에는 안 된다.
  const day = request.eventDate
  request.eventDate = "2099-01-01"
  assert.equal((await call("PUT", route, { rating: 5 }, group)).status, 409)
  assert.equal((await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.review.canWrite, false)
  request.eventDate = day
  for (const body of [
    { rating: 0 },
    { rating: 4.5 },
    { rating: 5, tags: ["약속을 잘 지켜요", "응답이 빨라요", "협찬 물품이 좋아요", "다시 함께하고 싶어요"] },
    // 브랜드가 아니라 단체를 후기로 쓰는 태그다.
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
  // 공유 데모 계정은 누가 볼 후기를 쓸 수 없다.
  assert.equal((await call("PUT", "/reviews/req-runners", { rating: 1 }, await login("브랜드"))).status, 403)

  // 각 쪽은 계약서에서 자기 후기와 상대편 후기를 본다(단체에는 아직 리스팅이
  // 없으므로 브랜드가 후기를 쓸 곳이 없다).
  const forGroup = (await call("GET", `/agreements/${request.id}`, undefined, group)).data.agreement.review
  assert.deepEqual([forGroup.open, forGroup.canWrite, forGroup.mine.rating, forGroup.theirs], [true, true, 5, undefined])
  const forBrand = (await call("GET", `/agreements/${request.id}`, undefined, brand)).data.agreement.review
  assert.deepEqual([forBrand.canWrite, forBrand.theirs.comment], [false, "커피가 맛있었어요."])

  // 다시 쓰면 후기 하나가 바뀐다.
  const rewritten = await call("PUT", route, { rating: 4, tags: [], comment: "" }, group)
  assert.equal(rewritten.status, 200)
  assert.ok(rewritten.data.review.updatedAt)
  const after = await about(brandListing)
  assert.deepEqual([after.summary.count, after.summary.average], [1, 4])
  assert.equal(after.reviews[0].authorName, "review-club 동아리")

  // 데이터 다운로드가 담고, 지우면 리스팅에서 빠진다.
  assert.equal((await call("GET", "/auth/export", undefined, group)).data.reviews.length, 1)
  assert.equal((await call("DELETE", route, undefined, group)).status, 204)
  assert.equal((await call("DELETE", route, undefined, group)).status, 404)
  assert.equal((await about(brandListing)).summary.count, 0)

  // 떠나면 쓴 후기도 함께 가져간다.
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
    await call("POST", `/agreements/${request.id}/confirm`, undefined, group)
    await call("POST", `/agreements/${request.id}/confirm`, undefined, brand)
    const reply = `/reviews/${request.id}/reply`
    // 단체의 후기 전에는 답할 것이 없다.
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
    // 후기를 쓴 쪽은 한 번 알림을 받는다.
    assert.equal(sent.length, 1)
    assert.match(sent[0].subject, /답글/)
    assert.equal((await call("PUT", reply, { text: "다음에도 함께해요." }, brand)).status, 200)
    await settle()
    assert.equal(sent.length, 1)
    // 누구에게나 후기 밑에 보이고, 단체가 후기를 다시 써도 남는다.
    await call("PUT", `/reviews/${request.id}`, { rating: 4, tags: [], comment: "고친 후기" }, group)
    const listed = (await call("GET", `/reviews?about=${brandListing}`)).data.reviews[0]
    assert.equal(listed.comment, "고친 후기")
    assert.equal(listed.reply.text, "다음에도 함께해요.")
    assert.ok(listed.reply.updatedAt)
    // 단체에게는 답할 자기 역할의 후기가 없고, 데모 계정은 답할 수 없다.
    assert.equal((await call("PUT", reply, { text: "저도요" }, group)).status, 404)

    // 세 번째 회원이 답글을 신고하면 운영자가 내린다.
    const third = await signUpMember("reply-reader@syu.ac.kr", "reply-pass-123")
    const reported = await call("POST", "/reports", { kind: "reply", reviewKey: listed.key, reason: "욕설 · 괴롭힘" }, third)
    assert.equal(reported.status, 201)
    const brandId = getDatabase().accounts.find((account) => account.email === "reply@reply-cafe.kr")!.id
    const report = getDatabase().reports.find((item) => item.target.kind === "reply")!
    assert.equal(report.accountId, brandId)
    assert.equal(report.excerpt, "다음에도 함께해요.")
    assert.equal(await admin(`/admin/reports/${report.id}/resolve`, { action: "hide-reply" }), 200)
    // 읽는 사람에게는 사라지고 후기는 남으며, 쓴 사람은 내려졌음을 본다.
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
  // 캘린더 자체는 로그인이 필요 없다. 링크가 곧 열쇠다.
  const feed = await fetch(url)
  assert.equal(feed.status, 200)
  assert.match(feed.headers.get("content-type") ?? "", /^text\/calendar/)
  const text = await feed.text()
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"))
  // 브랜드의 캘린더에는 협찬하는 날이 있고, RFC 5545가 요구하는 대로 이스케이프한다.
  assert.match(text, /SUMMARY:협찬 · feed 동아리 구독\\; 공연\\, 가을\r\n/)
  // Never in the account the app gets; the same link again from 내 정보.
  assert.equal((await call("GET", "/auth/me", undefined, brand)).data.account.calendarFeed, undefined)
  assert.equal((await call("GET", "/calendar/feed", undefined, brand)).data.url, url)
  // 새 링크는 옛 링크를 바로 멈춘다.
  const next = (await call("POST", "/calendar/feed", undefined, brand)).data.url as string
  assert.notEqual(next, url)
  assert.equal((await fetch(url)).status, 404)
  assert.equal((await fetch(next)).status, 200)
  // 단체 자신의 캘린더에는 행사가 이틀에 걸쳐 있다.
  const groupUrl = (await call("POST", "/calendar/feed", undefined, group)).data.url as string
  const groupText = await (await fetch(groupUrl)).text()
  assert.match(groupText, /SUMMARY:구독\\; 공연\\, 가을\r\n/)
  assert.ok(groupText.includes(`DTSTART;VALUE=DATE:${day.replace(/-/g, "")}\r\n`))
  assert.ok(groupText.includes(`DTEND;VALUE=DATE:${addDays(day, 2).replace(/-/g, "")}\r\n`))
  // 지우면 멈추고, 데모 계정과 방문자는 만들 수 없다.
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
    // 영어 페이지에서 가입하면 코드가 영어로 오고 계정의 메일도 그것을
    // 따른다.
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
    // 브랜드가 메시지 메일을 끄면 메시지는 메일을 보내지 않고, 제안은 여전히 간다.
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

    // 단체가 앱을 영어로 쓰면 브랜드의 답이 영어로 닿는다.
    sent.length = 0
    const request = (await call("GET", "/requests", undefined, brand)).data.requests[0]
    await call("POST", `/requests/${request.id}/accept`, undefined, brand)
    await settle()
    assert.equal(sent[0].subject, "[uniconnect] Your sponsorship is confirmed")
    assert.match(sent[0].text, /accepted the proposal for '메일 공연'\./)
    assert.match(sent[0].text, /Open: https:\/\/uniconnect\.example\/matches/)
    assert.match(sent[0].text, /Choose which emails you get: https:\/\/uniconnect\.example\/me/)
    // 한국어로 돌아오고 모든 종류를 다시 켠다.
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
    // 2030년의 한 월요일에서 보면, 브랜드 하나는 그 토요일에, 하나는 한 달 전에 합류했다.
    account("digest@digest-cafe.kr").createdAt = "2030-01-05T00:00:00.000Z"
    account("digest-old@digest-old.kr").createdAt = "2029-12-01T00:00:00.000Z"
    const monday = new Date("2030-01-07T01:00:00Z")
    // 가입 코드는 위에서 나갔다.
    sent.length = 0

    assert.ok((await sendDigests(database, monday)) >= 1)
    await settle()
    const [digest, ...more] = to("digest-club@syu.ac.kr")
    assert.equal(more.length, 0)
    assert.equal(digest.subject, "[uniconnect] 이번 주 새로 가입한 잘 맞는 브랜드 1곳")
    assert.match(digest.text, /^지난 일주일 동안 가입한 브랜드 가운데 잘 맞는 곳이에요\.\n· digest 카페 \(일치율 \d+%\)\n/)
    assert.doesNotMatch(digest.text, /digest-old/)
    // 타이머가 몇 번 돌아도 월요일에 한 번만 보내고, 다른 요일에는 보내지 않는다.
    sent.length = 0
    assert.equal(await sendDigests(database, new Date("2030-01-07T05:00:00Z")), 0)
    assert.equal(await sendDigests(database, new Date("2030-01-08T01:00:00Z")), 0)
    await settle()
    assert.equal(sent.length, 0)
    // 다음 월요일에는 브랜드가 더 이상 새롭지 않다. 요약을 끈 회원은 아무것도
    // 받지 않고, 데모 계정은 절대 받지 않는다.
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
  const { token: brand, listingId: brandListing } = await listedMember("page@page-cafe.kr", "page-pass-123", "브랜드")
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
  // 브랜드의 캠페인에는 행사 페이지가 없다.
  const campaign = (await call("POST", "/events", { ...body, budget: "1000" }, brand)).data.event
  assert.deepEqual([campaign.venue, campaign.intro, campaign.packages], [undefined, undefined, undefined])

  // 단체를 볼 수 있는 회원은 페이지를 읽는다. 방문자와 데모 계정(예시를 만난다)은
  // 읽지 못하지만 데모 단체의 페이지는 읽는다.
  const page = await call("GET", `/events/${event.id}/page`, undefined, brand)
  assert.equal(page.status, 200)
  assert.deepEqual([page.data.group.id, page.data.group.name, page.data.own], [groupListing, "page-club 동아리", false])
  assert.equal(page.data.event.remindedAt, undefined)
  assert.equal((await call("GET", `/events/${event.id}/page`, undefined, group)).data.own, true)
  assert.equal((await call("GET", `/events/${event.id}/page`)).status, 404)
  assert.equal((await call("GET", `/events/${event.id}/page`, undefined, await login("브랜드"))).status, 404)
  // 예산은 단체와, 이 행사에 대해 물은 브랜드를 위한 것이다.
  const budgeted = (await call("POST", "/events", { ...body, name: "예산 공연", budget: "500000" }, group)).data.event
  const budgetSeen = async (token?: string) => (await call("GET", `/events/${budgeted.id}/page`, undefined, token)).data.event.budget
  assert.equal(await budgetSeen(group), 500000)
  assert.equal(await budgetSeen(brand), undefined)
  assert.equal((await call("POST", "/proposals", { matchId: brandListing, eventId: budgeted.id }, group)).status, 201)
  assert.equal(await budgetSeen(brand), 500000)
  const demo = await call("GET", "/events/event-muse-concert/page")
  assert.equal(demo.data.event.venue, "삼육대학교 대강당")
  assert.equal(demo.data.event.packages.length, 2)

  // 사진은 최대 네 장이며 단체만 올릴 수 있고, 페이지를 보는 사람에게 내려간다.
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

  // 수정하면 페이지의 글은 바뀌고 사진은 남는다.
  const edited = await call("PUT", `/events/${event.id}`, { ...body, venue: "", intro: "", packages: [] }, group)
  assert.deepEqual([edited.data.event.venue, edited.data.event.intro, edited.data.event.packages], [undefined, undefined, undefined])
  assert.equal(edited.data.event.photos.length, 3)
  // 행사를 지우면 사진도 함께 사라지고, 떠나도 마찬가지다.
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
  // 단체의 글은 다가오는 자기 행사 하나에 대한 것이다.
  const groupFields = { ...brandPost, title: "협찬사를 찾아요", types: ["현금"] }
  assert.equal((await call("POST", "/board", groupFields, group)).status, 400)
  const groupMade = await call("POST", "/board", { ...groupFields, eventId: groupEvent.id }, group)
  assert.equal(groupMade.status, 201)
  const groupPost = groupMade.data.post as Post
  assert.equal(groupPost.event?.name, "게시판 공연")
  assert.equal((await call("POST", "/board", brandPost, await login("브랜드"))).status, 403)

  // 각자 자기가 보는 반대편의 글을 찾고, 자기 글은 내 글에 있다. 방문자와 데모
  // 계정은 예시를, 회원은 회원의 글을 읽는다.
  const groupBoard = (await call("GET", "/board", undefined, group)).data as { posts: Post[]; mine: Post[] }
  assert.ok(groupBoard.posts.some((item) => item.id === post.id))
  assert.equal(groupBoard.posts.some((item) => item.id === groupPost.id || item.id === "post-coffee-tasting"), false)
  assert.deepEqual(groupBoard.mine.map((item) => item.id), [groupPost.id])
  const visitor = (await call("GET", "/board?role=학생단체")).data as { posts: Post[] }
  assert.ok(visitor.posts.some((item) => item.id === "post-coffee-tasting"))
  assert.equal(visitor.posts.some((item) => item.id === post.id), false)

  // 단체는 자기 행사와 함께 지원하며, 브랜드의 받은편지함에 제안이 한 번 간다.
  const apply = { matchId: brandListing, eventId: groupEvent.id, message: "로비 부스 자리를 드릴게요.", postId: post.id }
  assert.equal((await call("POST", "/proposals", apply, group)).status, 201)
  const request = getDatabase().requests.find((item) => item.postId === post.id)!
  assert.equal(request.eventId, groupEvent.id)
  assert.equal((await call("POST", "/proposals", apply, group)).status, 409)
  // 브랜드 자신의 글은 브랜드의 글이 아니다.
  assert.equal((await call("POST", "/proposals", { ...apply, postId: groupPost.id }, group)).status, 409)
  const seen = (await call("GET", `/board/${post.id}`, undefined, brand)).data.post as Post
  assert.deepEqual(seen.applications?.map((item) => [item.name, item.about, item.status]), [["board-club 동아리", "게시판 공연", "검토 중"]])
  assert.equal(((await call("GET", `/board/${post.id}`, undefined, group)).data.post as Post).applied, "검토 중")
  // 브랜드는 자기 캠페인과 함께 단체의 글에 지원한다.
  assert.equal((await call("POST", "/proposals", { matchId: groupListing, eventId: campaign.id, postId: groupPost.id }, brand)).status, 201)
  assert.ok(getDatabase().offers.some((item) => item.postId === groupPost.id && item.campaignId === campaign.id))

  // 닫으면 게시판에서 빠지고 더 이상 지원을 받지 않으며, 올린 쪽은 여전히 고칠 수 있다.
  assert.equal((await call("POST", `/board/${post.id}/close`, undefined, brand)).data.post.open, false)
  assert.equal(((await call("GET", "/board", undefined, group)).data.posts as Post[]).some((item) => item.id === post.id), false)
  assert.equal((await call("GET", `/board/${post.id}`, undefined, group)).status, 404)
  assert.equal((await call("PUT", `/board/${post.id}`, brandPost, group)).status, 404)
  assert.equal((await call("PUT", `/board/${post.id}`, { ...brandPost, title: "고친 제목" }, brand)).data.post.title, "고친 제목")
  assert.equal((await call("DELETE", `/board/${post.id}`, undefined, brand)).status, 204)
  // 단체의 행사를 지우면 그 글이 닫히고, 떠나면 글이 사라진다.
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
  // 이 두 회원과 데모 계정만 살핀다. 다른 테스트가 회원의 행사를 오늘부터 센
  // 날짜에 두는데 어떤 날은 이 테스트의 주에 들어온다(30일 뒤 행사가 10월
  // 26일에 그랬다).
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
    // 한국의 11월 25일 정오다. 데모 단체의 11월 27일 콘서트도 가깝지만 데모
    // 계정에는 메일을 보내지 않는다.
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
    // 각각 한 번씩이다. 다음 시간에는 아무것도 보내지 않고, 이틀 뒤에는 그사이
    // 가까워진 행사만 보낸다.
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
  // 데모 계정과 시드의 데이터는 합계에만 센다.
  assert.ok(before.proposals.total > before.proposals.real)
  assert.ok(before.scans.total > before.scans.real)
  for (const figure of Object.values(before)) {
    assert.ok(figure.real >= 0 && figure.real <= figure.total)
  }

  // 새 회원은 실제로 세고, 이번 주의 새 회원으로 센다.
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

  // 다른 계정은 코드를 쓸 수 없고, 틀린 코드는 거절한다.
  const stranger = await signUpMember("handover-other@syu.ac.kr", "handover-pass-123")
  assert.equal((await call("POST", "/auth/email", { email: "handover-new@syu.ac.kr", code: sent.data.devCode }, stranger)).status, 400)
  assert.equal((await call("POST", "/auth/email", { email: "handover-new@syu.ac.kr", code: "000000" }, token)).status, 400)
  const moved = await call("POST", "/auth/email", { email: "handover-new@syu.ac.kr", code: sent.data.devCode }, token)
  assert.equal(moved.status, 200)
  assert.equal(moved.data.account.email, "handover-new@syu.ac.kr")

  // 이 기기는 로그인이 유지되고 다른 기기는 로그아웃되며, 새 이메일로 로그인된다.
  assert.equal((await call("GET", "/auth/me", undefined, token)).status, 200)
  assert.equal((await call("GET", "/auth/me", undefined, other)).status, 401)
  const login = (email: string) => call("POST", "/auth/login", { role: "학생단체", email, password: "handover-pass-123" })
  assert.equal((await login("handover-new@syu.ac.kr")).status, 200)
  assert.equal((await login("handover-old@syu.ac.kr")).status, 401)

  // 데모 계정은 그대로 둔다.
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

  // 측정한 행사는 참여자의 패스와 기록 없이 온다.
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
  // 한 시간 안에는 새 복사를 만들지 않는다.
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
  // 모두 있지만 HSTS는 Vercel이 직접 더하므로 제외한다.
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

test("a reminder or digest whose mail failed goes again on the next run, and one failing job leaves the others running", async () => {
  const { sendReminders } = await import("./lib/reminders.js")
  const { sendDigests } = await import("./lib/digest.js")
  const { mailTransport } = await import("./lib/mailer.js")
  const database = getDatabase()
  await signUpMember("retry-club@syu.ac.kr", "retry-pass-123")
  await listedMember("retry@retry-cafe.kr", "retry-pass-123", "브랜드")
  const group = database.accounts.find((account) => account.email === "retry-club@syu.ac.kr")!
  const kept = { events: database.events, sponsorships: database.sponsorships, createdAt: database.accounts.map((account) => account.createdAt) }
  const post = mailTransport.post
  const mail = { apiKey: config.resendApiKey, from: config.mailFrom }
  const dataFile = config.dataFile
  config.resendApiKey = "test-resend-key"
  config.mailFrom = "uniconnect <no-reply@example.com>"
  let up = false
  let tries = 0
  mailTransport.post = async () => {
    tries += 1
    return new Response(null, { status: up ? 200 : 500 })
  }
  try {
    database.events = { [group.id]: [{ id: "retry-show", name: "다시 보내는 공연", date: "2031-03-05", people: "10명", types: ["제품"], status: "매칭 중", createdAt: "2031-01-01T00:00:00.000Z" }] }
    database.sponsorships = {}
    const now = new Date("2031-03-04T03:00:00Z")
    const show = () => database.events[group.id][0]
    assert.equal(await sendReminders(database, now), 0)
    assert.equal(tries, 1)
    assert.equal(show().remindedAt, undefined)
    up = true
    assert.equal(await sendReminders(database, now), 1)
    assert.ok(show().remindedAt)
    assert.equal(await sendReminders(database, now), 0)
    assert.equal(tries, 2)

    // 2031년 3월 3일은 월요일이다. 새로 합류한 브랜드를 알리지 못하면 표시하지 않는다.
    for (const account of database.accounts) account.createdAt = "2020-01-01T00:00:00.000Z"
    database.accounts.find((account) => account.email === "retry@retry-cafe.kr")!.createdAt = "2031-03-01T00:00:00.000Z"
    const monday = new Date("2031-03-03T01:00:00Z")
    up = false
    assert.equal(await sendDigests(database, monday), 0)
    assert.equal(group.digestOn, undefined)
    up = true
    assert.ok((await sendDigests(database, monday)) >= 1)
    assert.equal(group.digestOn, "2031-03-03")

    // 저장이 실패해 알림 작업이 던져도 뒤의 작업은 돌고 실패를 알린다.
    config.cronSecret = "test-cron-secret"
    config.dataFile = process.env.FRONTEND_DIST!
    const ran = await fetch(`${baseUrl}/cron/reminders`, { headers: { Authorization: "Bearer test-cron-secret" } })
    config.dataFile = dataFile
    assert.equal(ran.status, 500)
    const answer = (await ran.json()) as { failed: string[]; views: unknown }
    assert.deepEqual(answer.failed, ["reminders"])
    assert.equal(answer.views, 0)
  } finally {
    config.dataFile = dataFile
    config.cronSecret = undefined
    mailTransport.post = post
    config.resendApiKey = mail.apiKey
    config.mailFrom = mail.from
    database.events = kept.events
    database.sponsorships = kept.sponsorships
    database.accounts.forEach((account, index) => {
      account.createdAt = kept.createdAt[index]
    })
  }
})

test("a report's days count every record, past the 300 the log keeps", async () => {
  const { recordMetric, dailyCounts, eventOf } = await import("./lib/measurements.js")
  const { timing } = await import("./lib/premiumReport.js")
  const { todayInKorea } = await import("./lib/dates.js")
  const database = getDatabase()
  const measurement = structuredClone(database.measurements[0])
  const event = { ...eventOf(database, measurement)!, date: todayInKorea(), endDate: undefined }
  const today = todayInKorea()
  // 집계가 없는 옛 측정은 로그에서 시작하고 잊지 않는다.
  delete measurement.daily
  measurement.log = [{ id: "old", kind: "scans", at: new Date().toISOString(), participant: "참여자 #1", detail: "현장 QR 스캔" }]
  for (let count = 0; count < 400; count += 1) recordMetric(measurement, "scans")
  assert.equal(measurement.log.length, 300)
  assert.equal(dailyCounts(measurement)[today].scans, 401)
  assert.equal(timing(measurement, event).daily.find((day: { date: string }) => day.date === today)!.scans, 401)
})

test("a query that the database never answers is cut off", async () => {
  const { neonConfig } = await import("@neondatabase/serverless")
  const { neonSql } = await import("./lib/sql.js")
  const fetchFunction = neonConfig.fetchFunction
  neonConfig.fetchFunction = (_url: string, init: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason))
    })
  try {
    const startedAt = Date.now()
    await assert.rejects(neonSql("postgresql://user:password@db.example.com/neondb", 30)("select 1"))
    assert.ok(Date.now() - startedAt < 2000)
  } finally {
    neonConfig.fetchFunction = fetchFunction
  }
})

// 오늘 가까운 행사를 알림이 간 것으로 표시하므로 마지막에 둔다.
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

test("a brand confirms an e-contract by paying the 15% fee, by card or by transfer, and a refund takes it back", async () => {
  const { feeStart } = await import("./lib/fees.js")
  const { toss } = await import("./lib/billing.js")
  const saved = { since: feeStart.since, client: config.tossClientKey, secret: config.tossSecretKey, admin: config.adminToken }
  const realToss = { confirm: toss.confirm, cancel: toss.cancel }
  feeStart.since = "2000-01-01"
  config.adminToken = "test-admin-token"
  const admin = (route: string, body?: unknown) =>
    fetch(`${baseUrl}/admin${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (response) => ({ status: response.status, data: (await response.json()) as { payments: { id: string }[] } }))
  try {
    const group = await signUpMember("fee-club@syu.ac.kr", "fee-pass-123")
    const groupId = getDatabase().accounts.find((account) => account.email === "fee-club@syu.ac.kr")!.id
    const { token: brand, listingId } = await listedMember("fee@fee-cafe.kr", "fee-pass-123", "브랜드")
    await call("POST", "/events", { name: "수수료 공연", date: "2026-12-20", people: "150명", types: ["현금"] }, group)
    assert.equal((await call("POST", "/proposals", { matchId: listingId }, group)).status, 201)
    const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
    await call("POST", `/requests/${request.id}/accept`, undefined, brand)

    // 가치가 먼저이고, 단체는 아무것도 내지 않고 확정한다.
    assert.equal((await call("POST", `/agreements/${request.id}/confirm`, undefined, brand)).status, 409)
    assert.equal((await call("PUT", `/agreements/${request.id}/value`, { value: { cash: 0, inKind: 0 } }, group)).status, 400)
    const valued = (await call("PUT", `/agreements/${request.id}/value`, { value: { cash: 200000, inKind: 133333 } }, group)).data.agreement
    assert.deepEqual([valued.fee.amount, valued.fee.due, valued.fee.rate], [50000, 50000, 0.15])
    assert.equal((await call("POST", `/agreements/${request.id}/confirm`, undefined, brand)).status, 402)
    assert.ok((await call("POST", `/agreements/${request.id}/confirm`, undefined, group)).data.agreement.confirmed.group)

    // 브랜드만 내야 할 수수료로 주문한다.
    assert.equal((await call("POST", "/billing/orders", { kind: "fee", targetId: request.id }, group)).status, 403)
    assert.equal((await call("POST", "/billing/orders", { kind: "fee", targetId: request.id }, await login("브랜드"))).status, 403)
    assert.equal((await call("POST", "/billing/orders", { kind: "nope", targetId: request.id }, brand)).status, 404)
    const { order } = (await call("POST", "/billing/orders", { kind: "fee", targetId: request.id }, brand)).data
    assert.deepEqual([order.amount, order.supply, order.status, order.orderName], [55000, 50000, "pending", "수수료 공연 협찬 수수료"])
    assert.equal(order.paymentKey, undefined)
    // 기다리는 동안은 같은 주문이 돌아온다.
    assert.equal((await call("POST", "/billing/orders", { kind: "fee", targetId: request.id }, brand)).data.order.id, order.id)

    // 카드는 Toss 키가 없으면 꺼져 있고, 그다음에는 금액이 주문의 것이어야 한다.
    const confirm = (amount: number) => call("POST", "/billing/confirm", { orderId: order.id, paymentKey: "pk-test", amount }, brand)
    assert.equal((await confirm(50000)).status, 409)
    config.tossClientKey = "live_ck_example"
    config.tossSecretKey = "live_sk_example"
    toss.confirm = async (_key, orderId, amount) => ({ status: "DONE", totalAmount: amount, orderId, receipt: { url: "https://receipt.example/1" }, approvedAt: "2026-10-29T12:00:00+09:00" })
    assert.equal((await confirm(1000)).status, 400)
    const paid = (await confirm(55000)).data.order
    assert.deepEqual([paid.status, paid.method, paid.receiptUrl], ["paid", "card", "https://receipt.example/1"])
    const after = (await call("GET", `/agreements/${request.id}`, undefined, brand)).data.agreement
    assert.ok(after.confirmed.group && after.confirmed.brand)
    assert.deepEqual([after.fee.paid, after.fee.due], [50000, 0])
    const listed = (await call("GET", "/billing", undefined, brand)).data
    assert.deepEqual([listed.card.clientKey, listed.payments.length, listed.prices.report], ["live_ck_example", 1, 50000])
    assert.equal((await call("GET", "/billing", undefined, group)).data.payments.length, 0)

    // 가치가 오르면 차액이 남고, 여기서 계좌 이체로 낸다.
    const raised = (await call("PUT", `/agreements/${request.id}/value`, { value: { cash: 300000, inKind: 100000 } }, brand)).data.agreement
    assert.deepEqual([raised.fee.amount, raised.fee.due, raised.confirmed], [60000, 10000, {}])
    const top = (await call("POST", "/billing/orders", { kind: "fee", targetId: request.id }, brand)).data.order
    assert.equal(top.amount, 11000)
    assert.ok((await call("POST", `/billing/orders/${top.id}/transfer`, undefined, brand)).data.order.transferRequestedAt)
    assert.equal((await admin("/payments")).data.payments[0].id, top.id)
    assert.equal((await admin(`/payments/${top.id}/paid`, {})).status, 200)
    assert.equal((await admin(`/payments/${top.id}/paid`, {})).status, 409)
    assert.ok((await call("GET", `/agreements/${request.id}`, undefined, brand)).data.agreement.confirmed.brand)

    // 카드 결제를 환불하면 브랜드의 확정을 거둔다.
    const refunded: string[] = []
    toss.cancel = async (key) => {
      refunded.push(key)
    }
    assert.equal((await admin(`/payments/${order.id}/cancel`, { reason: "테스트 환불" })).status, 200)
    assert.deepEqual(refunded, ["pk-test"])
    const back = (await call("GET", `/agreements/${request.id}`, undefined, brand)).data.agreement
    assert.deepEqual([back.confirmed.brand, back.fee.due], [undefined, 50000])
  // 계정의 내보내기는 결제를 담되 Toss의 키는 담지 않는다.
    const exported = (await call("GET", "/auth/export", undefined, brand)).data
    assert.equal(exported.payments.length, 2)
    assert.ok(exported.payments.every((payment: { paymentKey?: string }) => payment.paymentKey === undefined))
  } finally {
    feeStart.since = saved.since
    config.tossClientKey = saved.client
    config.tossSecretKey = saved.secret
    config.adminToken = saved.admin
    toss.confirm = realToss.confirm
    toss.cancel = realToss.cancel
  }
})

test("a card approval whose save fails is kept by its key and recorded later, never charged twice", async () => {
  const { toss } = await import("./lib/billing.js")
  const { cardRecovery, reconcileCards } = await import("./lib/cardRecovery.js")
  const { HttpError } = await import("./lib/errors.js")
  const saved = { client: config.tossClientKey, secret: config.tossSecretKey, settle: cardRecovery.settleAfterMs }
  const realToss = { confirm: toss.confirm, lookup: toss.lookup }
  const dataFile = config.dataFile
  config.tossClientKey = "live_ck_example"
  config.tossSecretKey = "live_sk_example"
  // Toss가 청구한 내역(결제 키별)과 요청받은 횟수.
  const charged = new Map<string, { orderId: string; totalAmount: number }>()
  let confirms = 0
  toss.confirm = async (paymentKey, orderId, amount) => {
    confirms += 1
    // Toss는 Idempotency-Key대로 주문의 첫 승인을 다시 답한다.
    const earlier = [...charged.values()].find((item) => item.orderId === orderId)
    if (!earlier) charged.set(paymentKey, { orderId, totalAmount: amount })
    return { status: "DONE", orderId, totalAmount: earlier?.totalAmount ?? amount, approvedAt: "2026-11-04T12:00:00+09:00" }
  }
  toss.lookup = async (paymentKey) => {
    const found = charged.get(paymentKey)
    return found ? { status: "DONE", ...found } : undefined
  }
  const stored = (id: string) => getDatabase().payments!.find((payment) => payment.id === id)!
  try {
    const { token: brand } = await listedMember("card-save@card-cafe.kr", "card-pass-123", "브랜드")
    const order = async () => (await call("POST", "/billing/orders", { kind: "pro" }, brand)).data.order
    const confirm = (id: string, paymentKey: string, amount: number) =>
      call("POST", "/billing/confirm", { orderId: id, paymentKey, amount }, brand)

    // Toss가 카드를 청구한 뒤 저장이 모두 실패한다. 주문은 Toss에 묻기 전에
    // 저장한 키를 가진 채 기다린다.
    const first = await order()
    const approve = toss.confirm
    toss.confirm = async (...args) => {
      const answer = await approve(...args)
      config.dataFile = process.env.FRONTEND_DIST!
      return answer
    }
    const failed = await confirm(first.id, "pk-lost", first.amount)
    config.dataFile = dataFile
    toss.confirm = approve
    assert.equal(failed.status, 503)
    assert.match(failed.data.error, /승인됐지만/)
    assert.deepEqual([stored(first.id).status, stored(first.id).paymentKey], ["pending", "pk-lost"])
    assert.ok(stored(first.id).confirmingAt)

    // 같은 승인을 다시 시도하면 두 번 청구 없이 기록된다.
    const again = await confirm(first.id, "pk-lost", first.amount)
    assert.equal(again.status, 200)
    assert.deepEqual([again.data.order.status, again.data.order.method, again.data.order.paymentKey], ["paid", "card", undefined])
    assert.equal(stored(first.id).confirmingAt, undefined)
    assert.equal(charged.size, 1)

    // 같은 식으로 유실된 다른 주문. 새 창에서 다시 결제하면 Toss에서 첫
    // 청구를 찾아 그것을 기록한다.
    cardRecovery.settleAfterMs = 60 * 60 * 1000
    const second = await order()
    assert.notEqual(second.id, first.id)
    toss.confirm = async (...args) => {
      const answer = await approve(...args)
      config.dataFile = process.env.FRONTEND_DIST!
      return answer
    }
    assert.equal((await confirm(second.id, "pk-second", second.amount)).status, 503)
    config.dataFile = dataFile
    toss.confirm = approve
    // 결제창을 다시 열어도 주문과 금액은 그대로다.
    assert.equal((await order()).id, second.id)
    assert.equal(stored(second.id).status, "pending")
    const repaid = await confirm(second.id, "pk-new-window", second.amount)
    assert.deepEqual([repaid.status, repaid.data.order.status], [200, "paid"])
    assert.equal(stored(second.id).paymentKey, "pk-second")
    assert.equal(confirms, 3)
    assert.equal((await call("DELETE", `/billing/orders/${second.id}`, undefined, brand)).status, 409)

    // 브랜드가 취소하려는 멈춘 주문은 Toss에 먼저 확인한다. 청구된 주문은
    // 취소되지 않고 기록된다.
    const fourth = await order()
    toss.confirm = async (...args) => {
      const answer = await approve(...args)
      config.dataFile = process.env.FRONTEND_DIST!
      return answer
    }
    assert.equal((await confirm(fourth.id, "pk-fourth", fourth.amount)).status, 503)
    config.dataFile = dataFile
    toss.confirm = approve
    assert.equal((await call("DELETE", `/billing/orders/${fourth.id}`, undefined, brand)).status, 409)
    assert.equal(stored(fourth.id).status, "paid")

    // Toss가 승인을 거절하면 청구되지 않고 키가 지워진다.
    const third = await order()
    toss.confirm = async () => {
      throw new HttpError(402, "결제를 승인하지 못했어요. 다시 시도해 주세요.")
    }
    assert.equal((await confirm(third.id, "pk-refused", third.amount)).status, 402)
    assert.deepEqual([stored(third.id).paymentKey, stored(third.id).confirmingAt], [undefined, undefined])
    // Toss가 답하지 않으면 키를 남긴다. Toss에 그런 결제가 없으면 정리할 때
    // 키를 지우고 주문을 취소할 수 있다.
    toss.confirm = async () => {
      throw new Error("timeout")
    }
    assert.equal((await confirm(third.id, "pk-timeout", third.amount)).status, 502)
    assert.equal(stored(third.id).paymentKey, "pk-timeout")
    // 아직 멈춘 것이 아니면 계정의 결제 내역은 건드리지 않는다.
    await call("GET", "/billing", undefined, brand)
    assert.equal(stored(third.id).paymentKey, "pk-timeout")
    cardRecovery.settleAfterMs = 0
    const accountId = getDatabase().accounts.find((account) => account.email === "card-save@card-cafe.kr")!.id
    assert.deepEqual(await reconcileCards(accountId), { paid: 0, unpaid: 1, open: 0, failed: 0 })
    assert.equal(stored(third.id).paymentKey, undefined)
    assert.equal((await call("DELETE", `/billing/orders/${third.id}`, undefined, brand)).status, 200)

    // 유실된 저장 하나 더. 브랜드가 결제 내역을 열 때 정리된다.
    const fifth = await order()
    toss.confirm = async (...args) => {
      const answer = await approve(...args)
      config.dataFile = process.env.FRONTEND_DIST!
      return answer
    }
    assert.equal((await confirm(fifth.id, "pk-fifth", fifth.amount)).status, 503)
    config.dataFile = dataFile
    toss.confirm = approve
    const listed = (await call("GET", "/billing", undefined, brand)).data.payments as { id: string; status: string }[]
    assert.equal(listed.find((payment) => payment.id === fifth.id)!.status, "paid")
    assert.equal(confirms, 5)
  } finally {
    config.dataFile = dataFile
    config.tossClientKey = saved.client
    config.tossSecretKey = saved.secret
    cardRecovery.settleAfterMs = saved.settle
    toss.confirm = realToss.confirm
    toss.lookup = realToss.lookup
  }
})

test("a card refund whose save fails is kept by its mark and recorded later, never asked for twice", async () => {
  const { toss } = await import("./lib/billing.js")
  const { cardRecovery, reconcileRefunds } = await import("./lib/cardRecovery.js")
  const { HttpError } = await import("./lib/errors.js")
  const saved = { client: config.tossClientKey, secret: config.tossSecretKey, settle: cardRecovery.settleAfterMs, admin: config.adminToken }
  const realToss = { confirm: toss.confirm, lookup: toss.lookup, cancel: toss.cancel }
  const dataFile = config.dataFile
  config.tossClientKey = "live_ck_example"
  config.tossSecretKey = "live_sk_example"
  config.adminToken = "test-admin-token"
  // Toss가 가진 결제(결제 키별)와 받은 환불 요청의 멱등키.
  const atToss = new Map<string, { status: string; orderId: string; totalAmount: number }>()
  const asked: string[] = []
  toss.confirm = async (paymentKey, orderId, amount) => {
    atToss.set(paymentKey, { status: "DONE", orderId, totalAmount: amount })
    return { status: "DONE", orderId, totalAmount: amount, approvedAt: "2026-11-05T12:00:00+09:00" }
  }
  toss.lookup = async (paymentKey) => atToss.get(paymentKey)
  const refund = async (paymentKey: string, _reason: string, idempotencyKey: string) => {
    asked.push(idempotencyKey)
    atToss.get(paymentKey)!.status = "CANCELED"
  }
  toss.cancel = refund
  const admin = async (route: string, body: unknown = {}) => {
    const response = await fetch(`${baseUrl}/admin${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
      body: JSON.stringify(body),
    })
    return { status: response.status, data: (await response.json()) as { payment: { status: string; method?: string } } }
  }
  const stored = (id: string) => getDatabase().payments!.find((payment) => payment.id === id)!
  try {
    const { token: brand } = await listedMember("card-refund@card-cafe.kr", "card-pass-123", "브랜드")
    const order = async () => (await call("POST", "/billing/orders", { kind: "pro" }, brand)).data.order
    let keys = 0
    const paidOrder = async () => {
      const made = await order()
      const paymentKey = `pk-refund-${(keys += 1)}`
      assert.equal((await call("POST", "/billing/confirm", { orderId: made.id, paymentKey, amount: made.amount }, brand)).status, 200)
      return { id: made.id as string, paymentKey }
    }
    const cancel = (id: string) => admin(`/payments/${id}/cancel`, { reason: "테스트 환불" })

    // 요청 전 저장이 실패하면 Toss에 묻지 않는다.
    const unsent = await paidOrder()
    config.dataFile = process.env.FRONTEND_DIST!
    assert.equal((await cancel(unsent.id)).status, 503)
    config.dataFile = dataFile
    assert.equal(asked.length, 0)
    assert.equal(stored(unsent.id).refundingAt, undefined)

    // Toss가 환불한 뒤 저장이 모두 실패한다. 표시를 남긴 채 503이고, 다시 눌러도
    // 두 번 요청하지 않고 Toss의 답으로 기록한다.
    toss.cancel = async (...args) => {
      await refund(...args)
      config.dataFile = process.env.FRONTEND_DIST!
    }
    assert.equal((await cancel(unsent.id)).status, 503)
    config.dataFile = dataFile
    toss.cancel = refund
    assert.equal(asked.length, 1)
    assert.equal(stored(unsent.id).status, "paid")
    assert.equal(stored(unsent.id).refundReason, "테스트 환불")
    assert.equal((await cancel(unsent.id)).data.payment.status, "cancelled")
    assert.equal(asked.length, 1)
    assert.deepEqual([stored(unsent.id).cancelReason, stored(unsent.id).refundingAt, stored(unsent.id).refundReason], ["테스트 환불", undefined, undefined])
    // 표시는 계정에 보이지 않는다.
    const listedView = (await call("GET", "/billing", undefined, brand)).data.payments as Record<string, unknown>[]
    assert.ok(listedView.every((payment) => !("refundingAt" in payment) && !("refundReason" in payment)))

    // 같은 유실을 정리 작업이 기록한다.
    const lost = await paidOrder()
    toss.cancel = async (...args) => {
      await refund(...args)
      config.dataFile = process.env.FRONTEND_DIST!
    }
    assert.equal((await cancel(lost.id)).status, 503)
    config.dataFile = dataFile
    toss.cancel = refund
    cardRecovery.settleAfterMs = 0
    assert.deepEqual(await reconcileRefunds(), { refunded: 1, paid: 0, open: 0, failed: 0 })
    assert.equal(stored(lost.id).status, "cancelled")
    assert.equal(asked.length, 2)
    cardRecovery.settleAfterMs = saved.settle

    // Toss가 답하지 않으면 표시를 남긴다. 멈춘 것으로 볼 때까지는 다시 요청하지
    // 않고, 그 뒤 환불되지 않았음을 확인하면 새 멱등키로 요청한다.
    const silent = await paidOrder()
    toss.cancel = async () => {
      throw new Error("timeout")
    }
    assert.equal((await cancel(silent.id)).status, 502)
    assert.ok(stored(silent.id).refundingAt)
    toss.cancel = refund
    assert.equal((await cancel(silent.id)).status, 409)
    assert.equal(asked.length, 2)
    cardRecovery.settleAfterMs = 0
    await new Promise((resolve) => setTimeout(resolve, 2))
    assert.equal((await cancel(silent.id)).data.payment.status, "cancelled")
    cardRecovery.settleAfterMs = saved.settle
    assert.equal(asked.length, 3)
    assert.equal(new Set(asked).size, 3)

    // 멈춘 환불이 Toss에서 그대로면 정리 작업이 표시를 지운다.
    const untouched = await paidOrder()
    toss.cancel = async () => {
      throw new Error("timeout")
    }
    assert.equal((await cancel(untouched.id)).status, 502)
    toss.cancel = refund
    cardRecovery.settleAfterMs = 0
    assert.deepEqual(await reconcileRefunds(), { refunded: 0, paid: 1, open: 0, failed: 0 })
    cardRecovery.settleAfterMs = saved.settle
    assert.deepEqual([stored(untouched.id).status, stored(untouched.id).refundingAt], ["paid", undefined])

    // Toss가 거절하면 환불되지 않은 것이므로 표시를 지우고 바로 다시 할 수 있다.
    toss.cancel = async () => {
      throw new HttpError(409, "환불하지 못했어요. 다시 시도해 주세요.")
    }
    assert.equal((await cancel(untouched.id)).status, 409)
    assert.equal(stored(untouched.id).refundingAt, undefined)
    toss.cancel = refund
    assert.equal((await cancel(untouched.id)).data.payment.status, "cancelled")

    // 카드 승인을 보낸 대기 주문: 청구됐으면 입금 확인도 취소도 결제로 기록한다.
    const waitingWithKey = async (paymentKey: string) => {
      const made = await order()
      toss.confirm = async () => {
        throw new Error("timeout")
      }
      assert.equal((await call("POST", "/billing/confirm", { orderId: made.id, paymentKey, amount: made.amount }, brand)).status, 502)
      return made as { id: string; amount: number }
    }
    const chargedTransfer = await waitingWithKey("pk-charged-1")
    atToss.set("pk-charged-1", { status: "DONE", orderId: chargedTransfer.id, totalAmount: chargedTransfer.amount })
    assert.equal((await admin(`/payments/${chargedTransfer.id}/paid`)).status, 409)
    assert.deepEqual([stored(chargedTransfer.id).status, stored(chargedTransfer.id).method], ["paid", "card"])
    const chargedCancel = await waitingWithKey("pk-charged-2")
    atToss.set("pk-charged-2", { status: "DONE", orderId: chargedCancel.id, totalAmount: chargedCancel.amount })
    assert.equal((await cancel(chargedCancel.id)).status, 409)
    assert.deepEqual([stored(chargedCancel.id).status, stored(chargedCancel.id).method], ["paid", "card"])

    // 아직 처리 중이면 그대로 둔다.
    const inProgress = await waitingWithKey("pk-progress")
    atToss.set("pk-progress", { status: "IN_PROGRESS", orderId: inProgress.id, totalAmount: inProgress.amount })
    assert.equal((await admin(`/payments/${inProgress.id}/paid`)).status, 409)
    assert.equal((await cancel(inProgress.id)).status, 409)
    assert.equal(stored(inProgress.id).status, "pending")

    // Toss가 답하지 못해도 그대로 두고 502로 답한다.
    toss.lookup = async () => {
      throw new Error("timeout")
    }
    assert.equal((await admin(`/payments/${inProgress.id}/paid`)).status, 502)
    assert.equal(stored(inProgress.id).status, "pending")
    toss.lookup = async (paymentKey) => atToss.get(paymentKey)

    // 청구되지 않았으면 키를 지우고 평소처럼 처리하며 환불은 요청하지 않는다.
    atToss.delete("pk-progress")
    const before = asked.length
    assert.equal((await cancel(inProgress.id)).data.payment.status, "cancelled")
    assert.equal(stored(inProgress.id).paymentKey, undefined)
    const notCharged = await waitingWithKey("pk-free")
    const transferred = await admin(`/payments/${notCharged.id}/paid`)
    assert.deepEqual([transferred.status, transferred.data.payment.method], [200, "transfer"])
    assert.equal(stored(notCharged.id).paymentKey, undefined)
    assert.equal(asked.length, before)

    // 실제 요청 형태: 멱등키를 보내고, 이미 환불됐다는 답은 성공이며, 거절은 409,
    // Toss 실패와 처리 중은 502다.
    toss.cancel = realToss.cancel
    const realFetch = globalThis.fetch
    const answer = (status: number, body: unknown) => async (_url: unknown, init?: RequestInit) => {
      assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "refund_key")
      return new Response(JSON.stringify(body), { status })
    }
    const statusOf = async (status: number, body: unknown) => {
      globalThis.fetch = answer(status, body) as typeof fetch
      try {
        await toss.cancel("pk", "사유", "refund_key")
        return 200
      } catch (error) {
        return (error as InstanceType<typeof HttpError>).status
      } finally {
        globalThis.fetch = realFetch
      }
    }
    assert.equal(await statusOf(200, {}), 200)
    assert.equal(await statusOf(400, { code: "ALREADY_CANCELED_PAYMENT", message: "이미 취소된 결제입니다." }), 200)
    assert.equal(await statusOf(403, { code: "NOT_CANCELABLE_PAYMENT", message: "취소할 수 없는 결제입니다." }), 409)
    assert.equal(await statusOf(500, { code: "COMMON_ERROR", message: "오류" }), 502)
    assert.equal(await statusOf(409, { code: "IDEMPOTENT_REQUEST_PROCESSING", message: "처리중" }), 502)
  } finally {
    config.dataFile = dataFile
    config.tossClientKey = saved.client
    config.tossSecretKey = saved.secret
    config.adminToken = saved.admin
    cardRecovery.settleAfterMs = saved.settle
    toss.confirm = realToss.confirm
    toss.lookup = realToss.lookup
    toss.cancel = realToss.cancel
  }
})

test("a brand buys a sponsorship's detailed report, adds its store's counts and shares it read-only", async () => {
  const demo = await login("브랜드")
  // 데모 브랜드의 샘플은 방문자에게 열려 있고, 데모 브랜드로 로그인하면
  // 사는 모습을 보이도록 잠겨 있다.
  const sample = (await call("GET", "/insights/sp-busking")).data
  assert.equal(sample.locked, false)
  assert.equal((await call("GET", "/insights/sp-busking", undefined, demo)).data.locked, true)
  const listed = (await call("GET", "/analytics")).data.sponsorships
  assert.equal(listed.find((item: { id: string }) => item.id === "sp-busking").report, "open")
  assert.equal((await call("GET", "/analytics", undefined, demo)).data.sponsorships.find((item: { id: string }) => item.id === "sp-busking").report, "locked")
  assert.equal(sample.report.sponsorship.eventName, "가을 버스킹 데이")
  assert.ok(["S", "A", "B", "C", "D"].includes(sample.report.grade))
  assert.deepEqual(sample.report.scorecard.map((item: { key: string }) => item.key), ["reach", "scans", "coupons", "visits", "qrRate", "visitRate", "roas"])
  assert.equal(sample.report.time.daily[0].date, "2026-10-12")
  // 샘플은 온전한 것이다. 매장의 집계, 관객, 돌아온 쿠폰 이용자, e-contract의
  // 할 일이 있다.
  assert.equal(sample.report.effect.lift, 23.7)
  assert.equal(sample.report.audience.responses, 86)
  assert.ok(sample.report.time.lag.sample > 0)
  assert.equal(sample.report.fulfillment.items.length, 6)
  assert.equal((await call("PUT", "/insights/sp-busking/lift", { before: 30, during: 40 }, demo)).status, 403)

  // 회원이 측정한 행사를 협찬하면 사기 전에는 미리보기다.
  const group = await signUpMember("insight-club@syu.ac.kr", "insight-pass-123")
  const groupId = getDatabase().accounts.find((account) => account.email === "insight-club@syu.ac.kr")!.id
  const { token: brand, listingId } = await listedMember("insight@insight-cafe.kr", "insight-pass-123", "브랜드")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await call("POST", "/events", { name: "리포트 공연", date: today, people: "120명", types: ["현금"] }, group)
  await call("POST", "/proposals", { matchId: listingId }, group)
  const request = getDatabase().requests.find((item) => item.fromAccountId === groupId)!
  await call("POST", `/requests/${request.id}/accept`, undefined, brand)
  await call("GET", `/agreements/${request.id}`, undefined, brand)
  const id = `sp-${request.id}`
  const locked = (await call("GET", `/insights/${id}`, undefined, brand)).data
  assert.deepEqual([locked.locked, locked.price, locked.open], [true, 50000, true])
  assert.equal((await call("GET", `/insights/${id}`, undefined, group)).status, 404)
  assert.equal((await call("PUT", `/insights/${id}/lift`, { before: 30, during: 45 }, brand)).status, 402)
  assert.equal((await call("POST", `/insights/${id}/share`, undefined, brand)).status, 402)

  // 이체로 사면 열린다.
  const { order } = (await call("POST", "/billing/orders", { kind: "report", targetId: id }, brand)).data
  assert.deepEqual([order.amount, order.orderName], [55000, "리포트 공연 상세 성과 리포트"])
  const { markPaid, paymentsOf } = await import("./lib/billing.js")
  markPaid(getDatabase(), paymentsOf(getDatabase()).find((item) => item.id === order.id)!, { method: "transfer" })
  const opened = (await call("GET", `/insights/${id}`, undefined, brand)).data
  assert.equal(opened.locked, false)
  assert.equal(opened.report.effect, null)
  assert.equal((await call("POST", "/billing/orders", { kind: "report", targetId: "sp-nope" }, brand)).status, 404)

  // 매장의 집계는 평소 날과 비교한 효과를 준다.
  assert.equal((await call("PUT", `/insights/${id}/lift`, { before: 0, during: 45 }, brand)).status, 400)
  const effect = (await call("PUT", `/insights/${id}/lift`, { before: 30, during: 45 }, brand)).data.report.effect
  assert.deepEqual([effect.lift, effect.days, effect.extraVisitors], [50, 9, 135])

  // 끄기 전까지는 읽기 전용 링크다.
  const { shareToken } = (await call("POST", `/insights/${id}/share`, undefined, brand)).data
  assert.equal((await call("GET", `/insights/shared/${shareToken}`)).data.report.sponsorship.id, id)
  // 정지된 브랜드의 링크는 정지된 동안 멈춘다.
  const sharer = getDatabase().accounts.find((item) => (getDatabase().sponsorships[item.id] ?? []).some((entry) => entry.id === id))!
  sharer.suspendedAt = new Date().toISOString()
  assert.equal((await call("GET", `/insights/shared/${shareToken}`)).status, 404)
  delete sharer.suspendedAt
  assert.equal((await call("DELETE", `/insights/${id}/share`, undefined, brand)).status, 204)
  assert.equal((await call("GET", `/insights/shared/${shareToken}`)).status, 404)
})

test("a free brand sends five proposals a month; Pro lifts the limit for 30 days at a time and marks its listing", async () => {
  const { token: brand, listingId } = await listedMember("pro@pro-cafe.kr", "pro-pass-123", "브랜드")
  // 제안할 단체 여섯이며 각각 다가오는 행사가 있다.
  const groups: string[] = []
  for (let index = 0; index < 6; index += 1) {
    groups.push((await listedMember(`pro-club-${index}@syu.ac.kr`, "pro-pass-123")).listingId)
  }
  await call("POST", "/events", { name: "프로 캠페인", date: "2026-12-24", people: "50명", types: ["제품"] }, brand)
  for (const group of groups.slice(0, 5)) assert.equal((await call("POST", "/proposals", { matchId: group }, brand)).status, 201)
  const blocked = await call("POST", "/proposals", { matchId: groups[5] }, brand)
  assert.equal(blocked.status, 402)
  assert.match(blocked.data.error, /5건까지/)
  const plan = (await call("GET", "/billing", undefined, brand)).data.plan
  assert.deepEqual([plan.pro, plan.offersThisMonth, plan.freeOffers], [false, 5, 5])

  // 유료 Pro는 30일이고, 그 뒤에 30일이 더 붙는다.
  const { order } = (await call("POST", "/billing/orders", { kind: "pro", targetId: "" }, brand)).data
  assert.deepEqual([order.amount, order.orderName], [330000, "캠퍼스 파트너스 30일"])
  const { markPaid, paymentsOf } = await import("./lib/billing.js")
  markPaid(getDatabase(), paymentsOf(getDatabase()).find((item) => item.id === order.id)!, { method: "transfer" })
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  const after = (days: number) => {
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }
  assert.equal((await call("GET", "/billing", undefined, brand)).data.plan.until, after(29))
  assert.equal((await call("POST", "/proposals", { matchId: groups[5] }, brand)).status, 201)
  const club = await signUpMember("pro-viewer@syu.ac.kr", "pro-pass-123")
  assert.equal((await call("POST", "/billing/partner-requests", { request: "파트너스가 아닌 계정의 요청이에요." }, club)).status, 403)
  const renewal = (await call("POST", "/billing/orders", { kind: "pro", targetId: "" }, brand)).data.order
  assert.equal(renewal.orderName, "캠퍼스 파트너스 30일 연장")
  markPaid(getDatabase(), paymentsOf(getDatabase()).find((item) => item.id === renewal.id)!, { method: "transfer" })
  assert.equal((await call("GET", "/billing", undefined, brand)).data.plan.until, after(59))

  // 한 달에 두 번 운영자에게 파트너 찾기를 요청한다.
  const ask = (request: string) => call("POST", "/billing/partner-requests", { request }, brand)
  assert.equal((await ask("짧음")).status, 400)
  assert.equal((await ask("12월 공릉동 대학 축제 중 관객 300명 이상인 행사를 찾아 주세요.")).status, 201)
  assert.equal((await ask("1월 개강 행사 중 카페와 맞는 곳을 찾아 주세요.")).status, 201)
  assert.equal((await ask("하나 더 부탁드려요. 2월 졸업식 행사요.")).status, 409)
  // 포트폴리오가 열리고, 무료 브랜드의 것은 잠겨 있다.
  assert.equal((await call("GET", "/analytics/portfolio", undefined, brand)).data.locked, false)
  assert.equal((await call("GET", "/analytics/portfolio", undefined, club)).data.locked, true)

  // 리스팅이 단체에 PARTNERS로 보인다.
  const seen = (await call("GET", "/brands", undefined, club)).data
  const listing = (seen.brands ?? seen).find((item: { id: string }) => item.id === listingId)
  assert.equal(listing.pro, true)
})

test("either side buys a top ad: first on the other side's list for 30 days, 10% off when extended before it ends", async () => {
  const { token: brand, listingId: brandListing } = await listedMember("ad@ad-cafe.kr", "ad-pass-123", "브랜드")
  const { token: group, listingId: groupListing } = await listedMember("ad-club@syu.ac.kr", "ad-pass-123")
  const viewer = await listedMember("ad-viewer@syu.ac.kr", "ad-pass-123")
  const viewingBrand = await listedMember("ad-viewer@viewer-cafe.kr", "ad-pass-123", "브랜드")
  // 리스팅이 없으면 광고할 것이 없다.
  const bare = await signUpMember("ad-bare@syu.ac.kr", "ad-pass-123")
  assert.equal((await call("POST", "/billing/orders", { kind: "ad", targetId: "" }, bare)).status, 409)
  // 단체는 광고에만 돈을 낸다.
  assert.equal((await call("POST", "/billing/orders", { kind: "pro", targetId: "" }, group)).status, 403)

  const { markPaid, paymentsOf } = await import("./lib/billing.js")
  const pay = async (token: string) => {
    const { order } = (await call("POST", "/billing/orders", { kind: "ad", targetId: "" }, token)).data
    markPaid(getDatabase(), paymentsOf(getDatabase()).find((item) => item.id === order.id)!, { method: "transfer" })
    return order as { amount: number; orderName: string }
  }
  const first = await pay(brand)
  assert.deepEqual([first.amount, first.orderName], [108900, "상단 광고 30일"])
  assert.deepEqual([(await pay(group)).amount], [11000])

  // 각각 반대편 목록에서 맨 앞에 오고 AD로 표시된다.
  const brands = (await call("GET", "/brands", undefined, viewer.token)).data.brands as { id: string; ad?: true }[]
  assert.deepEqual([brands[0].id, brands[0].ad], [brandListing, true])
  const groups = (await call("GET", "/groups", undefined, viewingBrand.token)).data.groups as { id: string; ad?: true }[]
  assert.deepEqual([groups[0].id, groups[0].ad], [groupListing, true])

  // 진행 중에 연장하면 10% 할인되고 그 뒤로 30일이 더 붙는다.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  const after = (days: number) => {
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }
  const shown = (await call("GET", "/billing", undefined, brand)).data.ad
  assert.deepEqual([shown.until, shown.price, shown.next, shown.renewing], [after(29), 99000, 89100, true])
  const renewal = await pay(brand)
  assert.deepEqual([renewal.amount, renewal.orderName], [98010, "상단 광고 30일 연장 (10% 할인)"])
  assert.equal((await call("GET", "/billing", undefined, brand)).data.ad.until, after(59))
  assert.equal((await call("GET", "/billing", undefined, group)).data.ad.next, 9000)
})

test("with Toss test keys the demo brand shows the whole payment flow; with none or live keys it can't pay", async () => {
  const saved = { client: config.tossClientKey, secret: config.tossSecretKey }
  const demo = await login("브랜드")
  try {
    const off = (await call("GET", "/billing", undefined, demo)).data
    assert.deepEqual([off.testMode, off.canPay], [false, false])
    assert.equal((await call("POST", "/billing/orders", { kind: "pro", targetId: "" }, demo)).status, 403)

    config.tossClientKey = "test_ck_example"
    config.tossSecretKey = "test_sk_example"
    const on = (await call("GET", "/billing", undefined, demo)).data
    assert.deepEqual([on.testMode, on.canPay], [true, true])
    const { order } = (await call("POST", "/billing/orders", { kind: "pro", targetId: "" }, demo)).data
    assert.equal(order.amount, 330000)
    await call("DELETE", `/billing/orders/${order.id}`, undefined, demo)

    // 라이브 키에서는 공유 데모 계정이 실제로 결제하는 일이 절대 없다.
    config.tossClientKey = "live_ck_example"
    config.tossSecretKey = "live_sk_example"
    assert.equal((await call("POST", "/billing/orders", { kind: "pro", targetId: "" }, demo)).status, 403)
  } finally {
    config.tossClientKey = saved.client
    config.tossSecretKey = saved.secret
  }
})

test("with Toss test keys a real member can't finish a card payment for free, and still pays by transfer", async () => {
  const { toss } = await import("./lib/billing.js")
  const saved = { client: config.tossClientKey, secret: config.tossSecretKey }
  const realConfirm = toss.confirm
  let confirms = 0
  toss.confirm = async (_key, orderId, amount) => {
    confirms += 1
    return { status: "DONE", totalAmount: amount, orderId }
  }
  try {
    const { token: brand } = await listedMember("test-keys@test-cafe.kr", "card-pass-123", "브랜드")
    const demo = await login("브랜드")
    config.tossClientKey = "test_ck_example"
    config.tossSecretKey = "test_sk_example"

    // 실제 회원에게는 카드가 없고 테스트 안내도 없다. 이체에는 진짜 돈이 오간다.
    const member = (await call("GET", "/billing", undefined, brand)).data
    assert.deepEqual([member.card, member.testMode, member.canPay], [null, false, true])
    const { order } = (await call("POST", "/billing/orders", { kind: "pro" }, brand)).data
    const paying = { orderId: order.id, paymentKey: "pk-free", amount: order.amount }
    assert.equal((await call("POST", "/billing/confirm", paying, brand)).status, 409)
    assert.equal(confirms, 0)
    const stored = getDatabase().payments!.find((payment) => payment.id === order.id)!
    assert.deepEqual([stored.status, stored.paymentKey], ["pending", undefined])
    assert.ok((await call("POST", `/billing/orders/${order.id}/transfer`, undefined, brand)).data.order.transferRequestedAt)

    // 데모 계정은 시연을 끝까지 한다.
    const shown = (await call("GET", "/billing", undefined, demo)).data
    assert.deepEqual([shown.card.clientKey, shown.testMode, shown.canPay], ["test_ck_example", true, true])
    const demoOrder = (await call("POST", "/billing/orders", { kind: "pro" }, demo)).data.order
    const demoPaid = await call("POST", "/billing/confirm", { orderId: demoOrder.id, paymentKey: "pk-demo", amount: demoOrder.amount }, demo)
    assert.equal(demoPaid.data.order.status, "paid")
    assert.equal(confirms, 1)
    const demoRow = getDatabase().payments!.find((payment) => payment.id === demoOrder.id)!
    getDatabase().payments!.splice(getDatabase().payments!.indexOf(demoRow), 1)

    // 라이브 키에서는 실제 회원이 카드로 낸다.
    config.tossClientKey = "live_ck_example"
    config.tossSecretKey = "live_sk_example"
    const live = (await call("GET", "/billing", undefined, brand)).data
    assert.deepEqual([live.card.clientKey, live.testMode], ["live_ck_example", false])
    assert.equal((await call("POST", "/billing/confirm", paying, brand)).status, 200)
    assert.equal(confirms, 2)
  } finally {
    config.tossClientKey = saved.client
    config.tossSecretKey = saved.secret
    toss.confirm = realConfirm
  }
})

test("a participant answers the optional survey once, counted only per event", async () => {
  const scanned = (await call("POST", "/check-in/20261012/scans")).data
  const answer = (body: object) => call("POST", "/check-in/20261012/survey", { pass: scanned.pass, ...body })
  assert.equal((await call("POST", "/check-in/20261012/survey", { pass: "nope", grade: "1학년" })).status, 403)
  assert.equal((await answer({ grade: "없는 학년" })).status, 400)
  const before = getDatabase().measurements.find((item) => item.code === "20261012")!.survey!
  const { responses, grade } = { responses: before.responses, grade: before.grade["2학년"] ?? 0 }
  assert.equal((await answer({ grade: "2학년", field: "자연 · 공학", visited: "처음이에요" })).status, 201)
  assert.equal((await answer({ grade: "2학년" })).status, 409)
  const after = getDatabase().measurements.find((item) => item.code === "20261012")!
  assert.deepEqual([after.survey!.responses, after.survey!.grade["2학년"]], [responses + 1, grade + 1])
  // 패스에는 응답했다는 사실 말고 답에 대한 것이 아무것도 남지 않는다.
  assert.deepEqual(after.passes[scanned.pass], { surveyed: true })
})

test("the operators' console lists what needs them, members with their record, and every proposal", async () => {
  const saved = config.adminToken
  config.adminToken = "test-admin-token"
  const admin = (route: string, body?: unknown) =>
    fetch(`${baseUrl}/admin${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (response) => ({ status: response.status, data: (await response.json()) as Record<string, any> }))
  try {
    assert.equal((await fetch(`${baseUrl}/admin/overview`)).status, 403)
    const seen = (await admin("/overview")).data
    assert.equal(seen.weekly.length, 8)
    assert.deepEqual(Object.keys(seen.attention).sort(), ["alerts", "applications", "cancels", "inquiries", "reports", "stale", "suspended", "transfers"])
    assert.deepEqual(Object.keys(seen.revenue.byKind).sort(), ["ad", "fee", "pro", "report"])

    await signUpMember("console@syu.ac.kr", "console-pass-123")
    const found = (await admin("/accounts?q=console%40syu")).data.accounts
    assert.equal(found.length, 1)
    assert.equal(found[0].role, "학생단체")
    assert.equal(found[0].passwordHash, undefined)
    assert.ok((await admin("/accounts?role=브랜드")).data.accounts.every((row: { role: string }) => row.role === "브랜드"))
    assert.ok((await admin("/accounts?state=demo")).data.accounts.every((row: { demo: boolean }) => row.demo))

    const detail = (await admin(`/accounts/${found[0].id}`)).data.account
    assert.deepEqual([detail.email, detail.sessions], ["console@syu.ac.kr", 1])
    const stopped = (await admin(`/accounts/${found[0].id}/suspend`, {})).data.account
    assert.ok(stopped.suspendedAt)
    assert.equal(stopped.sessions, 0)
    const demoId = getDatabase().demoAccountIds.학생단체
    assert.equal((await admin(`/accounts/${demoId}/suspend`, {})).status, 403)

    const proposals = (await admin("/proposals")).data.proposals
    assert.ok(proposals.length > 0)
    assert.ok(proposals.every((row: { from: string; status: string }) => row.from && row.status))
  } finally {
    config.adminToken = saved
  }
})

test("operators keep notes on members, post notices and read their own log and the services' state", async () => {
  const saved = config.adminToken
  config.adminToken = "test-admin-token"
  const admin = (method: string, route: string, body?: unknown) =>
    fetch(`${baseUrl}/admin${route}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (response) => ({ status: response.status, data: (await response.json()) as Record<string, any> }))
  try {
    for (const route of ["/log", "/health", "/announcements"]) assert.equal((await fetch(`${baseUrl}/admin${route}`)).status, 403)

    // 회원에 대한 메모를 남기고 회원이 떠나면 메모도 가져간다.
    const token = await signUpMember("noted@syu.ac.kr", "noted-pass-123")
    const id = getDatabase().accounts.find((account) => account.email === "noted@syu.ac.kr")!.id
    assert.equal((await admin("PUT", `/accounts/${id}/note`, { note: "x".repeat(1001) })).status, 400)
    const noted = (await admin("PUT", `/accounts/${id}/note`, { note: "신고 두 번, 다음엔 정지" })).data.account
    assert.equal(noted.note.text, "신고 두 번, 다음엔 정지")
    const log = (await admin("GET", "/log")).data.entries
    assert.deepEqual([log[0].action, log[0].target, log[0].label], ["note-saved", { kind: "account", id }, "noted 동아리"])
    assert.equal((await call("DELETE", "/auth/account", { password: "noted-pass-123" }, token)).status, 204)
    assert.equal(getDatabase().adminNotes?.[id], undefined)
    assert.ok(!(await admin("GET", "/log")).data.entries.some((entry: { target: { id: string } }) => entry.target.id === id))

    // 브랜드 전용 공지를 올리고, 끝나는 모두를 위한 공지를 올린다.
    assert.equal((await admin("POST", "/announcements", { text: "", tone: "info", audience: "all" })).status, 400)
    assert.equal((await admin("POST", "/announcements", { text: "점검", tone: "loud", audience: "all" })).status, 400)
    assert.equal((await admin("POST", "/announcements", { text: "점검", tone: "info", audience: "all", until: "2000-01-01" })).status, 400)
    const brands = (await admin("POST", "/announcements", { text: "브랜드 정산 안내", tone: "info", audience: "브랜드" })).data.announcement
    const all = (await admin("POST", "/announcements", { text: "오늘 밤 점검이 있어요", tone: "warning", audience: "all" })).data.announcement
    const seen = (await call("GET", "/announcements")).data.announcements.map((item: { id: string }) => item.id)
    assert.ok(seen.includes(all.id))
    assert.ok(!seen.includes(brands.id))
    assert.equal((await admin("POST", `/announcements/${all.id}/end`)).status, 200)
    assert.ok(!(await call("GET", "/announcements")).data.announcements.some((item: { id: string }) => item.id === all.id))
    const listed = (await admin("GET", "/announcements")).data.announcements
    assert.equal(listed.find((item: { id: string }) => item.id === all.id).live, false)

    // 설정된 서비스를 예 또는 아니오로만 보여 준다.
    const health = (await admin("GET", "/health")).data
    assert.equal(health.storage, "file")
    assert.ok(health.checks.every((check: { key: string; on: unknown }) => typeof check.on === "boolean"))
    assert.ok(!JSON.stringify(health).includes("test-admin-token"))
  } finally {
    config.adminToken = saved
  }
})

test("the console's member tools, operations, content, analysis and system screens", async () => {
  const saved = config.adminToken
  config.adminToken = "test-admin-token"
  const admin = (method: string, route: string, body?: unknown) =>
    fetch(`${baseUrl}/admin${route}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Admin-Token": "test-admin-token" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (response) => ({
      status: response.status,
      data: (response.status === 204 ? {} : await response.json().catch(() => ({}))) as Record<string, any>,
    }))
  try {
    for (const route of ["/insights", "/system", "/agreements", "/live", "/posts", "/reviews", "/faq"]) {
      assert.equal((await fetch(`${baseUrl}/admin${route}`)).status, 403)
    }

    // 회원은 모든 곳에서 로그아웃되고, 하나씩과 한꺼번에 태그가 붙고,
    // 사업자로 확인되고, Campus Partners를 무료로 받는다.
    const token = await signUpMember("tools@toolscafe.kr", "tools-pass-123", "브랜드")
    const id = getDatabase().accounts.find((account) => account.email === "tools@toolscafe.kr")!.id
    assert.equal((await admin("POST", `/accounts/${id}/logout`)).data.account.sessions, 0)
    assert.equal((await call("GET", "/auth/me", undefined, token)).status, 401)
    assert.deepEqual((await admin("PUT", `/accounts/${id}/tags`, { tags: [" 주의 ", "주의", "VIP"] })).data.account.tags, ["주의", "VIP"])
    assert.equal((await admin("POST", "/accounts/bulk", { ids: [id], action: "tag", tag: "파트너 후보" })).data.done, 1)
    const tagged = (await admin("GET", "/accounts?tag=파트너 후보")).data.accounts
    assert.deepEqual(tagged.map((row: { id: string }) => row.id), [id])
    assert.equal((await admin("PUT", `/accounts/${id}/business`, { verified: true, number: "123-45-6789" })).status, 400)
    assert.equal((await admin("PUT", `/accounts/${id}/business`, { verified: true, number: "123-45-67890" })).data.account.businessNumber, "1234567890")
    const granted = (await admin("POST", `/accounts/${id}/partners`, { days: 30 })).data.account
    assert.ok(granted.partnersUntil)
    assert.ok(granted.timeline.some((item: { kind: string }) => item.kind === "가입"))
    assert.equal((await admin("POST", `/accounts/${id}/partners`, { days: 0 })).status, 400)

    // 운영은 모든 계약, 행사, 오늘의 행사, 제안 하나를 통째로 보여 준다.
    assert.ok(Array.isArray((await admin("GET", "/agreements")).data.agreements))
    assert.ok((await admin("GET", "/events")).data.events.length > 0)
    const live = (await admin("GET", "/live")).data
    assert.ok(Array.isArray(live.events) && Array.isArray(live.alerts))
    const anyProposal = getDatabase().requests[0]
    const detail = (await admin("GET", `/proposals/${anyProposal.id}`)).data.proposal
    assert.equal(detail.id, anyProposal.id)
    assert.equal(detail.message, undefined)
    assert.ok(Array.isArray((await admin("GET", "/proposals/stale")).data.proposals))

    // 콘텐츠는 숨긴 글이 게시판에서 빠지고, 고정한 후기가 맨 앞에 온다.
    const post = getDatabase().posts[0]
    assert.equal((await admin("POST", `/posts/${post.id}/hide`)).status, 204)
    const board = (await call("GET", "/board?role=" + encodeURIComponent(post.accountId === getDatabase().demoAccountIds.브랜드 ? "학생단체" : "브랜드"))).data.posts
    assert.ok(!board.some((item: { id: string }) => item.id === post.id))
    await admin("POST", `/posts/${post.id}/show`)
    const review = getDatabase().reviews.at(-1)!
    assert.equal((await admin("POST", `/reviews/${review.id}/pin`)).status, 204)
    assert.ok(getDatabase().reviews.find((item) => item.id === review.id)!.pinnedAt)
    assert.equal((await admin("POST", `/reviews/${review.id}/nope`)).status, 400)
    assert.equal(typeof (await admin("GET", "/invites")).data.sent, "number")

    // 질문을 맡는 일은 운영자에게 남는다.
    const student = await login("학생단체")
    const asked = (await call("POST", "/inquiries", { category: "기타", question: "담당자 배정 테스트예요" }, student)).data.inquiry
    assert.deepEqual((await admin("PUT", `/inquiries/${asked.id}/handling`, { assignee: "지은", held: true })).data.handling.assignee, "지은")
    const mine = (await call("GET", "/inquiries", undefined, student)).data.inquiries
    assert.equal(mine.find((item: { id: string }) => item.id === asked.id).handling, undefined)

    // 도움말 센터는 질문을 추가하고 기본 질문을 숨기며, 둘 다 공개된다.
    assert.equal((await admin("POST", "/faq", { topic: "nope", question: "q", answer: "a" })).status, 400)
    await admin("POST", "/faq", { topic: "start", question: "운영 시간은요?", answer: "평일 10시부터 6시까지 답해요." })
    await admin("PUT", "/faq/hidden", { question: "누가 가입할 수 있나요?", hidden: true })
    const site = (await call("GET", "/site")).data
    assert.equal(site.faq.added.at(-1).question, "운영 시간은요?")
    assert.deepEqual(site.faq.hidden, ["누가 가입할 수 있나요?"])

    // 검색어는 누가 입력했는지 빼고 세고, 너무 짧은 것은 넘긴다.
    await call("POST", "/site/searches", { q: "  카페   쿠폰 " })
    await call("POST", "/site/searches", { q: "a" })
    const insights = (await admin("GET", "/insights")).data
    assert.deepEqual(insights.searches.find((item: { term: string }) => item.term === "카페 쿠폰"), { term: "카페 쿠폰", count: 1 })
    assert.deepEqual(insights.funnel.map((step: { step: string }) => step.step), ["가입", "소개 작성", "첫 제안", "첫 수락", "첫 결제"])
    assert.equal(insights.cohorts.length, 8)
    assert.equal((await admin("PUT", "/settings/kpi", { signups: -1 })).status, 400)
    const kpi = (await admin("PUT", "/settings/kpi", { signups: 20 })).data.kpi
    assert.equal(kpi.find((item: { key: string }) => item.key === "signups").target, 20)

    // 점검은 쓰기를 돌려보내지만 읽기, 로그인, 콘솔은 막지 않으며, 가입은
    // 따로 멈출 수 있다.
    await admin("PUT", "/settings/maintenance", { on: true, message: "점검 중", blockSignups: true })
    assert.deepEqual((await call("GET", "/site")).data.maintenance, { message: "점검 중" })
    assert.equal((await call("POST", "/inquiries", { category: "기타", question: "점검 중 질문이에요" }, student)).status, 503)
    assert.equal((await call("GET", "/inquiries", undefined, student)).status, 200)
    assert.equal((await call("POST", "/auth/login", { role: "학생단체", email: "muse@syu.ac.kr", password: DEMO_PASSWORD })).status, 200)
    await admin("PUT", "/settings/maintenance", { on: false, blockSignups: true })
    assert.equal((await call("POST", "/auth/signup", { role: "학생단체" })).status, 503)
    await admin("PUT", "/settings/maintenance", { on: false, blockSignups: false })

    // 시스템 화면은 주소 없이 제한을 센다.
    const system = (await admin("GET", "/system")).data
    assert.ok(system.limits.length > 0)
    assert.ok(system.limits.every((limit: Record<string, unknown>) => Object.keys(limit).sort().join() === "blocked,counting,limit,message,minutes"))
    assert.ok(Array.isArray(system.backups) && Array.isArray(system.cronRuns))
    assert.equal((await admin("GET", "/backups/../../etc")).status, 404)

    // 예시를 초기화하면 이름이 바뀐 데모 행사가 돌아오고 회원의 데이터는 건드리지 않는다.
    const demoId = getDatabase().demoAccountIds.학생단체
    getDatabase().events[demoId][0].name = "바뀐 이름"
    assert.equal((await admin("POST", "/demo/reset")).status, 200)
    assert.equal(getDatabase().events[demoId][0].name, "2026 뮤즈 종강 공연")
    assert.ok(getDatabase().accounts.some((account) => account.id === id))
    assert.equal((await call("POST", "/auth/login", { role: "학생단체", email: "muse@syu.ac.kr", password: DEMO_PASSWORD })).status, 200)
  } finally {
    config.adminToken = saved
    const database = getDatabase()
    database.settings = {}
  }
})

test("a QR can't be run up: one address is limited by the event's size, and an event stops at three times its audience", async () => {
  const { addDays, todayInKorea } = await import("./lib/dates.js")
  const group = await signUpMember("scan-club@syu.ac.kr", "scan-pass-123")
  const made = await call("POST", "/events", { name: "스캔 공연", date: addDays(todayInKorea(), 3), people: "10명", types: ["제품"] }, group)
  const { report } = (await call("GET", `/measurements/${made.data.event.id}`, undefined, group)).data
  const event = getDatabase().events[getDatabase().accounts.find((item) => item.email === "scan-club@syu.ac.kr")!.id][0]
  event.date = todayInKorea()
  const scan = () => call("POST", `/check-in/${report.code}/scans`)
  for (let count = 0; count < 30; count += 1) assert.equal((await scan()).status, 200)
  const limited = await scan()
  assert.equal(limited.status, 429)
  assert.match(limited.data.error, /이 네트워크/)

  const measurement = getDatabase().measurements.find((item) => item.code === report.code)!
  assert.equal(measurement.metrics.scans, 30)
  // 브라우저 정보를 바꿔도 같은 주소다.
  const renamed = await fetch(`${baseUrl}/check-in/${report.code}/scans`, { method: "POST", headers: { "User-Agent": "another-phone" } })
  assert.equal(renamed.status, 429)
  await clearRateLimits()
  measurement.metrics.scans = 100
  const ceiling = await scan()
  assert.equal(ceiling.status, 409)
  assert.match(ceiling.data.error, /3배/)
})

test("a shop with no company email signs up by invitation with a document, and an operator decides", async () => {
  const group = await signUpMember("doc-club@syu.ac.kr", "doc-pass-123")
  const { invite } = (await call("POST", "/invites", { placeId: "76543210" }, group)).data
  const email = "owner@gmail.com"
  // 초대가 없으면 개인 주소는 계속 거절한다.
  assert.equal((await call("POST", "/auth/email-code", { role: "브랜드", email })).status, 400)
  const sent = await call("POST", "/auth/email-code", { role: "브랜드", email, invite: invite.code })
  assert.equal(sent.status, 200)
  const verified = await call("POST", "/auth/email-code/verify", { email, code: sent.data.devCode })
  const form = {
    role: "브랜드",
    name: "동네 카페",
    type: "카페 · 식음료",
    school: "",
    email,
    password: "doc-owner-123",
    verificationToken: verified.data.verificationToken,
    agreedToTerms: true,
    contact: testContact,
    over14: true,
    invite: invite.code,
  }
  assert.equal((await call("POST", "/auth/signup", form)).status, 400)
  const held = await call("POST", "/auth/signup", { ...form, document: proofDocument })
  assert.deepEqual([held.status, held.data], [202, { pending: true }])
  assert.equal(getDatabase().accounts.some((account) => account.email === email), false)

  const log = { role: "브랜드", email, password: "doc-owner-123" }
  assert.equal((await call("POST", "/auth/login", log)).status, 403)
  assert.equal((await call("POST", "/auth/login", { ...log, password: "wrong-pass-123" })).status, 401)
  assert.equal((await call("POST", "/auth/email-code", { role: "브랜드", email, invite: invite.code })).status, 409)

  // 운영자만 읽을 수 있고, 승인하면 계정을 만들고 매장을 연결한다.
  const { config: settings } = await import("./config.js")
  const saved = settings.adminToken
  settings.adminToken = "test-admin-token"
  const admin = { "X-Admin-Token": "test-admin-token" }
  try {
    assert.equal((await fetch(`${baseUrl}/admin/applications`)).status, 403)
    const { applications } = (await (await fetch(`${baseUrl}/admin/applications`, { headers: admin })).json()) as { applications: { id: string; kind: string; brand: string }[] }
    assert.deepEqual([applications[0].kind, applications[0].brand], ["shop", "동네 카페"])
    assert.equal(JSON.stringify(applications).includes("passwordHash"), false)
    const document = await fetch(`${baseUrl}/admin/applications/${applications[0].id}/document`, { headers: admin })
    assert.equal((await document.text()).startsWith("%PDF-"), true)
    assert.equal((await fetch(`${baseUrl}/admin/applications/${applications[0].id}/reject`, { method: "POST", headers: { ...admin, "Content-Type": "application/json" }, body: "{}" })).status, 400)
    await approveApplication(email)
    settings.adminToken = "test-admin-token"
    assert.equal((await fetch(`${baseUrl}/admin/applications/${applications[0].id}/document`, { headers: admin })).status, 404)
  } finally {
    settings.adminToken = saved
  }
  const logged = await call("POST", "/auth/login", log)
  assert.equal(logged.status, 200)
  assert.equal(getDatabase().brands.find((brand) => brand.id === logged.data.account.brandId)?.kakaoPlaceId, "76543210")

  // 거절하면 가입이 사라지고 주소를 다시 쓸 수 있다.
  const other = await call("POST", "/auth/email-code", { role: "브랜드", email: "second@naver.com", invite: invite.code })
  const proof = await call("POST", "/auth/email-code/verify", { email: "second@naver.com", code: other.data.devCode })
  await call("POST", "/auth/signup", { ...form, email: "second@naver.com", verificationToken: proof.data.verificationToken, document: proofDocument })
  settings.adminToken = "test-admin-token"
  try {
    const { id } = getDatabase().applications!.find((item) => item.email === "second@naver.com")!
    const rejected = await fetch(`${baseUrl}/admin/applications/${id}/reject`, { method: "POST", headers: { ...admin, "Content-Type": "application/json" }, body: JSON.stringify({ reason: "서류가 흐려요" }) })
    assert.equal(rejected.status, 200)
  } finally {
    settings.adminToken = saved
  }
  assert.equal((await call("POST", "/auth/email-code", { role: "브랜드", email: "second@naver.com", invite: invite.code })).status, 200)
})
