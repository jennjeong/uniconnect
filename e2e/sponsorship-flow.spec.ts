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
  // '답할 협찬 제안'은 받은 제안 쪽을 연다.
  await page.locator(".work-board li", { hasText: "답할 협찬 제안" }).getByRole("button").click()
  await expect(page).toHaveURL(/\/offers$/)
  await expect(page.getByRole("button", { name: /받은 제안/ })).toHaveAttribute("aria-pressed", "true")
  await context.close()
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
