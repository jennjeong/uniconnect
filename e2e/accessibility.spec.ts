import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { signUpMember } from "./members"

// Automatic accessibility checks (WCAG 2.1 A and AA) on the main screens.
// Critical and serious problems fail the run; the rest are printed.
const pages = ["/", "/dashboard", "/matches", "/groups", "/faq", "/terms", "/privacy", "/admin", "/check-in/20261012", "/check-in/20261012/staff", "/check-in/20261012/group", "/no-such-page"]

async function expectNoBlockingProblems(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  const blocking = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious")
  for (const item of results.violations) {
    console.log(`${path} · ${item.impact} · ${item.id}: ${item.nodes.length} · ${item.nodes[0]?.target.join(" ")}`)
  }
  expect(blocking.map((item) => `${item.id} (${item.nodes.length})`)).toEqual([])
}

for (const path of pages) {
  test(`${path} has no critical or serious accessibility problems`, async ({ page }) => {
    await expectNoBlockingProblems(page, path)
  })
}

// An invitation's page needs a code, which a group that signed up makes
// first (the demo group can't invite real shops).
test("an invitation's page has no critical or serious accessibility problems", async ({ page, request }) => {
  const { headers } = await signUpMember(request, "학생단체", "e2e-a11y-inviter@syu.ac.kr", "접근성 동아리")
  const made = await request.post("/api/invites", { data: { placeId: "87654321" }, headers })
  const { invite } = (await made.json()) as { invite: { code: string } }
  await expectNoBlockingProblems(page, `/invite/${invite.code}`)
})

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

// The menu is taller than a phone held sideways or a screen zoomed to 400%
// (1280×1024 shows 320×256, as WCAG's reflow asks): it starts at its first
// page and scrolls to the rest.
for (const [width, height] of [
  [844, 390],
  [320, 256],
]) {
  test(`the menu reaches every page on a ${width}×${height} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto("/dashboard")
    await page.getByRole("button", { name: "전체 메뉴" }).click()
    const menu = page.getByRole("dialog", { name: "전체 메뉴" })
    await expect(menu.getByRole("button", { name: /대시보드/ })).toBeInViewport()
    const last = menu.getByRole("button", { name: "브랜드 화면" })
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
  })
}

// 앱 다운로드 on the introduction opens the guide where the browser offers no
// install dialog of its own (here the page never hears of one).
test("the app download guide opens from the introduction and passes the checks", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("beforeinstallprompt", (event) => event.stopImmediatePropagation(), true)
  })
  await page.goto("/")
  await page.getByRole("button", { name: "앱 다운로드" }).first().click()
  const dialog = page.getByRole("dialog", { name: "앱 다운로드" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("주소창 오른쪽의 설치 아이콘을 눌러요.")

  const results = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  const blocking = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious")
  expect(blocking.map((item) => `${item.id} (${item.nodes.length})`)).toEqual([])

  await dialog.getByRole("button", { name: "알겠어요" }).click()
  await expect(dialog).toBeHidden()
})
