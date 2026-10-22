import { expect, test, type Page } from "@playwright/test"

// The demo accounts' password (DEMO_PASSWORD in backend/src/data/seed.ts).
const demoPassword = "uniconnect2026"

async function logIn(page: Page, role: "학생단체" | "브랜드", email: string) {
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  if (role === "브랜드") await dialog.getByText("협찬 하기").click()
  await dialog.getByLabel("이메일").fill(email)
  await dialog.getByLabel("비밀번호", { exact: true }).fill(demoPassword)
  await dialog.getByRole("button", { name: role === "학생단체" ? "학생단체로 로그인" : "스폰서로 로그인" }).click()
  await expect(dialog).toBeHidden()
}

test("visitors browse the site, its help and its 404 page", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/uniconnect/)
  await page.goto("/matches")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/terms")
  await expect(page.getByRole("heading", { name: "서비스 이용약관" })).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/no-such-page")
  await expect(page.getByText("페이지를 찾을 수 없어요").first()).toBeVisible()
})

test("a student group proposes and the brand accepts", async ({ browser }) => {
  const student = await (await browser.newContext()).newPage()
  await student.goto("/")
  await logIn(student, "학생단체", "muse@syu.ac.kr")
  // Logging in opens the dashboard; the brand's page is one step away.
  await student.goto("/matches/afternoon-coffee")
  await student.locator(".banner-actions").getByRole("button", { name: /협찬 제안 보내기/ }).click()
  await expect(student.locator(".banner-actions").getByText("제안 완료")).toBeVisible()

  const brand = await (await browser.newContext()).newPage()
  await brand.goto("/")
  await logIn(brand, "브랜드", "hello@afternoon-coffee.kr")
  await brand.goto("/inbox")
  const card = brand.locator(".request-card", { hasText: "삼육대 뮤즈" }).first()
  await card.getByRole("button", { name: /수락하기/ }).click()
  await expect(brand.locator(".request-card", { hasText: "삼육대 뮤즈" }).first()).toBeHidden()
  await brand.getByRole("tab", { name: /수락함/ }).click()
  // Accepted: the result and the progress steps show on the card.
  const accepted = brand.locator(".request-card", { hasText: "삼육대 뮤즈" })
  await expect(accepted.locator(".request-result.confirmed")).toBeVisible()
  await expect(accepted.getByRole("list", { name: "협찬 진행 상황" })).toBeVisible()
})

test("a participant checks in, takes the coupon and staff confirm the visit", async ({ page }) => {
  await page.goto("/check-in/20261012")
  await expect(page.getByRole("heading", { name: "가을 버스킹 데이" })).toBeVisible()
  await page.getByRole("button", { name: "쿠폰 받기" }).click()
  await expect(page.getByText(/UC-1012-/)).toBeVisible()
  await page.getByLabel("직원 확인 PIN").fill("0000")
  await page.getByRole("button", { name: "직원 확인 완료" }).click()
  await expect(page.getByText(/직원 PIN이 맞지 않아요/)).toBeVisible()
  await page.getByLabel("직원 확인 PIN").fill("1012")
  await page.getByRole("button", { name: "직원 확인 완료" }).click()
  await expect(page.getByText("방문이 확인됐어요", { exact: false })).toBeVisible()
})

test("a new group signs up with the code shown on screen", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "회원가입" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("단체명").fill("테스트 동아리")
  await dialog.getByLabel("학교", { exact: true }).fill("삼육대학교")
  await dialog.getByLabel("학교 이메일").fill("e2e-club@syu.ac.kr")
  await dialog.getByRole("button", { name: "인증번호 받기" }).click()
  const code = await dialog.locator(".field-hint strong").textContent()
  await dialog.getByLabel("인증번호").fill(code ?? "")
  await dialog.getByRole("button", { name: "확인" }).click()
  await expect(dialog.getByText("이메일 인증이 완료됐어요.")).toBeVisible()
  await dialog.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-123")
  await dialog.getByLabel("비밀번호 확인").fill("e2e-pass-123")
  // The agreement's words hold links to the documents, so tick the boxes.
  await dialog.getByRole("checkbox").nth(0).check()
  await dialog.getByRole("checkbox").nth(1).check()
  await dialog.getByRole("button", { name: "가입하고 시작하기" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/가입했어요/)).toBeVisible()
})
