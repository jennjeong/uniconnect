import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { signUpMember } from "./members"

// 주요 화면의 자동 접근성 검사(WCAG 2.1 A와 AA)다. 치명적이거나 심각한
// 문제는 실행을 실패시키고, 나머지는 출력만 한다.
const pages = ["/", "/dashboard", "/matches", "/groups", "/plans", "/faq", "/terms", "/privacy", "/admin", "/explore", "/events", "/check-in/20261012", "/check-in/20261012/staff", "/check-in/20261012/group", "/no-such-page"]

async function expectNoBlockingProblems(page: Page, path: string, open?: () => Promise<void>) {
  await page.goto(path)
  await open?.()
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

// 계정마다 다른 부분(가까운 순 탭)은 카드가 도착한 뒤에 방문자에게 안내문
// 아래로 예시를 전부 보여 준다.
for (const path of ["/matches", "/groups"]) {
  test(`${path}'s 가까운 순 shows a visitor examples without critical or serious accessibility problems`, async ({ page }) => {
    await expectNoBlockingProblems(page, path, async () => {
      await page.getByRole("tab", { name: "가까운 순" }).click()
      await expect(page.getByRole("note")).toBeVisible()
      await expect(page.locator(".work-card").first()).toBeVisible()
      await page.waitForFunction(() =>
        document.getAnimations().every((item) => item.playState !== "running" || item.effect?.getTiming().iterations === Infinity),
      )
    })
  })
}

// 초대 페이지는 코드가 있어야 하는데, 가입한 단체가 먼저 만들어야 한다(데모
// 단체는 실제 매장을 초대할 수 없다).
test("an invitation's page has no critical or serious accessibility problems", async ({ page, request }) => {
  const { headers } = await signUpMember(request, "학생단체", "e2e-a11y-inviter@syu.ac.kr", "접근성 동아리")
  const made = await request.post("/api/invites", { data: { placeId: "87654321" }, headers })
  const { invite } = (await made.json()) as { invite: { code: string } }
  await expectNoBlockingProblems(page, `/invite/${invite.code}`)
})

// 팝업은 열어 둔 채로 검사한다. 막는 문제가 없고, 열려 있는 동안 키보드가
// 안에 머물며, 닫으면 포커스가 연 요소로 돌아가야 한다.
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

// 메뉴는 옆으로 든 폰이나 400%로 확대한 화면보다 길다(WCAG의 리플로가 요구하는
// 대로 1280×1024는 320×256으로 보인다). 그래서 첫 페이지에서 시작해 나머지는
// 스크롤해서 본다.
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

// 소개 페이지의 앱 다운로드는 브라우저가 자체 설치 대화상자를 주지 않을 때
// (여기서는 페이지가 그런 것을 전혀 받지 못한다) 안내를 연다.
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

// 브랜드 둘을 비교하는 표를 연 상태다.
test("the comparison of two brands has no critical or serious accessibility problems", async ({ page }) => {
  await expectNoBlockingProblems(page, "/matches", async () => {
    await page.getByRole("tab", { name: "전체" }).click()
    const toggles = page.getByRole("button", { name: /비교에 담기$/ })
    await toggles.nth(0).click()
    await toggles.nth(1).click()
    await page.getByRole("button", { name: "나란히 비교하기" }).click()
    await expect(page.getByRole("dialog", { name: "브랜드 2곳 비교" })).toBeVisible()
  })
})

// 토큰으로 콘솔을 연 뒤 운영자 콘솔의 모든 화면을 넓은 화면과 폰에서 본다.
const consoleViews = ["overview", "insights", "members", "proposals", "operations", "live", "payments", "operators", "inquiries", "reports", "content", "errors", "notices", "log", "health", "system"]

for (const width of [1280, 390]) {
  test(`the operators' console screens at ${width}px have no critical or serious accessibility problems`, async ({ page }) => {
    // 화면 열여섯 개를 각각 검사한다.
    test.setTimeout(240_000)
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/admin")
    await page.getByText("공유 토큰으로 들어가기").click()
    await page.getByLabel("관리자 토큰").fill("e2e-admin-token")
    await page.getByRole("button", { name: "들어가기" }).click()
    await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
    for (const view of consoleViews) {
      await expectNoBlockingProblems(page, view === "overview" ? "/admin" : `/admin?view=${view}`, async () => {
        await expect(page.locator(".console-top h1")).toBeVisible()
        await expect(page.getByText("불러오고 있어요…")).toHaveCount(0)
      })
    }
    // 공지의 기간 캘린더를 연 상태다.
    await expectNoBlockingProblems(page, "/admin?view=notices", async () => {
      await page.getByRole("button", { name: /게시 기간/ }).click()
      await expect(page.getByRole("dialog", { name: "게시 기간 고르기" })).toBeVisible()
    })
  })
}
