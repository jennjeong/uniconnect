import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import { signUpMember } from "./members"

// #315에서 백엔드가 올린 기능의 화면: 계약서의 협찬 형태별 표준 조항(#333), 응답률과 이행률(#343),
// 관심 조건 저장(#338), 학교 · 달별 행사 수(#344). 회원을 만들므로 flows.spec.ts 뒤에 돈다(파일 이름 순).

const kst = (days = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + days * 86_400_000))

test("either side attaches the standard clauses for the sponsorship's types to the contract", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-clauses@clauses-cafe.kr", "조항 카페")
  const group = await signUpMember(request, "학생단체", "e2e-clauses@syu.ac.kr", "조항 동아리")
  await request.post("/api/events", { data: { name: "조항 공연", date: kst(10), people: "80명", types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  const id = requests[0].id
  await request.post(`/api/requests/${id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto(`/agreements/${id}`)
  const clauses = page.getByRole("region", { name: "협찬 형태별 표준 조항" })
  await clauses.getByRole("button", { name: /형태 고르기|형태 바꾸기/ }).click()
  await clauses.locator("label.chip-check", { hasText: "제품" }).click()
  await clauses.getByRole("button", { name: "조항 붙이기" }).click()
  await expect(page.getByText("표준 조항을 붙였어요. 두 쪽 모두 다시 확인해 주세요.")).toBeVisible()
  await expect(clauses).toContainText("법률 검토 전 초안이에요.")
  await expect(clauses.getByRole("heading", { name: "제품" })).toBeVisible()
  await expect(clauses).toContainText("제품 전달")
  await expect(clauses.getByRole("heading", { name: "공통" })).toBeVisible()
  // 계약 조항도 붙은 조항을 계약 내용으로 말한다.
  await expect(page.getByRole("region", { name: /계약 조항/ })).toContainText("표준 조항")
})

test("a member brand's profile shows its track record and a group saves, reapplies and removes a search", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-trust@trust-bakery.kr", "신뢰 베이커리")
  const group = await signUpMember(request, "학생단체", "e2e-searches@syu.ac.kr", "관심 동아리")
  expect(brand.listingId).toBeTruthy()

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/matches")
  const search = page.getByRole("searchbox", { name: /브랜드 검색/ })
  await search.fill("신뢰 베이커리")
  await expect(page.locator(".work-card").first()).toBeVisible()

  // 기록이 3건보다 적으면 비율 대신 기록이 적다고 한다.
  await page.locator(".work-card").first().locator("h3 button").click()
  await expect(page.getByRole("heading", { name: "약속을 지킨 기록" })).toBeVisible()
  await expect(page.locator(".trust-signals")).toContainText("아직 기록이 적어요")
  await page.goBack()

  await page.getByRole("button", { name: "이 조건 저장" }).click()
  await expect(page.getByText("관심 조건을 저장했어요. 맞는 새 상대가 생기면 알려 드려요.")).toBeVisible()
  const saved = page.getByRole("list", { name: "저장한 관심 조건" })
  await expect(saved.getByRole("button", { name: "관심 조건 “신뢰 베이커리” 다시 걸기" })).toBeVisible()
  await expect(page.getByRole("button", { name: "이 조건 저장" })).toHaveCount(0)

  await search.fill("")
  await saved.getByRole("button", { name: "관심 조건 “신뢰 베이커리” 다시 걸기" }).click()
  await expect(search).toHaveValue("신뢰 베이커리")

  await saved.getByRole("button", { name: "관심 조건 “신뢰 베이커리” 지우기" }).click()
  await expect(page.getByText("관심 조건을 지웠어요.")).toBeVisible()
  await expect(page.getByRole("list", { name: "저장한 관심 조건" })).toHaveCount(0)
})

test("a brand sees events by school and month on the explore page, without names or small cells", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-demand@syu.ac.kr", "수요 동아리")
  for (const name of ["수요 공연 1", "수요 공연 2", "수요 공연 3"]) {
    await request.post("/api/events", { data: { name, date: kst(45), people: "80명", types: ["현금"] }, headers: group.headers })
  }
  const brand = await signUpMember(request, "브랜드", "e2e-demand@demand-cafe.kr", "수요 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/explore")

  const table = page.getByRole("region", { name: "학교 · 달별 행사 수" })
  const row = table.getByRole("row", { name: /삼육대학교/ })
  await expect(row).toBeVisible()
  const counts = (await row.getByRole("cell").allInnerTexts()).filter((text) => /^\d+$/.test(text)).map(Number)
  expect(counts.length).toBeGreaterThan(0)
  expect(Math.min(...counts)).toBeGreaterThanOrEqual(3)
  await expect(page.getByText("행사가 3건 미만인 칸은 비워 두었어요", { exact: false })).toBeVisible()

  const results = await new AxeBuilder({ page }).include(".demand").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  expect(results.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([])
})
