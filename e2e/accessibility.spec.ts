import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

// Automatic accessibility checks (WCAG 2.1 A and AA) on the main screens.
// Critical and serious problems fail the run; the rest are printed.
const pages = ["/", "/matches", "/groups", "/faq", "/terms", "/privacy", "/admin", "/check-in/20261012", "/no-such-page"]

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
