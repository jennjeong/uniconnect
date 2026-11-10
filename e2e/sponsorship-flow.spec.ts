import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

import { signUpMember } from "./members"

// 첫 협찬의 흐름: 대시보드의 협찬 일정, 제안의 응답 기한, 운영자의 단계별 도달 회원 수.
// 회원 브랜드와 단체를 여럿 만들므로, 회원이 아직 없는 화면을 보는 flows.spec.ts 뒤에 돈다(파일 이름 순).

const kst = (days = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + days * 86_400_000))
const admin = { "X-Admin-Token": "e2e-admin-token" }
type Member = Awaited<ReturnType<typeof signUpMember>>

// 계약서를 양쪽이 확인한다: 단체가 가치를 적고 확인하고, 브랜드는 수수료를 내면 확인된다(이체를 운영자가 확인).
async function confirmBoth(request: APIRequestContext, id: string, group: Member, brand: Member) {
  await request.put(`/api/agreements/${id}/value`, { data: { value: { cash: 100000, inKind: 0 } }, headers: group.headers })
  await request.post(`/api/agreements/${id}/confirm`, { headers: group.headers })
  const order = (await (await request.post("/api/billing/orders", { data: { kind: "fee", targetId: id }, headers: brand.headers })).json()) as {
    order: { id: string }
  }
  expect((await request.post(`/api/admin/payments/${order.order.id}/paid`, { headers: admin })).ok()).toBe(true)
}

const scheduleRow = (page: Page) => page.locator(".work-board li", { hasText: "다가오는 협찬 일정" })

test("the brand's upcoming sponsorships count confirmed ones both ways, once, without canceled ones", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-schedule@schedule-cafe.kr", "일정 카페")
  const asked = await signUpMember(request, "학생단체", "e2e-asks@syu.ac.kr", "요청 동아리")
  const offered = await signUpMember(request, "학생단체", "e2e-offered@syu.ac.kr", "제안받는 동아리")
  const canceled = await signUpMember(request, "학생단체", "e2e-canceled@syu.ac.kr", "취소 동아리")

  // 받은 제안 두 건(하나는 뒤에 취소된다)과 브랜드가 먼저 보낸 제안 한 건.
  await request.post("/api/events", { data: { name: "요청 공연", date: kst(5), people: "80명", types: ["현금"] }, headers: asked.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: asked.headers })
  await request.post("/api/events", { data: { name: "취소 공연", date: kst(4), people: "60명", types: ["현금"] }, headers: canceled.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: canceled.headers })
  await request.post("/api/events", { data: { name: "먼저 연 시음회", date: kst(2), types: ["제품"] }, headers: brand.headers })
  // 단체는 소개를 써야 브랜드의 목록에 나온다.
  const listed = (await (
    await request.put("/api/profile", { data: { intro: "캠퍼스 동아리예요.", offer: "관객 100명" }, headers: offered.headers })
  ).json()) as { profile: { id: string } }
  const offer = await request.post("/api/proposals", { data: { matchId: listed.profile.id }, headers: brand.headers })
  expect(offer.ok(), await offer.text()).toBe(true)

  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as {
    requests: { id: string; groupName: string }[]
  }
  const askedId = requests.find((item) => item.groupName === "요청 동아리")!.id
  const canceledId = requests.find((item) => item.groupName === "취소 동아리")!.id
  const { offers } = (await (await request.get("/api/offers", { headers: offered.headers })).json()) as { offers: { id: string }[] }
  const offerId = offers[0].id
  for (const id of [askedId, canceledId]) await request.post(`/api/requests/${id}/accept`, { headers: brand.headers })
  await request.post(`/api/offers/${offerId}/accept`, { headers: offered.headers })

  // 수락했지만 계약서 확인 전: 확정 일정에는 없고 계약 대기로 안내한다.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/dashboard")
  await expect(scheduleRow(page).locator(".work-board-count")).toHaveText("0")
  await expect(scheduleRow(page)).toContainText("계약서 확인을 기다리는 3건은 양쪽이 확인하면 일정에 들어가요")

  // 양쪽이 확인하면 들어가고, 가장 가까운 일정은 브랜드가 먼저 보낸 캠페인이다.
  await confirmBoth(request, askedId, asked, brand)
  await confirmBoth(request, offerId, offered, brand)
  await confirmBoth(request, canceledId, canceled, brand)
  await page.reload()
  await expect(scheduleRow(page).locator(".work-board-count")).toHaveText("3")
  await expect(scheduleRow(page)).toContainText("제안받는 동아리 · 먼저 연 시음회 · D-2")

  // 양쪽이 취소한 협찬은 빠진다.
  await request.post(`/api/agreements/${canceledId}/cancel`, { data: { reason: "일정이 겹쳐요." }, headers: brand.headers })
  await request.post(`/api/agreements/${canceledId}/cancel/accept`, { headers: canceled.headers })
  await page.reload()
  await expect(scheduleRow(page).locator(".work-board-count")).toHaveText("2")
})

test("a reply deadline shows on both sides, sorts the inbox and the dashboard opens the right side", async ({ browser, page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-deadline@syu.ac.kr", "기한 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-deadline@deadline-cafe.kr", "기한 카페")
  const other = await signUpMember(request, "학생단체", "e2e-nodeadline@syu.ac.kr", "기한 없는 동아리")
  await request.post("/api/events", { data: { name: "기한 공연", date: kst(6), people: "80명", types: ["현금"] }, headers: group.headers })
  await request.post("/api/events", { data: { name: "기한 없는 공연", date: kst(6), people: "50명", types: ["현금"] }, headers: other.headers })
  // 기한이 없는 제안이 먼저, 오늘이 기한인 제안이 나중에 온다.
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: other.headers })
  const sent = await request.post("/api/proposals", { data: { matchId: brand.listingId, terms: { respondBy: kst(0) } }, headers: group.headers })
  expect(sent.ok()).toBe(true)

  // 받은 쪽(브랜드): 오늘까지 답하라는 표시와 응답 기한 순 정렬.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/inbox")
  const due = page.locator(".request-card", { hasText: "기한 동아리" })
  await expect(due.locator(".respond-by.today")).toHaveText("오늘까지 답해 주세요")
  await expect(page.locator(".request-card", { hasText: "기한 없는 동아리" }).locator(".respond-by")).toHaveCount(0)
  await page.getByRole("button", { name: "응답 기한 순" }).click()
  await expect(page.locator(".request-card").first()).toContainText("기한 동아리")

  // 보낸 쪽(단체, 다른 브라우저 창): 대시보드의 '보낸 제안 답변 대기'가 받은편지함의 보낸 제안 쪽을 연다.
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "ko-KR" })
  page = await context.newPage()
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/dashboard")
  await page.locator(".work-board li", { hasText: "보낸 제안 답변 대기" }).getByRole("button").click()
  await expect(page).toHaveURL(/\/offers\?box=sent$/)
  await expect(page.getByRole("button", { name: /보낸 제안/ })).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(".respond-by.today")).toHaveText("오늘이 상대 응답 기한이에요")
  await page.goBack()
  await expect(page).toHaveURL(/\/dashboard$/)
  // '답할 협찬 제안'은 받은 제안 쪽을 연다. 0건이라 맨 아래 '0건인 일'에 접혀 있다.
  const quiet = page.locator(".work-board-quiet")
  await expect(quiet.locator("li", { hasText: "답할 협찬 제안" })).toBeHidden()
  await quiet.locator("summary").click()
  await quiet.locator("li", { hasText: "답할 협찬 제안" }).getByRole("button").click()
  await expect(page).toHaveURL(/\/offers$/)
  await expect(page.getByRole("button", { name: /받은 제안/ })).toHaveAttribute("aria-pressed", "true")
  await context.close()
})

test("the fee a brand sees while proposing is what it pays at checkout", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-fee@fee-cafe.kr", "수수료 카페")
  const group = await signUpMember(request, "학생단체", "e2e-fee@syu.ac.kr", "수수료 동아리")
  const listed = (await (
    await request.put("/api/profile", { data: { intro: "캠퍼스 동아리예요.", offer: "관객 100명" }, headers: group.headers })
  ).json()) as { profile: { id: string } }
  await request.post("/api/events", { data: { name: "수수료 시음회", date: kst(10), types: ["현금"] }, headers: brand.headers })

  // 제안 폼: 금액을 적으면 예상 수수료와 부가세 포함 금액이 보인다.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto(`/groups/${listed.profile.id}`)
  await page.getByRole("button", { name: "제안하기" }).first().click()
  const form = page.getByRole("dialog", { name: /협찬 제안/ })
  await form.getByLabel("금액(원)").fill("300000")
  await expect(form.locator(".fee-estimate")).toContainText("예상 성사 수수료 45,000원 · 부가세 포함 49,500원")

  // 같은 금액으로 수락된 협찬의 수수료 주문은 그 금액이다.
  await request.post("/api/proposals", { data: { matchId: listed.profile.id, terms: { amount: 300000, kinds: ["현금"] } }, headers: brand.headers })
  const { offers } = (await (await request.get("/api/offers", { headers: group.headers })).json()) as { offers: { id: string }[] }
  await request.post(`/api/offers/${offers[0].id}/accept`, { headers: group.headers })
  const order = (await (
    await request.post("/api/billing/orders", { data: { kind: "fee", targetId: offers[0].id }, headers: brand.headers })
  ).json()) as { order: { amount: number; supply: number } }
  expect(order.order).toMatchObject({ amount: 49_500, supply: 45_000 })
})

test("a confirmed sponsorship's contract says what is next and checks the event day ahead", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-precheck@precheck-cafe.kr", "점검 카페")
  const group = await signUpMember(request, "학생단체", "e2e-precheck@syu.ac.kr", "점검 동아리")
  await request.post("/api/events", { data: { name: "점검 공연", date: kst(3), people: "80명", types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  const id = requests[0].id
  await request.post(`/api/requests/${id}/accept`, { headers: brand.headers })
  await request.get(`/api/agreements/${id}`, { headers: brand.headers })
  await confirmBoth(request, id, group, brand)

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto(`/agreements/${id}`)
  const status = page.getByRole("region", { name: "계약 상태" })
  await expect(status).toContainText("협찬이 확정됐어요.")
  await expect(status.getByRole("link", { name: "행사가 D-3예요. 행사 전 점검을 확인해 주세요." })).toBeVisible()
  const check = page.getByRole("region", { name: "행사 전 점검" })
  await expect(check.locator("li.ok", { hasText: "양쪽이 계약서를 확인했어요" })).toBeVisible()
  await expect(check.locator("li.ok", { hasText: "협찬 확인 방식이 확정됐어요" })).toBeVisible()
  await expect(check.getByRole("link", { name: "체크인 페이지 열기" })).toHaveAttribute("href", /\/check-in\//)
  // 브랜드의 매장 PIN은 행사 하루 전부터 보인다.
  await expect(check.locator("li.pending")).toContainText("PIN은 행사 하루 전부터 이 계약서에 보여요")
})

test.describe("in English", () => {
  test.use({ locale: "en-US" })

  test("the reply deadline and the members reaching each step read in English", async ({ page, request }) => {
    const group = await signUpMember(request, "학생단체", "e2e-en-deadline@syu.ac.kr", "영어 동아리")
    const brand = await signUpMember(request, "브랜드", "e2e-en-deadline@en-cafe.kr", "영어 카페")
    await request.post("/api/events", { data: { name: "영어 공연", date: kst(6), people: "80명", types: ["현금"] }, headers: group.headers })
    await request.post("/api/proposals", { data: { matchId: brand.listingId, terms: { respondBy: kst(2) } }, headers: group.headers })
    await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
    await page.goto("/inbox")
    await expect(page.locator(".request-card", { hasText: "영어 동아리" }).locator(".respond-by.soon")).toContainText("Reply by D-2")

    await page.evaluate(() => sessionStorage.setItem("uniconnect-admin-token", "e2e-admin-token"))
    await page.goto("/admin?view=insights")
    const card = page.locator(".console-card", { hasText: "Members reaching each step" })
    await expect(card).toBeVisible()
    await expect(card.locator(".console-funnel-group")).toHaveCount(2)
    await expect(card.locator(".console-funnel-group").nth(1)).toContainText("Paid")
    await expect(card.locator(".console-funnel-group").nth(0)).not.toContainText("Paid")
  })
})
