import { expect, test } from "@playwright/test"

// 브라우저를 영어로 설정하면 앱이 영어로 나오고, 푸터의 전환 버튼을 누르면
// 한국어로 돌아온다(다음 방문에도 기억한다).
test.use({ locale: "en-US" })

test("an English browser gets English, and the switch brings back Korean", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page).toHaveTitle(/Sponsorship matching for student groups and brands/)

  // 서버도 오류를 영어로 답한다.
  const answer = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "en" },
      body: JSON.stringify({ role: "학생단체", email: "nobody@syu.ac.kr", password: "wrong-password" }),
    })
    return (await response.json()).error as string
  })
  expect(answer).not.toMatch(/[가-힣]/)

  await page.getByRole("button", { name: "한국어" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "ko")
  await expect(page.getByRole("button", { name: "English" })).toBeAttached()
  await expect(page).toHaveTitle(/[가-힣]/)
})
