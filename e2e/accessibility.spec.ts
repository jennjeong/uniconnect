import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

// Automatic accessibility checks (WCAG 2.1 A and AA) on the main screens.
// Critical and serious problems fail the run; the rest are printed.
const pages = ["/", "/matches", "/groups", "/faq", "/terms", "/privacy", "/admin", "/check-in/20261012", "/check-in/20261012/staff", "/no-such-page"]

for (const path of pages) {
  test(`${path} has no critical or serious accessibility problems`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState("networkidle")
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
    const blocking = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious")
    for (const item of results.violations) {
      console.log(`${path} · ${item.impact} · ${item.id}: ${item.nodes.length} · ${item.nodes[0]?.target.join(" ")}`)
    }
    expect(blocking.map((item) => `${item.id} (${item.nodes.length})`)).toEqual([])
  })
}

// Popups are checked open: no blocking problems, the keyboard stays inside
// while they are open, and focus goes back to what opened them.
test("an open popup holds the keyboard and passes the checks", async ({ page }) => {
  await page.goto("/")
  const opener = page.getByRole("button", { name: "로그인" }).first()
  await opener.focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("dialog", { name: "로그인" })
  await expect(dialog).toBeVisible()
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)

  for (let press = 0; press < 25; press += 1) await page.keyboard.press(press % 5 === 4 ? "Shift+Tab" : "Tab")
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)

  const results = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  const blocking = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious")
  expect(blocking.map((item) => `${item.id} (${item.nodes.length})`)).toEqual([])

  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})
