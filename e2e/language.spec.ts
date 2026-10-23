import { expect, test } from "@playwright/test"

// A browser set to English gets the app in English, and the footer's switch
// brings back Korean (remembered for the next visit).
test.use({ locale: "en-US" })

test("an English browser gets English, and the switch brings back Korean", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page).toHaveTitle(/Sponsorship matching for student groups and brands/)

  // The server answers its errors in English too.
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
