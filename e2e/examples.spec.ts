import { readFile } from "node:fs/promises"

import { expect, test, type Page } from "@playwright/test"

import { signUpMember } from "./members"

// 방문자가 예시 카드에서 고른 상대, 가입 양식의 역할별 안내, 예시 내보내기, 영어 카탈로그.

const card = (page: Page, name: string) => page.locator(".work-card").filter({ has: page.getByRole("heading", { name, exact: true }) })

// 예시 카드의 제안하기 → 로그인 창의 '이 제안 데모로 체험하기' → 같은 상대의 제안 폼.
for (const side of [
  { path: "/matches", partner: "오후의 커피", account: "삼육대 뮤즈" },
  { path: "/groups", partner: "", account: "오후의 커피" },
]) {
  test(`a visitor's example proposal goes on with the demo account (${side.path})`, async ({ page }) => {
    await page.goto(side.path)
    const first = page.locator(".work-card").first()
    await expect(first).toBeVisible()
    const target = side.partner ? card(page, side.partner) : first
    const name = side.partner || ((await target.locator("h3").textContent()) ?? "").trim()
    await target.getByRole("button", { name: "제안하기" }).click()

    const login = page.getByRole("dialog", { name: "로그인" })
    await expect(login.getByText(`예시 상대인 ${name}에는 데모 계정으로만 제안해 볼 수 있어요.`)).toBeVisible()
    await login.getByRole("button", { name: "이 제안 데모로 체험하기" }).click()

    // 폼만 열리고, 보내는 건 사용자다.
    const form = page.getByRole("dialog", { name: `${name}에 협찬 제안` })
    await expect(form).toBeVisible()
    await expect(page.locator(".dash-top-who, .account-button").first()).toBeAttached()
    await expect(page).toHaveURL(new RegExp(`${side.path}$`))
  })
}

test("a typed login and closing the window drop the example partner", async ({ page }) => {
  await page.goto("/matches")
  await card(page, "오후의 커피").getByRole("button", { name: "제안하기" }).click()
  let login = page.getByRole("dialog", { name: "로그인" })
  await expect(login.getByRole("button", { name: "이 제안 데모로 체험하기" })).toBeVisible()

  // 닫았다 다시 연 로그인 창에는 예시 상대가 없다.
  await login.getByRole("button", { name: "닫기" }).click()
  await expect(login).toBeHidden()
  await page.getByRole("button", { name: "로그인" }).first().click()
  login = page.getByRole("dialog", { name: "로그인" })
  await expect(login.getByRole("button", { name: "이 제안 데모로 체험하기" })).toHaveCount(0)
  await login.getByRole("button", { name: "닫기" }).click()

  // 일반 로그인(직접 입력)은 상대를 넘기지 않는다.
  await card(page, "오후의 커피").getByRole("button", { name: "제안하기" }).click()
  login = page.getByRole("dialog", { name: "로그인" })
  await expect(login.getByText("로그인하거나 가입하면 실제 회원 목록에서 협찬 상대를 찾을 수 있어요.")).toBeVisible()
  await login.getByLabel("이메일").fill("muse@syu.ac.kr")
  await login.getByLabel("비밀번호", { exact: true }).fill("uniconnect2026")
  await login.getByRole("button", { name: "학생단체로 로그인" }).click()
  await expect(login).toBeHidden()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole("dialog", { name: /협찬 제안/ })).toHaveCount(0)
})

test("the sign-up form says what each side needs before the fields", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "회원가입" }).first().click()
  const signup = page.getByRole("dialog", { name: "회원가입" })
  const needs = signup.locator(".signup-needs")
  await signup.locator("label.role-option", { hasText: "학생단체" }).click()
  await expect(needs).toContainText("학교 이메일(ac.kr)과 담당자 이름 · 직책 · 휴대폰 번호가 필요해요.")
  await signup.locator("label.role-option", { hasText: "브랜드" }).click()
  await expect(needs.locator("strong")).toHaveText("개인 메일(gmail, naver 등)로는 가입할 수 없어요.")
  await expect(needs).toContainText("근처 학생단체가 보낸 초대 링크로 가입할 수 있어요.")
  await needs.getByRole("button", { name: "가입 문의는 도움말 센터로" }).click()
  await expect(signup).toBeHidden()
  await expect(page).toHaveURL(/\/faq$/)
})

test("an invited shop is told it may use a personal email with a document", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-needs@syu.ac.kr", "안내 동아리")
  const made = await request.post("/api/invites", { data: { placeId: "87654321" }, headers: group.headers })
  const { invite } = (await made.json()) as { invite: { code: string } }
  await page.goto(`/invite/${invite.code}`)
  await page.getByRole("button", { name: "가게로 가입하기" }).click()
  const needs = page.getByRole("dialog").locator(".signup-needs")
  await expect(needs).toContainText("초대받은 가게는 개인 메일로도 가입할 수 있어요.")
  await expect(needs).toContainText("사업자등록증 또는 재직 서류")
  await expect(needs).not.toContainText("가입할 수 없어요")
})

test("the example analytics download as samples", async ({ page }) => {
  await page.goto("/analytics")
  await expect(page.getByRole("button", { name: "예시 CSV 다운로드" })).toBeVisible()
  const csv = page.waitForEvent("download")
  await page.getByRole("button", { name: "예시 CSV 다운로드" }).click()
  const file = await csv
  expect(file.suggestedFilename()).toMatch(/^uniconnect-analytics-sample-\d{4}-\d{2}-\d{2}\.csv$/)
  const rows = (await readFile((await file.path())!, "utf8")).replace(/^﻿/, "").split("\r\n").filter(Boolean)
  expect(rows[0].startsWith("데이터 구분,")).toBe(true)
  expect(rows.slice(1).every((row) => row.startsWith("예시,"))).toBe(true)

  const pdf = page.waitForEvent("download")
  await page.getByRole("button", { name: "예시 PDF 다운로드" }).click()
  await expect(page.locator(".pdf-export .pdf-sample").first()).toHaveText("예시 데이터")
  expect((await pdf).suggestedFilename()).toMatch(/^uniconnect-sample-/)
})

test.describe("in English", () => {
  test.use({ locale: "en-US" })

  test("the group catalog says Filters and counts one group as one", async ({ page }) => {
    await page.goto("/groups")
    await expect(page.locator(".work-card").first()).toBeVisible()
    await expect(page.locator(".catalog-conditions-toggle")).toContainText("Filters")
    const search = page.getByRole("searchbox", { name: "Search student groups" })
    await search.fill("삼육")
    await expect(page.getByText("1 student group", { exact: true })).toBeVisible()
    await search.fill("zzzz-nothing")
    await expect(page.getByText("0 student groups", { exact: true })).toBeVisible()
    await search.fill("")
    await expect(page.getByText(/^([2-9]|\d{2,}) student groups$/)).toBeVisible()

    // 상세에 들어갔다 돌아와도 검색어와 결과가 그대로다.
    await search.fill("삼육")
    await page.locator(".work-card").first().locator("h3 button").click()
    await expect(page).toHaveURL(/\/groups\/.+/)
    await page.goBack()
    await expect(page.getByRole("searchbox", { name: "Search student groups" })).toHaveValue("삼육")
    await expect(page.getByText("1 student group", { exact: true })).toBeVisible()
  })
})
