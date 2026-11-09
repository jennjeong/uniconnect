import { readFile } from "node:fs/promises"

import { expect, test, type Page } from "@playwright/test"

import { codeAt, stepAt } from "../backend/src/lib/totp"
import { signUpMember } from "./members"

// 데모 계정의 비밀번호다(backend/src/data/seed.ts의 DEMO_PASSWORD).
const demoPassword = "uniconnect2026"

// 학생단체 찾기 쪽의 '가까운 순'은 조건 칸의 정렬이다(components/CatalogControls.tsx).
async function sortNearest(page: Page) {
  await page.locator(".catalog-conditions-toggle").click()
  await page.locator(".sort-choice label", { hasText: "가까운 순" }).click()
}

async function logIn(page: Page, role: "학생단체" | "브랜드", email: string) {
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  if (role === "브랜드") await dialog.getByText("협찬 하기").click()
  await dialog.getByLabel("이메일").fill(email)
  await dialog.getByLabel("비밀번호", { exact: true }).fill(demoPassword)
  await dialog.getByRole("button", { name: role === "학생단체" ? "학생단체로 로그인" : "스폰서로 로그인" }).click()
  await expect(dialog).toBeHidden()
}

test("search engines find the sitemap from robots.txt", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toContain("Sitemap: https://uniconnect-pied.vercel.app/sitemap.xml")
  const sitemap = await request.get("/sitemap.xml")
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()["content-type"]).toMatch(/xml/)
  const xml = await sitemap.text()
  expect(xml).toContain("<loc>https://uniconnect-pied.vercel.app/faq</loc>")
  // 검색에서 뺀 화면은 계속 빠져 있다.
  expect(xml).not.toContain("/dashboard")
})

test("visitors browse the site, its help and its 404 page", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/uniconnect/)
  // 소개 페이지의 예시 영역에서 각 역할의 화면을 고른다.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("캠퍼스 행사 협찬을")
  await page.getByRole("link", { name: "가입 전에 예시 화면 둘러보기" }).click()
  await expect(page).toHaveURL(/#examples$/)
  const examples = page.locator("#examples")
  await expect(examples.getByRole("heading", { name: "추천 매칭" })).toBeVisible()
  await examples.getByRole("article").filter({ has: page.getByRole("heading", { name: "단체 찾기" }) }).getByRole("button", { name: "예시 보기" }).click()
  await expect(page.locator(".demo-chip")).toHaveText("예시 화면")
  await page.goBack()
  await expect(page).toHaveURL(/\/#examples$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("캠퍼스 행사 협찬을")
  await page.goto("/matches")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/terms")
  await expect(page.getByRole("heading", { name: "서비스 이용약관" })).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/no-such-page")
  await expect(page.getByText("페이지를 찾을 수 없어요").first()).toBeVisible()
})

test("the landing starts for both roles fit with a bilingual notice", async ({ page }) => {
  await page.route("**/api/announcements", (route) => route.fulfill({ json: { announcements: [
    { id: "landing-notice", text: "테스트 공지", textEn: "Test notice", tone: "info" },
  ] } }))
  await page.goto("/")
  for (const lang of ["ko", "en"] as const) {
    const notice = lang === "ko" ? "테스트 공지" : "Test notice"
    await expect(page.getByText(notice, { exact: true })).toBeVisible()
    for (const viewport of [{ width: 1200, height: 702 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      const buttons = page.locator(".landing-entry")
      await expect(buttons).toHaveCount(2)
      for (const button of await buttons.all()) {
        await expect(button).toBeInViewport({ ratio: 1 })
      }
    }
    if (lang === "ko") {
      await page.getByRole("button", { name: "전체 메뉴", exact: true }).click()
      await page.getByRole("dialog").getByRole("button", { name: "English", exact: true }).click()
    }
  }
})

test("backup restore is disclosed separately and requires the selected timestamp", async ({ page }) => {
  const hour = "2026-11-09T02"
  const counts = { accounts: 2, events: 1, measurements: 0, proposals: 1 }
  await page.addInitScript(() => sessionStorage.setItem("uniconnect-admin-token", "e2e-admin-token"))
  await page.route("**/api/admin/system", (route) => route.fulfill({ json: {
    limits: [], backups: [{ hour, bytes: 2048 }], cronRuns: [], maintenance: { on: false },
  } }))
  await page.route("**/api/admin/backups/*/summary", (route) => route.fulfill({ json: {
    backup: counts, current: { ...counts, accounts: 3 }, accountsBack: 0,
  } }))
  await page.route("**/api/admin/backups/*/restore", (route) => {
    expect(route.request().postDataJSON()).toEqual({ confirm: hour })
    return route.fulfill({ json: { ok: true } })
  })
  await page.goto("/admin?view=system")
  await expect(page.getByRole("button", { name: "내려받기", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "복원", exact: true })).toBeHidden()
  await page.getByText("백업 작업", { exact: true }).click()
  await page.getByRole("button", { name: "복원", exact: true }).click()
  await expect(page.getByText(/복원할 백업:/)).toBeVisible()
  await expect(page.getByText(/백업 이후에 추가하거나 변경한 계정/)).toBeVisible()
  const restore = page.getByRole("button", { name: "복원하기", exact: true })
  await expect(restore).toBeDisabled()
  await page.getByLabel(/확인하려면 백업 시각/).fill(hour)
  await restore.click()
  await expect(page.getByText("백업으로 복원했어요.")).toBeVisible()
})

test("a visitor sees made-up shops and the example groups on the nearby tabs", async ({ page }) => {
  // 가까운 매장과 단체는 계정의 캠퍼스나 매장에 달려 있으므로, 방문자는
  // 안내문 아래에 예시를 전부 본다. 테스트 서버에는 지도 키가 없고, 만들어진
  // 매장은 키가 필요 없다.
  await page.goto("/matches")
  await page.getByRole("tab", { name: "학교 앞 가게" }).click()
  await expect(page.getByRole("note")).toContainText("학교마다 근처 가게가 달라요")
  await expect(page.getByText("삼육대학교 근처에 있다고 가정해 만든 예시 가게예요. 가까운 순서예요.")).toBeVisible()
  await expect(page.getByText("예시로 만든 가게예요. 실제 가게나 카카오의 정보가 아니에요.")).toBeVisible()
  // 가장 가까운 만들어진 매장에는 Kakao Map 페이지가 없고, 초대하려면 로그인하라고 묻는다.
  const shop = page.locator(".work-card").first()
  await expect(shop).toContainText("정문분식")
  await expect(shop.getByRole("link")).toHaveCount(0)
  await page.getByRole("button", { name: "학원", exact: true }).click()
  await expect(page.locator(".work-card").first()).toContainText("토익스퀘어 어학원")
  await page.getByRole("button", { name: "토익스퀘어 어학원 초대하기" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()

  await page.goto("/groups")
  await page.getByRole("tab", { name: "전체" }).click()
  await sortNearest(page)
  await expect(page.getByRole("note")).toContainText("매장마다 가까운 학생단체가 달라요")
  // 예시 단체를 데모 브랜드의 매장에서 가까운 순으로 본다.
  await expect(page.locator(".work-card").first()).toContainText("과기대 소리샘")
  await page.getByRole("note").getByRole("button", { name: "회원가입" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("the menu counts what waits for a member, and nothing for a visitor", async ({ page }) => {
  const menu = page.locator("#site-menu")
  const openMenu = () => page.getByRole("button", { name: "전체 메뉴" }).click()
  // 방문자는 데모 계정의 받은편지함을 예시로 보며, 그 수가 방문자 자신의
  // 알림처럼 읽히면 안 된다.
  for (const path of ["/offers", "/inbox"]) {
    await page.goto(path)
    await expect(page.locator(".request-card").first()).toBeVisible()
    await openMenu()
    await expect(menu.locator(".nav-menu-item").first()).toBeVisible()
    await expect(menu.locator("em")).toHaveCount(0)
    await expect(page.locator(".site-header .nav-count")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
  }
  // 로그인하면 브랜드는 자기가 답하지 않은 제안의 수를 본다.
  await logIn(page, "브랜드", "hello@afternoon-coffee.kr")
  await openMenu()
  await expect(menu.getByRole("button", { name: /받은 제안/ }).locator("em")).toBeVisible()
})

test("the bell's dot shows only while a notice is unread, and stays read on reload", async ({ page }) => {
  await page.goto("/dashboard")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  const bell = page.locator(".site-header").getByRole("button", { name: /^알림/ })
  const panel = page.getByRole("region", { name: "알림" })
  const dot = page.locator(".notification-dot")
  await expect(dot).toBeVisible()
  await expect(bell).toHaveAccessibleName(/^알림, 읽지 않은 \d+개$/)
  await bell.click()
  await expect(panel.locator("button.unread").first()).toBeVisible()
  await panel.getByRole("button", { name: "모두 읽음" }).click()
  await expect(panel.locator("button.unread")).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "모두 읽음" })).toHaveCount(0)
  await expect(dot).toHaveCount(0)
  await expect(bell).toHaveAccessibleName("알림")
  // 계정에 보관하므로 새로 고침 뒤에도 알림이 있고 모두 읽은 상태다.
  await page.reload()
  await bell.click()
  await expect(panel.locator(".notification-list > button").first()).toBeVisible()
  await expect(panel.locator("button.unread")).toHaveCount(0)
  await expect(dot).toHaveCount(0)
})

test("a member saves a brand with the heart, finds it on the 찜 tab and lets it go", async ({ page }) => {
  // 방문자가 하트를 누르면 로그인하라고 묻는다.
  await page.goto("/matches")
  await page.locator(".work-card").first().getByRole("button", { name: /찜하기$/ }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await page.goto("/matches")
  await page.getByRole("tab", { name: "전체" }).click()
  const card = page.locator(".work-card").first()
  const name = (await card.locator("h3").innerText()).trim()
  const heart = card.getByRole("button", { name: `${name} 찜하기` })
  await expect(heart).toHaveAttribute("aria-pressed", "false")
  await heart.click()
  await expect(heart).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("status")).toContainText("찜했어요")
  await page.getByRole("tab", { name: "찜" }).click()
  await expect(page.locator(".work-card")).toHaveCount(1)
  await expect(page.locator(".work-card h3")).toHaveText(name)
  // 상세 페이지는 저장된 것으로 보여 주고 놓을 수 있게 한다.
  await page.locator(".work-card h3").getByRole("button", { name }).click()
  const save = page.getByRole("button", { name: "찜하기", exact: true })
  await expect(save).toHaveAttribute("aria-pressed", "true")
  await save.click()
  await expect(save).toHaveAttribute("aria-pressed", "false")
  await page.goBack()
  await expect(page.getByText("아직 찜한 브랜드가 없어요")).toBeVisible()
})

test("a member who opens the introduction goes on to the dashboard", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto("/")
  await expect(page).toHaveURL(/\/dashboard$/)
  // 회원의 첫머리는 누구의 화면인지 한 줄과 지금 할 일이다.
  await expect(page.locator(".dash-top-who")).toHaveText("삼육대 뮤즈 · 학생단체")
  await expect(page.locator(".demo-chip")).toHaveCount(0)
})

test("the login popup logs into a demo account with one press, with nothing to type", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: /오후의 커피/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator(".dash-top-who")).toHaveText("오후의 커피 · 브랜드")
})

test("a password can be shown while it is typed, and hidden again", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  const password = dialog.getByLabel("비밀번호", { exact: true })
  await password.fill("my-pass-123")
  await expect(password).toHaveAttribute("type", "password")
  const toggle = dialog.getByRole("button", { name: "비밀번호 보기" })
  await toggle.click()
  await expect(password).toHaveAttribute("type", "text")
  await expect(password).toHaveValue("my-pass-123")
  await expect(toggle).toHaveAttribute("aria-pressed", "true")
  await toggle.click()
  await expect(password).toHaveAttribute("type", "password")
})

test("sent proposals sit apart from received ones, by how far they got, and are taken back there", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-sender@syu.ac.kr", "보내는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-receiver@receiver-cafe.kr", "받는 카페")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "보내는 공연", date: today, people: "80명", types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/offers")
  // 받은 제안의 건수에는 보낸 것이 섞이지 않는다.
  const direction = page.getByRole("group", { name: "제안 방향" })
  await expect(direction.getByRole("button", { name: /받은 제안/ })).toContainText("0")
  await expect(direction.getByRole("button", { name: /보낸 제안/ })).toContainText("1")
  await direction.getByRole("button", { name: /보낸 제안/ }).click()
  const sentPart = page.locator(".inbox-part", { has: page.getByRole("heading", { name: /답변 대기/ }) })
  const card = sentPart.locator(".request-card", { hasText: "받는 카페" })
  await expect(card).toContainText("보내는 공연")
  await expect(card).toContainText("상대에게 전달됐어요")
  // 한 번 더 묻고 나면 사라진다.
  await card.getByRole("button", { name: "제안 취소" }).click()
  await card.getByRole("button", { name: "제안 취소" }).click()
  await expect(sentPart.locator(".request-card")).toHaveCount(0)
  await expect(page.getByText("받는 카페에 보낸 제안을 취소했어요.")).toBeVisible()
  // 브랜드가 떠나므로 이후 사례는 이 사례의 회원 브랜드를 보지 않는다.
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: brand.headers })
  expect(left.status()).toBe(204)
})

test("an event is edited from 내 행사, and one that has begun keeps its dates", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-editor@syu.ac.kr", "고치는 동아리")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "고칠 공연", date: today, people: "80명", types: ["현금"] }, headers: group.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/events")
  await page.getByRole("button", { name: "고칠 공연 수정" }).click()
  await expect(page).toHaveURL(/\/edit\//)
  await expect(page.getByRole("heading", { name: "행사 수정" })).toBeVisible()
  // 오늘 시작했으므로 날짜는 그대로 둔다.
  await expect(page.getByText("이미 시작한 행사라 일정은 바꿀 수 없어요.")).toBeVisible()
  await expect(page.getByLabel("행사명")).toHaveValue("고칠 공연")
  await page.getByLabel("행사명").fill("고친 공연")
  await page.getByRole("button", { name: "저장하기" }).click()
  await expect(page.getByText("행사 정보를 고쳤어요.")).toBeVisible()
  await expect(page.locator(".day-event-card", { hasText: "고친 공연" })).toBeVisible()
  // 단체가 떠나므로 이후 사례는 이 사례의 회원 단체를 보지 않는다.
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("the brand notes the parcel it sent on the agreement, and the group tracks it", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-parcel@syu.ac.kr", "택배 받는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-parcel@parcel-cafe.kr", "택배 보내는 카페")
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 9 * 86_400_000))
  await request.post("/api/events", { data: { name: "택배 공연", date, types: ["제품"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  const id = requests[0].id
  await request.post(`/api/requests/${id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto(`/agreements/${id}`)
  // 계약서는 계약처럼 읽힌다. 아홉 조항과 양쪽의 서명이 있다.
  const terms = page.getByRole("region", { name: /계약 조항/ })
  await expect(terms.locator(".contract-articles li")).toHaveCount(9)
  await expect(terms.locator(".contract-articles")).toContainText("제1조 (목적)")
  await expect(terms.locator(".contract-sign")).toHaveCount(2)
  const panel = page.getByRole("region", { name: "협찬 물품 배송" })
  await panel.getByLabel("택배사").selectOption("우체국택배")
  await panel.getByLabel("운송장 번호").fill("6070 1234 5678")
  await panel.getByLabel("메모 (선택)").fill("음료 2박스")
  await panel.getByRole("button", { name: "배송 남기기" }).click()
  await expect(page.getByText("배송을 남겼어요. 상대에게 알렸어요.")).toBeVisible()
  await expect(panel.locator(".shipment-list")).toContainText("우체국택배 · 607012345678")
  await expect(panel.getByRole("link", { name: "배송 조회" })).toHaveAttribute("href", /search\.naver\.com.*607012345678/)

  // 단체는 보지만 브랜드의 소포를 뺄 방법은 없다.
  const groupPage = await (await browser.newContext()).newPage()
  await groupPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await groupPage.goto(`/agreements/${id}`)
  const seen = groupPage.getByRole("region", { name: "협찬 물품 배송" })
  await expect(seen.locator(".shipment-list")).toContainText("택배 보내는 카페에서 보냄")
  await expect(seen.getByRole("button", { name: /배송 지우기/ })).toHaveCount(0)
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("the group posts its SNS link, the brand asks again and then confirms it", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-post@syu.ac.kr", "게시물 올리는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-post@post-cafe.kr", "게시물 보는 카페")
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 9 * 86_400_000))
  await request.post("/api/events", { data: { name: "게시물 공연", date, types: ["제품"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  const id = requests[0].id
  await request.post(`/api/requests/${id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/agreements/${id}`)
  const panel = page.getByRole("region", { name: "SNS 게시물 확인" })
  await panel.getByLabel("게시물 링크").fill("https://www.instagram.com/p/uniconnect/")
  await panel.getByLabel("도달 수").fill("1200")
  await panel.getByRole("button", { name: "게시물 올리기" }).click()
  await expect(page.getByText("게시물을 올렸어요. 브랜드가 확인하면 도달에 들어가요.")).toBeVisible()
  await expect(panel.locator(".agreement-post-sum")).toHaveText("확인된 도달 0명 · 확인 전 1,200명")
  await panel.getByLabel("캡처 올리기").setInputFiles({
    name: "reach.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  })
  await expect(page.getByText("캡처를 올렸어요.")).toBeVisible()

  // The brand sees it waiting, and sends it back with a reason.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto(`/agreements/${id}`)
  const check = brandPage.getByRole("region", { name: "SNS 게시물 확인" })
  await expect(check.locator(".agreement-post-state")).toHaveText("확인 전")
  await expect(check.locator(".agreement-photos img")).toBeVisible()
  await expect(check.getByLabel("게시물 링크")).toHaveCount(0)
  await check.getByRole("button", { name: "다시 요청" }).click()
  await check.getByLabel("다시 요청하는 이유").fill("도달 수가 보이지 않아요")
  await check.getByRole("button", { name: "보내기" }).click()
  await expect(check.locator(".agreement-post-state")).toHaveText("다시 요청")

  // The group corrects it, and once the brand confirms it counts in the report.
  await page.reload()
  await expect(panel).toContainText("다시 요청한 이유: 도달 수가 보이지 않아요")
  await panel.getByRole("button", { name: "고치기" }).click()
  await panel.getByLabel("도달 수").fill("1500")
  await panel.getByRole("button", { name: "고쳐서 다시 보내기" }).click()
  await expect(page.getByText("게시물을 고쳐서 다시 보냈어요.")).toBeVisible()
  await brandPage.reload()
  await check.getByRole("button", { name: "확인", exact: true }).click()
  await expect(check.locator(".agreement-post-sum")).toHaveText("확인된 도달 1,500명 · 확인 전 0명")
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a group proposes a meeting in a conversation, and the brand accepts and saves it", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-meet@syu.ac.kr", "미팅하는 동아리")
  await request.put("/api/profile", { data: { intro: "캠퍼스 동아리예요.", offer: "관객 100명" }, headers: group.headers })
  const brand = await signUpMember(request, "브랜드", "e2e-meet@meet-cafe.kr", "미팅하는 카페")
  const chat = (await (await request.post("/api/conversations", { data: { partnerId: brand.listingId }, headers: group.headers })).json()) as {
    conversation: { id: string }
  }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 4 * 86_400_000))

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/messages/${chat.conversation.id}`)
  await page.getByRole("button", { name: "미팅 잡기" }).click()
  const form = page.getByRole("form", { name: "미팅 잡기" })
  await form.getByLabel("날짜").fill(day)
  await form.getByLabel("시작 시각").fill("15:00")
  await form.getByLabel("미팅 시간").selectOption("30")
  await form.getByLabel("장소 또는 화상 회의 링크").fill("학생회관 2층 카페")
  await form.getByRole("button", { name: "미팅 제안 보내기" }).click()
  await expect(page.locator(".meeting-card")).toContainText("답을 기다려요")
  await expect(page.locator(".meeting-card")).toContainText("학생회관 2층 카페")

  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto(`/messages/${chat.conversation.id}`)
  const card = brandPage.locator(".meeting-card")
  await card.getByRole("button", { name: "수락" }).click()
  await expect(card).toContainText("확정된 미팅")
  await expect(card.getByRole("link", { name: "Google 캘린더에 추가" })).toHaveAttribute("href", /calendar\.google\.com.*dates=/)
  const file = brandPage.waitForEvent("download")
  await card.getByRole("button", { name: "캘린더 파일로 저장" }).click()
  expect((await file).suggestedFilename()).toBe(`uniconnect-meeting-${day}.ics`)
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a group publishes its sponsorship ledger from 리포트, and anyone with the link reads it", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-ledger@syu.ac.kr", "결산하는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-ledger@ledger-cafe.kr", "결산 카페")
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 6 * 86_400_000))
  await request.post("/api/events", { data: { name: "결산 공연", date, types: ["제품"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  await request.post(`/api/requests/${requests[0].id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/reports")
  const card = page.locator(".ledger-card")
  await card.getByRole("button", { name: "공개 링크 만들기" }).click()
  await expect(page.getByText("공개 링크를 만들었어요.")).toBeVisible()
  await card.getByLabel("결산 카페 협찬의 쓰임 메모").fill("음료를 부스에서 나눴어요.")
  await card.getByRole("button", { name: "저장" }).click()
  await expect(page.getByText("메모를 저장했어요.")).toBeVisible()
  const link = (await card.locator(".invite-link").textContent()) ?? ""
  expect(link).toMatch(/\/ledger\/[\w-]+$/)
  // 기수: the team in charge, under the record.
  await page.getByRole("button", { name: "기수 관리" }).click()
  await page.getByLabel("기수 이름").fill("제4대 결산")
  await page.getByLabel("시작한 날").fill("2026-01-01")
  await page.getByRole("button", { name: "기수 추가" }).click()
  await expect(page.getByText("기수를 저장했어요.")).toBeVisible()
  await expect(page.locator(".terms-list")).toContainText("제4대 결산")

  const reader = await (await browser.newContext()).newPage()
  await reader.goto(new URL(link).pathname)
  await expect(reader.getByRole("heading", { level: 1 })).toHaveText("결산하는 동아리 협찬 결산")
  await expect(reader.locator(".ledger-list")).toContainText("결산 카페")
  await expect(reader.locator(".ledger-list")).toContainText("음료를 부스에서 나눴어요.")
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("on the event day a group saves a thank-you card image from the agreement", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-thanks@syu.ac.kr", "감사하는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-thanks@thanks-cafe.kr", "고마운 카페")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "오늘 공연", date: today, types: ["제품"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  await request.post(`/api/requests/${requests[0].id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/agreements/${requests[0].id}`)
  const panel = page.getByRole("region", { name: "협찬 감사 카드뉴스" })
  await expect(panel).toContainText("고마운 카페")
  const image = page.waitForEvent("download")
  await panel.getByRole("button", { name: "카드뉴스 이미지 저장" }).click()
  expect((await image).suggestedFilename()).toBe(`uniconnect-thanks-${today}.png`)
  await expect(page.getByText("카드뉴스 이미지를 저장했어요.")).toBeVisible()
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a brand replaces its store PIN during the event, and the old one stops at once", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-newpin@syu.ac.kr", "PIN 바꾸는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-newpin@newpin-cafe.kr", "PIN 바꾸는 카페")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "PIN 공연", date: today, types: ["제품"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  await request.post(`/api/requests/${requests[0].id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto(`/agreements/${requests[0].id}`)
  const venue = page.locator(".venue-access")
  const shown = venue.locator("span strong").first()
  const old = (await shown.textContent())!
  await venue.getByRole("button", { name: "PIN 바꾸기" }).click()
  await expect(venue).toContainText("지금 PIN은 바로 막혀요.")
  await venue.getByRole("button", { name: "새 PIN으로 바꾸기" }).click()
  await expect(page.getByText("새 PIN을 만들었어요. 지금까지 쓰던 PIN은 막혔어요.")).toBeVisible()
  await expect(shown).not.toHaveText(old)
  await expect(venue.getByRole("button", { name: "PIN 바꾸기" })).toBeVisible()

  const code = (await venue.locator("a").getAttribute("href"))!.match(/check-in\/([\w-]+)/)![1]
  expect((await request.post(`/api/check-in/${code}/staff/session`, { data: { pin: old } })).status()).toBe(403)
  expect((await request.post(`/api/check-in/${code}/staff/session`, { data: { pin: await shown.textContent() } })).status()).toBe(200)
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a sponsorship is called off from its agreement once the other side agrees", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-calloff@syu.ac.kr", "취소하는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-calloff@calloff-cafe.kr", "취소하는 카페")
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 7 * 86_400_000))
  await request.post("/api/events", { data: { name: "취소될 공연", date, types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  const id = requests[0].id
  await request.post(`/api/requests/${id}/accept`, { headers: brand.headers })
  await request.post(`/api/agreements/${id}/cancel`, { data: { reason: "매장 공사로 협찬이 어려워요." }, headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/agreements/${id}`)
  const panel = page.getByRole("region", { name: "협찬 취소" })
  await expect(panel).toContainText("취소하는 카페에서 협찬 취소를 요청했어요.")
  await expect(panel).toContainText("이유: 매장 공사로 협찬이 어려워요.")
  // 되돌릴 수 없으므로 동의하려면 한 번 더 묻는다.
  await panel.getByRole("button", { name: "취소에 동의" }).click()
  await panel.getByRole("button", { name: "취소에 동의" }).click()
  await expect(page.getByRole("status").getByText("협찬을 취소했어요.", { exact: true })).toBeVisible()
  await expect(page.locator(".agreement-state.canceled")).toHaveText("취소된 협찬")
  await expect(page.getByRole("button", { name: "이 내용으로 확인하기" })).toHaveCount(0)
  // 둘 다 떠나므로 이후 사례는 이 사례의 회원을 보지 않는다.
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a member reports and blocks a partner from its profile, and unblocks it in 내 정보", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-safety@syu.ac.kr", "신고하는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-safety@safety-cafe.kr", "신고된 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/matches/${brand.listingId}`)

  await page.locator(".profile-safety").getByRole("button", { name: "신고하기" }).click()
  const report = page.getByRole("dialog")
  await report.getByRole("radio", { name: "사기 의심" }).click()
  await report.getByLabel("덧붙일 말 (선택)").fill("선입금을 요구했어요.")
  await report.getByRole("button", { name: "신고 보내기" }).click()
  await expect(page.getByText("신고했어요. 운영자가 확인할게요.")).toBeVisible()

  await page.locator(".profile-safety").getByRole("button", { name: "차단하기" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "차단하기" }).click()
  await expect(page.getByText("차단했어요. 내 정보에서 풀 수 있어요.")).toBeVisible()
  // 차단한 브랜드는 카탈로그에서 사라졌다.
  await page.goto("/matches")
  await page.waitForLoadState("networkidle")
  await expect(page.locator(".work-card", { hasText: "신고된 카페" })).toHaveCount(0)

  await page.goto("/me")
  await page.locator(".blocked-list li", { hasText: "신고된 카페" }).getByRole("button", { name: "차단 풀기" }).click()
  await expect(page.getByText("신고된 카페의 차단을 풀었어요.")).toBeVisible()
  // 둘 다 떠나므로 이후 사례는 이 사례의 회원을 보지 않는다.
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a brand's 내 정보 offers the business check once the server has its key", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-business@business-cafe.kr", "확인할 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/me")
  // 테스트 서버에는 NTS_SERVICE_KEY가 없으므로 아직 내놓지 않는다.
  const row = page.locator(".settings-row", { has: page.getByText("사업자 확인", { exact: true }) })
  await expect(row).toContainText("아직 준비 중이에요")
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: brand.headers })
  expect(left.status()).toBe(204)
})

test("a member hides its listing from 내 정보 and shows it again from the dashboard", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-pause@pause-cafe.kr", "쉬는 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/me")
  const toggle = page.getByRole("switch", { name: "목록에서 숨기기" })
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await toggle.click()
  await expect(page.getByText("내 소개를 숨겼어요. 상대 목록에 보이지 않고 새 제안을 받지 않아요.")).toBeVisible()
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  // 대시보드의 히어로가 그렇게 알리고, 한 번 눌러 되살린다.
  await page.goto("/dashboard")
  await expect(page.getByText("내 소개를 숨기는 중이에요.")).toBeVisible()
  await page.getByRole("button", { name: "다시 보이게 하기" }).click()
  await expect(page.getByText("내 소개가 다시 상대 목록에 보여요.")).toBeVisible()
  await expect(page.getByText("내 소개를 숨기는 중이에요.")).toHaveCount(0)
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: brand.headers })
  expect(left.status()).toBe(204)
})

test("a new member's dashboard lists what to fill in, and folds it for later", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-checklist@syu.ac.kr", "새내기 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/dashboard")
  const checklist = page.getByRole("region", { name: "소개를 채울수록 잘 맞는 상대를 찾아 드려요" })
  const progress = checklist.getByRole("progressbar", { name: "소개 완성도" })
  await expect(progress).toHaveAttribute("aria-valuenow", "0")
  // 마지막은 첫 제안이다. 누르면 추천으로 간다.
  await expect(checklist.getByRole("listitem")).toHaveCount(7)
  await expect(checklist.getByRole("listitem").last()).toContainText("첫 제안")
  await checklist.getByRole("button", { name: "소개 쓰기" }).click()
  await expect(page).toHaveURL(/\/me\/edit$/)
  // 등록한 행사는 그 단계를 확인한다.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "첫 공연", date: today, types: ["현금"] }, headers: group.headers })
  await page.goto("/dashboard")
  await expect(progress).toHaveAttribute("aria-valuenow", "1")
  // 나중에 folds it to one line, kept after a reload.
  await checklist.getByRole("button", { name: "나중에" }).click()
  const folded = page.getByRole("region", { name: "소개 완성 체크리스트" })
  await expect(folded).toContainText("1/7 완료")
  await page.reload()
  await folded.getByRole("button", { name: "펼치기" }).click()
  await expect(checklist).toBeVisible()
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("the report and the analytics download as CSV files that Excel opens", async ({ page }) => {
  // 방문자는 데모 단체의 리포트와 데모 브랜드의 분석을 본다. 분석은 예시라고
  // 적힌 파일로 내려받는다(e2e/examples.spec.ts).
  for (const [path, button, name, first] of [
    ["/reports", "CSV로 내보내기", /^uniconnect-report-\d{4}-\d{2}-\d{2}\.csv$/, "행사,"],
    ["/analytics", "예시 CSV 다운로드", /^uniconnect-analytics-sample-\d{4}-\d{2}-\d{2}\.csv$/, "데이터 구분,단체,행사,날짜,"],
  ] as const) {
    await page.goto(path)
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: button }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(name)
    const text = await readFile(await file.path(), "utf8")
    // 엑셀이 UTF-8로 읽도록 바이트 순서 표식을 맨 앞에 둔다.
    expect(text.startsWith(`\uFEFF${first}`)).toBe(true)
    expect(text).toContain("\r\n")
  }
})

test("the report page keeps the sponsorship record, handed over as a CSV file", async ({ page }) => {
  await page.goto("/reports")
  const record = page.getByRole("table", { name: "협찬 기록" })
  // 머리 행은 폰에서 접히고, 행사마다의 행이 그 리포트를 연다.
  await expect(record.getByRole("row").filter({ has: page.getByRole("button") }).first()).toBeVisible()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "인수인계용 CSV" }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe("uniconnect-sponsorship-history.csv")
  const text = await readFile(await file.path(), "utf8")
  expect(text.startsWith("\uFEFF기수,행사,시작일,종료일,협찬사,")).toBe(true)
})

test("공유하기 copies the page's link where the browser has no share sheet", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }))
  await page.goto("/matches/afternoon-coffee")
  await page.getByRole("button", { name: "공유하기" }).click()
  await expect(page.getByRole("button", { name: "링크를 복사했어요" })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/matches\/afternoon-coffee$/)
})

test("a visitor lays two brands side by side, and opens one from the table", async ({ page }) => {
  await page.goto("/matches")
  await page.getByRole("tab", { name: "전체" }).click()
  const toggles = page.getByRole("button", { name: /비교에 담기$/ })
  await toggles.nth(0).click()
  const tray = page.getByRole("region", { name: "비교함" })
  await expect(tray).toContainText("하나 더 담으면 비교할 수 있어요.")
  await expect(tray.getByRole("button", { name: "나란히 비교하기" })).toBeDisabled()
  await toggles.nth(1).click()
  await tray.getByRole("button", { name: "나란히 비교하기" }).click()
  const table = page.getByRole("dialog", { name: "브랜드 2곳 비교" })
  await expect(table.getByRole("rowheader", { name: "추천 지수" })).toBeVisible()
  await expect(table.getByRole("columnheader")).toHaveCount(2)
  await table.getByRole("button", { name: "상세 보기" }).first().click()
  await expect(page).toHaveURL(/\/matches\/[^/]+$/)
})

test("a group opens other groups' events from its calendar, and one event's page from there", async ({ page }) => {
  await page.goto("/events")
  // 캘린더 위의 요약은 다음 행사로 시작한다.
  const summary = page.getByRole("region", { name: "일정 요약" })
  await expect(summary.locator(".events-next strong")).not.toBeEmpty()
  await expect(summary.locator(".events-counts div")).toHaveCount(4)
  await page.getByRole("button", { name: "다른 단체 행사 보기" }).click()
  await expect(page).toHaveURL(/\/explore$/)
  await expect(page.getByRole("heading", { level: 1, name: "다른 단체 행사 둘러보기" })).toBeVisible()
  const first = page.locator(".post-card h3 button").first()
  const name = (await first.textContent()) ?? ""
  await first.click()
  await expect(page).toHaveURL(/\/event\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
})

test("both dashboards show what sets uniconnect apart, before and after", async ({ page }) => {
  await page.goto("/dashboard")
  const why = page.getByRole("region", { name: "연결에서 끝나지 않고 협찬을 끝까지 함께해요" })
  await expect(why.getByRole("heading", { name: "이렇게 바뀌어요" })).toBeVisible()
  await expect(why.locator(".why-pillars li")).toHaveCount(4)
  // 아직 회원이 너무 적어 집계를 보여 주지 않는다.
  await expect(why.locator(".why-counts")).toHaveCount(0)
  await page.getByRole("button", { name: "전체 메뉴" }).click()
  await page.getByRole("dialog", { name: "전체 메뉴" }).getByRole("button", { name: "브랜드 화면" }).click()
  await expect(page.getByRole("region", { name: "캠퍼스 협찬, 보낸 만큼 돌아왔는지 확인하세요" })).toBeVisible()
})

test("a member subscribes calendar apps to a link, and a new link stops the old one", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-feed@syu.ac.kr", "구독 동아리")
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 5 * 86_400_000))
  await request.post("/api/events", { data: { name: "구독 공연", date: day, types: ["현금"] }, headers: group.headers })
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/events")
  await page.getByRole("button", { name: "캘린더에 추가" }).click()
  const sheet = page.getByRole("dialog")
  await sheet.getByRole("button", { name: "구독 링크 만들기" }).click()
  const address = sheet.getByRole("textbox", { name: "구독 링크 주소" })
  await expect(address).toHaveValue(/\/api\/calendar\/[\w-]{32}\.ics$/)
  const url = await address.inputValue()
  // 캘린더 앱은 로그인 없이 읽는다.
  const feed = await request.get(url)
  expect(feed.status()).toBe(200)
  expect(await feed.text()).toContain("SUMMARY:구독 공연")
  await expect(sheet.getByRole("link", { name: "Apple · Outlook에서 구독" })).toHaveAttribute("href", url.replace(/^https?:/, "webcal:"))
  // 두 번 요청한 새 링크는 옛 링크를 멈춘다.
  await sheet.getByRole("button", { name: "새 링크로 바꾸기" }).click()
  await sheet.getByRole("button", { name: "새 링크 만들기" }).click()
  await expect(address).not.toHaveValue(url)
  expect((await request.get(url)).status()).toBe(404)
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("a member finds its invitation link in 내 정보, and a visitor arriving by it keeps the code for sign-up", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-invite@syu.ac.kr", "초대하는 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/me")
  const card = page.getByRole("region", { name: "친구 초대" })
  const link = (await card.locator(".invite-link").textContent()) ?? ""
  expect(link).toMatch(/\/\?ref=[A-Z2-9]{8}$/)
  await expect(card).toContainText("가입 0곳 · 보상 0곳 · 확인 중 0곳")
  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(new URL(link).pathname + new URL(link).search)
  expect(await visitor.evaluate(() => sessionStorage.getItem("uniconnect-ref"))).toBe(new URL(link).searchParams.get("ref"))
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("an operator logs in with a password and a code, sees its recovery codes once, and a shared token opens the operators screen", async ({ page, request }) => {
  const headers = { "X-Admin-Token": "e2e-admin-token" }
  const email = "e2e-operator@uniconnect.test"
  const added = await request.post("/api/admin/operators", { headers, data: { email, name: "첫 운영자", password: "Operator-pass-1!" } })
  expect(added.status()).toBe(201)
  const { operator } = (await added.json()) as { operator: { id: string } }
  await page.goto("/admin")
  await page.getByLabel("이메일").fill(email)
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-pass-123!")
  await page.getByRole("button", { name: "2단계 인증으로" }).click()
  await expect(page.getByRole("alert")).toBeVisible()
  await page.getByLabel("비밀번호", { exact: true }).fill("Operator-pass-1!")
  await page.getByRole("button", { name: "2단계 인증으로" }).click()
  await expect(page.getByRole("img", { name: "인증 앱에 등록할 QR 코드" })).toBeVisible()
  // 2단계를 실제로 마치면 공유 토큰이 닫혀 다른 테스트가 막히므로 그 답만 흉내 낸다.
  await page.route("**/api/admin/session/code", (route) =>
    route.fulfill({ json: { token: "e2e-admin-token", expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(), operator, recoveryCodes: ["AAAA-BBBB", "CCCC-DDDD"] } }),
  )
  await page.getByLabel("코드", { exact: true }).fill("123456")
  await page.getByRole("button", { name: "확인" }).click()
  await expect(page.getByText("AAAA-BBBB")).toBeVisible()
  // 로그인 뒤 로딩이 한 번 실패해도 코드 화면으로 돌아가지 않고 다시 불러온다.
  let failed = false
  await page.route("**/api/admin/overview", (route) => {
    if (failed) return route.fallback()
    failed = true
    return route.fulfill({ status: 500, json: { message: "잠시 후 다시 시도해 주세요." } })
  })
  const enter = page.getByRole("button", { name: "콘솔로 들어가기" })
  await expect(enter).toBeDisabled()
  await page.getByLabel("복구 코드를 안전한 곳에 저장했어요").check()
  await enter.click()
  await page.getByRole("button", { name: "다시 불러오기" }).click()
  await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  await page.goto("/admin?view=operators")
  const row = page.getByRole("row", { name: /첫 운영자/ })
  await expect(row).toContainText("첫 로그인 전")
  await row.getByRole("button", { name: "첫 운영자 끄기" }).click()
  await expect(row).toContainText("꺼짐")
})

test("a member chooses which notice emails come, and the choice stays", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-mail@syu.ac.kr", "메일 고르는 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/me")
  const choices = page.getByRole("group", { name: "받을 메일" })
  const messages = choices.getByRole("checkbox", { name: /새 메시지/ })
  await expect(messages).toBeChecked()
  await messages.uncheck()
  await expect(page.getByText("받을 메일을 바꿨어요.")).toBeVisible()
  await page.reload()
  await expect(messages).not.toBeChecked()
  await expect(choices.getByRole("checkbox", { name: /협찬 제안과 답/ })).toBeChecked()
  const me = (await (await request.get("/api/auth/me", { headers: group.headers })).json()) as { account: { mailOff?: string[] } }
  expect(me.account.mailOff).toEqual(["messages"])
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("a group writes its event page on the form, adds a photo, and a brand reads it", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-page@syu.ac.kr", "페이지 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-page@page-cafe.kr", "페이지 카페")
  // 단체에 리스팅이 생기면 그 페이지가 브랜드에게 보인다.
  await request.put("/api/profile", { data: { intro: "캠퍼스 공연 동아리예요.", offer: "관객 100명" }, headers: group.headers })
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 14 * 86_400_000))
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/new?date=${day}`)
  await page.getByLabel("행사명").fill("페이지 공연")
  await page.locator("label.check-row", { hasText: "행사 운영비 지원" }).click()
  await page.getByLabel("행사 유형").selectOption("공연")
  await page.getByLabel("예산").fill("300000")
  await page.getByLabel("시작 시각").selectOption("18:00")
  await page.getByLabel("끝나는 시각").selectOption("21:30")
  await page.locator("label.check-row", { hasText: "1학년" }).click()
  await page.getByLabel("주요 전공").fill("실용음악")
  await page.getByLabel("장소", { exact: true }).fill("삼육대학교 대강당")
  await page.getByLabel(/행사 소개/).fill("밴드 다섯 팀의 종강 공연이에요.")
  await page.getByRole("button", { name: "묶음 추가" }).click()
  await page.getByLabel("묶음 이름", { exact: true }).fill("메인 스폰서")
  await page.getByLabel("브랜드가 받는 것", { exact: true }).fill("무대 현수막 로고")
  await page.getByLabel("원하는 협찬", { exact: true }).fill("현금 30만원")
  // 홍보 계획은 등록하기 전에 단체의 동의가 필요하다.
  await page.locator("label.check-row", { hasText: "현수막" }).first().click()
  await page.locator("label.check-row", { hasText: "협찬 게시물 1회" }).click()
  await page.getByRole("button", { name: "등록하고 매칭 받기" }).click()
  await expect(page.getByRole("alert")).toHaveText("고른 홍보 · 배포 계획을 이행하는 데 동의해 주세요.")
  await page.locator("label.check-row", { hasText: "고른 홍보를 이행할게요" }).click()
  await page.getByRole("button", { name: "등록하고 매칭 받기" }).click()
  // The calendar's 상세 보기 opens the event's page.
  await page.locator(".day-event-card", { hasText: "페이지 공연" }).getByRole("button", { name: "상세 보기" }).click()
  await expect(page).toHaveURL(/\/event\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("페이지 공연")
  await expect(page.locator(".event-facts")).toContainText("삼육대학교 대강당")
  await expect(page.locator(".event-intro")).toHaveText("밴드 다섯 팀의 종강 공연이에요.")
  await expect(page.locator(".event-packages")).toContainText("무대 현수막 로고")
  await expect(page.locator(".event-facts")).toContainText("18:00 ~ 21:30")
  await expect(page.locator(".event-kind")).toHaveText("공연")
  await expect(page.locator(".event-facts")).toContainText("예산 30만원")
  await expect(page.locator(".event-makeup")).toContainText("1학년")
  await expect(page.locator(".event-promo")).toContainText("현수막")
  await expect(page.locator(".event-promo")).toContainText("협찬 게시물 1회")
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  await page.locator(".event-photo-add input").setInputFiles({ name: "stage.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") })
  await expect(page.getByRole("img", { name: "페이지 공연 사진" })).toBeVisible()
  // 기획안 PDF를 페이지에 올리면 브랜드가 내려받는다.
  await page
    .locator("label", { hasText: "기획안 올리기" })
    .locator("input")
    .setInputFiles({ name: "종강공연 기획안.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nplan\n%%EOF") })
  await expect(page.getByText("기획안을 올렸어요.")).toBeVisible()
  // 단체는 페이지에서 제안서 PDF를 만든다.
  const proposal = page.waitForEvent("download")
  await page.getByRole("button", { name: "제안서 PDF" }).click()
  // 파일 이름에 행사 이름과 만든 날이 들어가고, 페이지 그림 위에 한글 글꼴로 쓴 글자 층이
  // 있어 PDF에서 검색 · 복사할 수 있다(글꼴 파일이 들어 있다).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  const proposalFile = await proposal
  expect(proposalFile.suggestedFilename()).toBe(`uniconnect-협찬 제안서-페이지 공연-${today}.pdf`)
  const pdfBytes = await readFile(await proposalFile.path())
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-")
  expect(pdfBytes.includes("/FontFile2")).toBe(true)
  await expect(page.getByText("제안서를 PDF로 저장했어요.")).toBeVisible()
  // 복제 opens the form with everything but the dates filled in.
  await page.getByRole("button", { name: "복제해서 새로 등록" }).click()
  await expect(page).toHaveURL(/\/new\?date=[\d-]+&from=/)
  await expect(page.getByLabel("행사명")).toHaveValue("페이지 공연")
  await expect(page.getByLabel("장소", { exact: true })).toHaveValue("삼육대학교 대강당")
  await expect(page.getByLabel("브랜드가 받는 것", { exact: true })).toHaveValue("무대 현수막 로고")
  await page.goBack()
  await expect(page).toHaveURL(/\/event\/[^/]+$/)

  // 브랜드 회원은 같은 페이지를 읽고 단체의 프로필로 간다.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto(new URL(page.url()).pathname)
  await expect(brandPage.locator(".event-packages")).toContainText("메인 스폰서")
  await expect(brandPage.getByRole("img", { name: "페이지 공연 사진" })).toBeVisible()
  await expect(brandPage.getByRole("button", { name: "행사 수정" })).toHaveCount(0)
  await expect(brandPage.getByRole("button", { name: "제안서 PDF" })).toHaveCount(0)
  const plan = brandPage.waitForEvent("download")
  await brandPage.getByRole("button", { name: /종강공연 기획안\.pdf/ }).click()
  expect((await plan).suggestedFilename()).toBe("종강공연 기획안.pdf")
  await expect(brandPage.getByRole("button", { name: "기획안 지우기" })).toHaveCount(0)
  await brandPage.getByRole("button", { name: "단체 프로필 보기" }).click()
  await expect(brandPage).toHaveURL(/\/groups\//)
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a club links to its student council with the code, and the council sees it until it unlinks", async ({ page, request, browser }) => {
  const council = await signUpMember(request, "학생단체", "e2e-council@syu.ac.kr", "총학생회 e2e", "총학생회")
  const club = await signUpMember(request, "학생단체", "e2e-council-club@syu.ac.kr", "소속 밴드")
  await request.put("/api/profile", { data: { intro: "캠퍼스 밴드예요.", offer: "관객 100명" }, headers: club.headers })
  await request.post("/api/events", { data: { name: "소속 밴드 공연", date: "2099-05-01", types: ["현금"] }, headers: club.headers })

  // The council finds its code from 내 정보.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), council.token)
  await page.goto("/me")
  await page.getByRole("button", { name: "소속 단체 보기" }).click()
  await expect(page).toHaveURL(/\/council$/)
  await expect(page.getByText("아직 연결한 단체가 없어요")).toBeVisible()
  const code = await page.locator(".council-code strong").innerText()

  // The club links with it from its own 내 정보.
  const clubPage = await (await browser.newContext()).newPage()
  await clubPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), club.token)
  await clubPage.goto("/me")
  await clubPage.getByRole("button", { name: "학생회 연결" }).click()
  const link = clubPage.getByRole("dialog", { name: "학생회 연결" })
  await link.getByLabel("학생회 코드").fill(code)
  await link.getByRole("button", { name: "연결하기" }).click()
  await expect(link.locator(".device-list")).toContainText("총학생회 e2e")

  // 총학생회는 동아리와 그 다가오는 행사를 보되 사적인 것은 보지 않는다.
  await page.reload()
  const card = page.locator(".council-club")
  await expect(card).toContainText("소속 밴드")
  await expect(card.locator(".council-events")).toContainText("소속 밴드 공연")

  // 연결을 끊으면 사라진다.
  await link.getByRole("button", { name: "연결 끊기" }).click()
  await expect(link.locator(".device-list")).toHaveCount(0)
  await page.reload()
  await expect(page.getByText("아직 연결한 단체가 없어요")).toBeVisible()
  for (const member of [club, council]) {
    expect((await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })).status()).toBe(204)
  }
})

test("Kakao and Naver stay hidden without keys, and a return from them says how it went", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  await expect(page.getByRole("dialog", { name: "로그인" }).getByRole("button", { name: "학생단체로 로그인" })).toBeVisible()
  await expect(page.locator(".social-login")).toHaveCount(0)
  // 제공자의 답이 ?social=로 돌아오고, 한 번 알린 뒤 주소에서 사라진다.
  // 회원이 연결하지 않은 Kakao 계정은 아무도 로그인시키지 못하고 로그인이 다시 열린다.
  await page.goto("/?social=unlinked-kakao")
  await expect(
    page.getByText("카카오 계정이 연결된 회원이 없어요. 카카오 로그인은 회원가입 뒤 내 정보에서 카카오 계정을 연결해야 쓸 수 있어요."),
  ).toBeVisible()
  await expect(page.getByRole("dialog", { name: "로그인" })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test("an owner invites a co-admin, who joins with the code and can't do the owner's part", async ({ page, request, browser }) => {
  const owner = await signUpMember(request, "학생단체", "e2e-team@syu.ac.kr", "함께 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), owner.token)
  await page.goto("/me")
  await page.getByRole("button", { name: "함께 관리하는 사람" }).click()
  const team = page.getByRole("dialog")
  await expect(team.locator(".device-current")).toHaveText("대표")
  await team.getByLabel("이름", { exact: true }).fill("부회장")
  await team.getByLabel("초대할 이메일").fill("e2e-vice@syu.ac.kr")
  await team.getByRole("button", { name: "초대 코드 보내기" }).click()
  await expect(team.locator(".team-list li.pending")).toContainText("e2e-vice@syu.ac.kr")
  const code = await team.locator(".field-hint strong").innerText()

  // 초대받은 사람이 다른 브라우저의 로그인 팝업에서 합류한다.
  const vice = await (await browser.newContext()).newPage()
  await vice.goto("/")
  await vice.getByRole("button", { name: "로그인", exact: true }).first().click()
  await vice.getByRole("dialog").getByRole("button", { name: "초대받았나요?" }).click()
  const join = vice.getByRole("dialog", { name: "초대받아 함께 관리하기" })
  await join.getByLabel("초대받은 이메일").fill("e2e-vice@syu.ac.kr")
  await join.getByLabel("초대 코드").fill(code)
  await join.getByLabel("새 비밀번호", { exact: true }).fill("vice-pass-123")
  await join.getByLabel("새 비밀번호 확인").fill("vice-pass-123")
  await join.locator(".document-field input").setInputFiles({ name: "재직증명서.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 proof") })
  await expect(join.locator(".document-field")).toContainText("재직증명서.pdf")
  await join.getByRole("button", { name: "함께 관리 시작하기" }).click()
  await expect(join).toBeHidden()
  await expect(vice.getByText("서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요.")).toBeVisible()

  // 운영자가 /admin에서 서류를 읽고 승인한다.
  const console = await (await browser.newContext()).newPage()
  await console.goto("/admin")
  await console.getByText("공유 토큰으로 들어가기").click()
  await console.getByLabel("관리자 토큰").fill("e2e-admin-token")
  await console.getByRole("button", { name: "들어가기" }).click()
  await expect(console.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  await console.goto("/admin?view=approvals")
  const row = console.locator(".console-approvals li", { hasText: "e2e-vice@syu.ac.kr" })
  await expect(row).toContainText("함께 동아리 공동 관리자")
  await row.getByRole("button", { name: "승인" }).click()
  await expect(console.locator(".console-approvals li", { hasText: "e2e-vice@syu.ac.kr" })).toHaveCount(0)

  // 첫 로그인에서 2단계 로그인을 설정하며, 공동 관리자는 반드시 있어야 한다.
  await vice.getByRole("button", { name: "로그인", exact: true }).first().click()
  const login = vice.getByRole("dialog")
  await login.getByLabel("이메일").fill("e2e-vice@syu.ac.kr")
  await login.getByLabel("비밀번호", { exact: true }).fill("vice-pass-123")
  await login.getByRole("button", { name: "학생단체로 로그인" }).click()
  await expect(login.getByText("함께 관리하는 사람은 2단계 인증이 필수예요.", { exact: false })).toBeVisible()
  const secret = ((await login.locator("code").textContent()) ?? "").replace(/\s/g, "")
  await login.getByLabel("인증 코드").fill(codeAt(secret, stepAt(Date.now())))
  await login.getByRole("button", { name: "확인하고 로그인" }).click()
  await expect(login.locator(".recovery-codes li").first()).toBeVisible()
  await login.getByRole("button", { name: "적어 뒀어요" }).click()
  await expect(login).toBeHidden()

  // In 내 정보 the owner's part is gone for the co-admin.
  await vice.goto("/me")
  await expect(vice.locator(".profile-member-note")).toContainText("부회장님은 공동 관리자로 로그인했어요")
  await expect(vice.getByRole("button", { name: "회원 탈퇴" })).toHaveCount(0)
  await expect(vice.getByRole("button", { name: "로그인 이메일 바꾸기" })).toHaveCount(0)
  await expect(vice.getByRole("button", { name: /2단계 인증/ })).toHaveCount(0)

  // 주인은 공동 관리자가 합류한 것을 보고 팀에서 빼며, 그 로그인이 끝난다.
  await page.goto("/me")
  await page.getByRole("button", { name: "함께 관리하는 사람" }).click()
  const joined = page.getByRole("dialog", { name: "함께 관리하는 사람" })
  await expect(joined.locator(".team-list li")).toHaveCount(2)
  await joined.getByRole("button", { name: "빼기" }).click()
  await expect(joined.locator(".team-list li")).toHaveCount(1)
  const token = await vice.evaluate(() => localStorage.getItem("uniconnect-token"))
  expect((await request.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401)
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: owner.headers })
  expect(left.status()).toBe(204)
})

test("the catalogs show as a map around the campus or store, with search applied", async ({ page }) => {
  await page.goto("/matches")
  await page.getByRole("tab", { name: "전체" }).click()
  await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "지도" }).click()
  const map = page.locator(".catalog-map")
  await expect(map.getByRole("group", { name: "우리 학교 기준 지도" })).toBeVisible()
  const dots = map.locator(".place-dot")
  const all = await dots.count()
  expect(all).toBeGreaterThan(1)
  // 점을 누르면 지도 옆에 그 브랜드의 카드가 열린다.
  await map.getByRole("button", { name: /^오후의 커피, / }).click()
  await expect(map.locator(".nearby-map-card h3")).toHaveText("오후의 커피")
  // 매장이 없는 브랜드는 그 밑에 이름이 나오고 같은 방식으로 열린다.
  const unplaced = map.locator(".catalog-map-unplaced button")
  await expect(unplaced.first()).toBeVisible()
  const name = await unplaced.first().innerText()
  await unplaced.first().click()
  await expect(map.locator(".nearby-map-card h3")).toHaveText(name)
  // 검색은 점도 좁힌다.
  await page.getByRole("searchbox", { name: "브랜드 검색" }).fill("오후의 커피")
  await expect(dots).toHaveCount(1)

  // 브랜드도 같은 방식으로 매장 주변의 단체를 본다.
  await page.goto("/groups?role=브랜드")
  await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "지도" }).click()
  await expect(page.getByRole("group", { name: "내 매장 기준 지도" })).toBeVisible()
  await expect(page.locator(".catalog-map .place-dot").first()).toBeVisible()
})

test("a member turns on two-step login, logs in with the app's code, and sees its devices", async ({ page, request, browser }) => {
  const member = await signUpMember(request, "학생단체", "e2e-2fa@syu.ac.kr", "보안 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), member.token)
  await page.goto("/me")

  // 비밀번호, 앱의 키, 첫 코드로 켜고 복구 코드는 한 번만 보여 준다.
  await page.getByRole("button", { name: "2단계 인증 켜기" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("지금 비밀번호").fill("e2e-pass-123")
  await dialog.getByRole("button", { name: "다음" }).click()
  await expect(dialog.getByRole("img", { name: "인증 앱으로 찍을 QR 코드" })).toBeVisible()
  const secret = (await dialog.locator(".two-factor-key code").innerText()).replace(/\s/g, "")
  await dialog.getByLabel("인증 코드").fill(codeAt(secret, stepAt(Date.now())))
  await dialog.getByRole("button", { name: "확인하고 켜기" }).click()
  await expect(dialog.locator(".recovery-codes li")).toHaveCount(10)
  await dialog.getByRole("button", { name: "적어 뒀어요" }).click()
  await expect(page.getByRole("button", { name: "2단계 인증 · 켜짐" })).toBeVisible()

  // 다른 브라우저에서 로그인하면 비밀번호 뒤에 코드를 묻는다.
  const other = await (await browser.newContext()).newPage()
  await other.goto("/")
  await other.getByRole("button", { name: "로그인", exact: true }).first().click()
  const login = other.getByRole("dialog")
  await login.getByLabel("이메일").fill("e2e-2fa@syu.ac.kr")
  await login.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-123")
  await login.getByRole("button", { name: "학생단체로 로그인" }).click()
  await login.getByLabel("인증 코드").fill("000000")
  await login.getByRole("button", { name: "확인하고 로그인" }).click()
  await expect(login.getByRole("alert")).toContainText("코드가 올바르지 않아요")
  // 첫 코드는 켜는 데 썼으므로 다음 단계의 코드를 쓴다.
  await login.getByLabel("인증 코드").fill(codeAt(secret, stepAt(Date.now()) + 1))
  await login.getByRole("button", { name: "확인하고 로그인" }).click()
  await expect(login).toBeHidden()

  // 기기 목록은 이 기기와 첫 브라우저를 보여 주며 첫 브라우저를 로그아웃시킬 수 있다.
  await other.goto("/me")
  await other.getByRole("button", { name: "로그인한 기기" }).click()
  const devices = other.getByRole("dialog")
  await expect(devices.locator(".device-current")).toHaveText("이 기기")
  await expect(devices.locator(".device-list li")).toHaveCount(2)
  await devices.getByRole("button", { name: "다른 기기 모두 로그아웃" }).click()
  await expect(devices.locator(".device-list li")).toHaveCount(1)
  await expect(other.getByText("다른 기기에서 모두 로그아웃시켰어요.")).toBeVisible()
  expect((await request.get("/api/auth/me", { headers: member.headers })).status()).toBe(401)
  const token = await other.evaluate(() => localStorage.getItem("uniconnect-token"))
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: { Authorization: `Bearer ${token}` } })
  expect(left.status()).toBe(204)
})

test("an open conversation shows replies and reads as they happen", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-live@syu.ac.kr", "실시간 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-live@live-cafe.kr", "실시간 카페")
  await request.put("/api/profile", { data: { intro: "캠퍼스 공연 동아리예요.", offer: "관객 100명" }, headers: group.headers })
  const started = await request.post("/api/conversations", { data: { partnerId: brand.listingId }, headers: group.headers })
  const { conversation } = (await started.json()) as { conversation: { id: string } }
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/messages/${conversation.id}`)
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto(`/messages/${conversation.id}`)
  await expect(brandPage.getByText("첫 메시지로 궁금한 점을 물어보세요.")).toBeVisible()

  // 단체의 메시지는 몇 초 안에 브랜드의 열린 페이지에 닿고, 단체는 브랜드의
  // 페이지가 보여 주는 대로 읽힌 것을 본다.
  await page.getByLabel("보낼 메시지").fill("협찬 이야기 나눠요!")
  await page.keyboard.press("Enter")
  await expect(brandPage.getByText("협찬 이야기 나눠요!")).toBeVisible({ timeout: 2500 })
  await expect(page.locator(".chat-read")).toHaveText("읽음", { timeout: 2500 })

  // 브랜드의 답도 같은 방식으로 돌아온다.
  await brandPage.getByLabel("보낼 메시지").fill("좋아요, 언제 통화할까요?")
  await brandPage.keyboard.press("Enter")
  await expect(page.getByText("좋아요, 언제 통화할까요?")).toBeVisible({ timeout: 2500 })
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("members send each other a photo and a PDF in a conversation", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-files@syu.ac.kr", "파일 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-files@files-cafe.kr", "파일 카페")
  await request.put("/api/profile", { data: { intro: "캠퍼스 공연 동아리예요.", offer: "관객 100명" }, headers: group.headers })
  const started = await request.post("/api/conversations", { data: { partnerId: brand.listingId }, headers: group.headers })
  const { conversation } = (await started.json()) as { conversation: { id: string } }

  // 단체가 입력칸 옆의 클립으로 사진을 보낸 뒤 PDF를 보낸다.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/messages/${conversation.id}`)
  const clip = page.getByLabel("사진이나 PDF 보내기")
  await clip.setInputFiles({ name: "poster.jpg", mimeType: "image/jpeg", buffer: await readFile("frontend/src/assets/examples/groups.jpg") })
  await expect(page.getByRole("img", { name: "보낸 사진" })).toBeVisible()
  await clip.setInputFiles({ name: "제안서.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") })
  await expect(page.getByRole("button", { name: /제안서\.pdf/ })).toBeVisible()

  // 브랜드는 둘 다 보고, 목록에는 PDF가 마지막으로 왔다고 나오며, PDF는 그 이름으로 저장한다.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto("/messages")
  await expect(brandPage.locator(".chat-row-preview")).toHaveText("PDF 파일")
  await brandPage.locator(".chat-row").click()
  await expect(brandPage.getByRole("img", { name: "받은 사진" })).toBeVisible()
  const download = brandPage.waitForEvent("download")
  await brandPage.getByRole("button", { name: /제안서\.pdf/ }).click()
  expect((await download).suggestedFilename()).toBe("제안서.pdf")

  // 파일은 수정하지 않고 지운다.
  await page.getByRole("button", { name: "메시지 삭제" }).first().focus()
  await page.keyboard.press("Enter")
  const actions = page.locator(".chat-actions")
  await expect(actions.getByRole("button", { name: "수정" })).toHaveCount(0)
  await actions.getByRole("button", { name: "삭제" }).click()
  await actions.getByRole("button", { name: "삭제" }).click()
  await expect(page.getByText("메시지를 삭제했어요.")).toBeVisible()
  await expect(page.getByRole("img", { name: "보낸 사진" })).toHaveCount(0)
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a group posts on the recruit board, and a brand applies with its campaign", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-board@syu.ac.kr", "모집 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-board@board-cafe.kr", "모집 카페")
  await request.put("/api/profile", { data: { intro: "캠퍼스 공연 동아리예요.", offer: "관객 100명" }, headers: group.headers })
  const day = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + days * 86_400_000))
  await request.post("/api/events", { data: { name: "모집 공연", date: day(20), types: ["현금"] }, headers: group.headers })
  await request.post("/api/events", { data: { name: "모집 시음회", date: day(15), types: ["제품"] }, headers: brand.headers })

  // 단체가 게시판에서 글을 쓴다.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/board")
  await page.getByRole("button", { name: "모집 글 쓰기" }).first().click()
  const form = page.getByRole("dialog")
  await expect(form.getByLabel("협찬사를 찾을 행사")).toContainText("모집 공연")
  await form.getByLabel("제목", { exact: true }).fill("종강 공연 협찬사를 찾아요")
  await form.getByLabel("내용", { exact: true }).fill("로비 부스와 현수막 로고를 드려요.")
  await form.getByRole("checkbox", { name: "현금" }).check()
  await form.getByRole("button", { name: "모집 글 올리기" }).click()
  await expect(page).toHaveURL(/\/board\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("종강 공연 협찬사를 찾아요")
  await expect(page.locator(".post-applications")).toContainText("아직 지원한 곳이 없어요")

  // 브랜드 회원이 게시판에서 그 글을 찾아 자기 캠페인으로 지원한다.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto("/board")
  await brandPage.locator(".post-card", { hasText: "종강 공연 협찬사를 찾아요" }).locator("h3 button").click()
  await brandPage.getByRole("button", { name: "지원하기" }).click()
  const apply = brandPage.getByRole("dialog")
  await expect(apply.getByLabel("제안할 캠페인")).toContainText("모집 시음회")
  // 메시지를 템플릿으로 저장해 두어 다음에도 쓰도록 계정에 보관한다.
  await apply.getByLabel("전할 메시지").fill("시음 부스로 함께하고 싶어요.")
  await apply.getByRole("button", { name: "지금 문구 저장" }).click()
  await apply.getByLabel("문구 이름").fill("첫 지원")
  await apply.getByRole("button", { name: "저장", exact: true }).click()
  await expect(brandPage.getByText("제안 문구를 저장했어요.")).toBeVisible()
  await expect(apply.getByLabel("저장한 문구")).toContainText("첫 지원")
  await apply.getByRole("button", { name: "제안 보내기" }).click()
  await expect(brandPage.getByText("지원했어요 · 검토 중")).toBeVisible()

  // 단체는 자기 글에서 지원을 보고 받은편지함에서 답한다.
  await page.reload()
  await expect(page.locator(".post-applications")).toContainText("모집 카페")
  await expect(page.getByRole("button", { name: "받은 협찬에서 답하기" })).toBeVisible()
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a brand offers one campaign to several groups at once", async ({ page, request }) => {
  const groups = await Promise.all(
    ["일괄 밴드", "일괄 댄스"].map(async (name, index) => {
      const member = await signUpMember(request, "학생단체", `e2e-bulk-${index}@syu.ac.kr`, name)
      await request.put("/api/profile", { data: { intro: "캠퍼스 동아리예요.", offer: "관객 100명" }, headers: member.headers })
      return member
    }),
  )
  const brand = await signUpMember(request, "브랜드", "e2e-bulk@bulk-cafe.kr", "일괄 카페")
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 20 * 86_400_000))
  await request.post("/api/events", { data: { name: "일괄 시음회", date: day, types: ["제품"] }, headers: brand.headers })
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/groups")
  await page.getByRole("tab", { name: "전체" }).click()
  await page.getByRole("button", { name: "여러 곳에 제안" }).click()
  await page.getByRole("checkbox", { name: "일괄 밴드 고르기" }).check()
  await page.getByRole("checkbox", { name: "일괄 댄스 고르기" }).check()
  await expect(page.getByRole("region", { name: "여러 곳에 제안" })).toContainText("2곳 골랐어요")
  await page.getByRole("button", { name: "한 번에 제안하기" }).click()
  const form = page.getByRole("dialog", { name: "2곳에 협찬 제안" })
  await expect(form.getByLabel("제안할 캠페인")).toContainText("일괄 시음회")
  await form.getByRole("button", { name: "제안 보내기" }).click()
  await expect(page.getByText("2곳에 협찬 제안을 보냈어요.")).toBeVisible()
  await expect(page.getByRole("region", { name: "여러 곳에 제안" })).toContainText("0곳 골랐어요")
  for (const member of [...groups, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a brand sees its campaign and the group's event dates side by side, chooses what to do, and sends structured terms", async ({ page, request }) => {
  const kst = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + days * 86_400_000))
  const group = await signUpMember(request, "학생단체", "e2e-dates@syu.ac.kr", "날짜 밴드")
  const listed = await request.put("/api/profile", { data: { intro: "캠퍼스에서 공연하는 밴드예요.", offer: "관객 100명" }, headers: group.headers })
  expect(listed.status(), await listed.text()).toBe(200)
  const { profile } = (await listed.json()) as { profile: { id: string } }
  const registered = await request.post("/api/events", { data: { name: "가을 정기공연", date: kst(30), expectedAudience: 100, types: ["제품"] }, headers: group.headers })
  expect(registered.status(), await registered.text()).toBeLessThan(300)
  const brand = await signUpMember(request, "브랜드", "e2e-dates@date-cafe.kr", "날짜 카페")
  await request.post("/api/events", { data: { name: "신메뉴 시음", date: kst(20), types: ["제품"] }, headers: brand.headers })
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto(`/groups/${profile.id}`)
  await page.locator(".profile-actions").getByRole("button", { name: "협찬 제안하기" }).click()
  const form = page.getByRole("dialog")
  const dates = form.locator(".propose-dates")
  await expect(dates).toContainText("우리 캠페인")
  await expect(dates).toContainText("가을 정기공연")
  // 날짜가 다르면 고르기 전에는 보낼 수 없다(미리 골라 두지 않는다).
  const choice = form.getByRole("group", { name: /날짜가 달라요/ })
  await expect(choice.getByRole("radio")).toHaveCount(2)
  await expect(choice.getByRole("radio", { checked: true })).toHaveCount(0)
  await form.getByLabel("전할 메시지").fill("함께해요.")
  await form.getByRole("button", { name: "제안 보내기" }).click()
  await expect(form.getByText("이 날짜로 진행할지, 날짜 조정을 요청할지 골라 주세요")).toBeVisible()
  await choice.getByText("날짜 조정을 요청해요").click()
  await expect(choice.getByRole("radio", { name: "날짜 조정을 요청해요" })).toBeChecked()
  await choice.getByLabel("바꾸고 싶은 날짜").fill(kst(25))
  // 조건은 캠페인에서 가져오고 고칠 수 있다.
  await form.getByLabel("내용 · 수량").fill("시음 쿠폰 100장")
  await form.getByRole("button", { name: "제안 보내기" }).click()
  await expect(form).toBeHidden()
  const sent = (await (await request.get("/api/offers", { headers: group.headers })).json()) as {
    offers: { message?: string; terms?: { quantity?: string; kinds?: string[]; schedule?: { date: string } } }[]
  }
  // 일정 조정은 메시지가 아니라 조건으로 남는다.
  expect(sent.offers[0]?.message).toBe("함께해요.")
  expect(sent.offers[0]?.terms?.schedule?.date).toBe(kst(25))
  expect(sent.offers[0]?.terms?.quantity).toBe("시음 쿠폰 100장")
  expect(sent.offers[0]?.terms?.kinds).toEqual(["제품"])
  // 받는 단체의 제안함에 같은 조건이 보인다.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/offers")
  const offerCard = page.locator(".request-card", { hasText: "날짜 카페" })
  await expect(offerCard.locator(".terms-list")).toContainText("시음 쿠폰 100장")
  await expect(offerCard.locator(".terms-list")).toContainText("일정 조정 요청")
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a student group proposes and the brand accepts", async ({ browser }) => {
  const student = await (await browser.newContext()).newPage()
  await student.goto("/")
  await logIn(student, "학생단체", "muse@syu.ac.kr")
  // 로그인하면 대시보드가 열리고 브랜드의 페이지는 한 걸음 거리다.
  await student.goto("/matches/afternoon-coffee")
  await student.locator(".profile-actions").getByRole("button", { name: /협찬 제안 보내기/ }).click()
  // 양식이 행사를 고르고(처음에는 가장 가까운 것) 메모를 받는다.
  const form = student.getByRole("dialog")
  await expect(form.getByLabel("제안할 행사")).toBeVisible()
  await form.getByLabel("전할 메시지").fill("현장 부스와 SNS로 브랜드를 알릴게요.")
  await form.getByRole("button", { name: "제안 보내기" }).click()
  await expect(form).toBeHidden()
  await expect(student.locator(".profile-actions").getByText("제안 보냄")).toBeVisible()

  const brand = await (await browser.newContext()).newPage()
  await brand.goto("/")
  await logIn(brand, "브랜드", "hello@afternoon-coffee.kr")
  await brand.goto("/inbox")
  const card = brand.locator(".request-card", { hasText: "삼육대 뮤즈" }).first()
  await expect(card).toContainText("현장 부스와 SNS로 브랜드를 알릴게요.")
  // 수락은 확인창을 거친다. Escape로 닫으면 아무것도 바뀌지 않는다.
  await card.getByRole("button", { name: /수락하기/ }).click()
  const accept = brand.getByRole("dialog", { name: "이 제안을 수락할까요?" })
  await expect(accept).toContainText("삼육대 뮤즈")
  await expect(accept).toContainText("15%")
  await brand.keyboard.press("Escape")
  await expect(accept).toBeHidden()
  await expect(card.getByRole("button", { name: /수락하기/ })).toBeVisible()
  await card.getByRole("button", { name: /수락하기/ }).click()
  await accept.getByRole("button", { name: "수락하기" }).click()
  await expect(brand.locator(".request-card", { hasText: "삼육대 뮤즈" }).first()).toBeHidden()
  await brand.getByRole("tab", { name: /수락함/ }).click()
  // 수락만 된 협찬은 계약 확인 대기이고, 계약서로 바로 간다.
  const accepted = brand.locator(".request-card", { hasText: "삼육대 뮤즈" })
  await expect(accepted.locator(".request-result")).toContainText("제안 수락 · 계약 확인 대기")
  await expect(accepted.getByRole("button", { name: "계약서 열기" })).toBeVisible()
  await expect(accepted.getByRole("list", { name: "협찬 진행 상황" })).toBeVisible()
})

test("the e-contract sets how the sponsorship is confirmed, and once both sides confirm, each side records its own methods at the venue", async ({ browser }) => {
  // 앞서 단체가 제안했고 브랜드가 수락한 콘서트다.
  const student = await (await browser.newContext()).newPage()
  await student.goto("/")
  await logIn(student, "학생단체", "muse@syu.ac.kr")
  await student.goto("/agreements")
  await student.locator(".agreement-row", { hasText: "2026 뮤즈 종강 공연" }).click()
  await expect(student.getByRole("heading", { level: 1, name: "2026 뮤즈 종강 공연" })).toBeVisible()
  // 계약서는 지금 상태와 다음 행동부터 보인다.
  await expect(student.getByRole("region", { name: "계약 상태" })).toContainText(
    /내 확인이 필요해요|상대의 확인을 기다려요|협찬이 확정됐어요/,
  )
  const methods = student.locator(".methods-panel")
  const status = methods.getByRole("heading", { name: /협찬 확인 방식/ })
  // 처음에는 QR, 그 쿠폰, 매장 방문이며 아직 확정되지 않았다.
  await expect(methods.locator(".method-list li")).toHaveCount(3)
  await expect(methods.locator(".method-list")).toContainText("QR 체크인")
  await expect(methods.locator(".method-list")).toContainText("매장 방문")
  await expect(status).toContainText("두 쪽이 계약서를 모두 확인하면 성과에 반영돼요")
  await expect(methods.locator(".venue-access")).toHaveCount(0)

  // 단체는 자기를 위한 부스 도장과 브랜드를 위한 샘플을 더한다.
  await methods.getByRole("button", { name: "협찬 확인 방식 고르기" }).click()
  await methods.getByRole("checkbox", { name: /부스 방문 · 스탬프/ }).check()
  await methods.getByRole("checkbox", { name: /샘플링 · 시음/ }).check()
  await expect(methods.getByRole("group", { name: "샘플링 · 시음 확인하는 쪽" }).getByRole("radio", { name: "오후의 커피" })).toBeChecked()
  await expect(methods.getByRole("group", { name: "매장 방문 확인하는 쪽" }).getByRole("radio", { name: "삼육대 뮤즈" })).toBeDisabled()
  await methods.getByRole("button", { name: "저장" }).click()
  await expect(methods.locator(".method-list li")).toHaveCount(5)
  await expect(methods.locator(".method-list")).toContainText("삼육대 뮤즈에서 현장 확인")
  // 양쪽이 e-contract를 확정해야 센다.
  await expect(methods.locator(".venue-access")).toHaveCount(0)
  await student.getByRole("button", { name: "이 내용으로 확인하기" }).click()
  await expect(student.getByText("확인했어요. 오후의 커피에 알렸어요.")).toBeVisible()

  const brand = await (await browser.newContext()).newPage()
  await brand.goto("/")
  await logIn(brand, "브랜드", "hello@afternoon-coffee.kr")
  await brand.goto("/agreements")
  await brand.locator(".agreement-row", { hasText: "2026 뮤즈 종강 공연" }).click()
  await brand.getByRole("button", { name: "이 내용으로 확인하기" }).click()
  const brandMethods = brand.locator(".methods-panel")
  await expect(brandMethods.getByRole("heading", { name: /협찬 확인 방식/ })).toContainText("확정됐어요")

  // 단체의 현장 페이지는 자기만 보는 PIN으로 열려 도장을 센다.
  await student.reload()
  await expect(status).toContainText("확정됐어요")
  const link = await methods.locator(".venue-access a").getAttribute("href")
  const pin = (await methods.locator(".venue-access span strong").textContent())!
  expect(link).toMatch(/\/check-in\/[\w-]+\/group$/)
  const venue = await (await browser.newContext()).newPage()
  await venue.goto(link!)
  // 직원이 맞는 페이지임을 알 수 있도록 행사가 PIN보다 먼저 보인다.
  await expect(venue.getByRole("heading", { level: 1 })).toHaveText("2026 뮤즈 종강 공연")
  await expect(venue.getByText(/삼육대 뮤즈 · /)).toBeVisible()
  await venue.getByLabel("단체 확인 PIN").fill(pin === "000000" ? "000001" : "000000")
  await expect(venue.getByText(/단체 확인 PIN이 맞지 않아요/)).toBeVisible()
  await venue.getByLabel("단체 확인 PIN").fill(pin)
  const stamp = venue.getByRole("button", { name: "부스 방문 · 스탬프 한 명 확인" })
  await expect(stamp).toBeVisible()
  await expect(venue.getByRole("button", { name: /샘플링/ })).toHaveCount(0)
  await stamp.click()
  await stamp.click()
  await venue.getByRole("button", { name: "부스 방문 · 스탬프 하나 되돌리기" }).click()
  await expect(venue.locator(".venue-counter-head strong")).toHaveText("1")

  // 브랜드의 매장 직원이 직원 페이지에서 브랜드의 PIN으로 샘플을 센다.
  const staffLink = await brandMethods.locator(".venue-access a").getAttribute("href")
  const staffPin = (await brandMethods.locator(".venue-access span strong").textContent())!
  expect(staffLink).toMatch(/\/staff$/)
  const staff = await (await browser.newContext()).newPage()
  await staff.goto(staffLink!)
  await staff.getByLabel("직원 PIN").fill(staffPin)
  await staff.getByLabel("수량", { exact: true }).fill("12")
  await staff.getByRole("button", { name: "샘플링 · 시음 12개 더하기" }).click()
  await expect(staff.locator(".venue-counter-head strong")).toHaveText("12")

  // Both sides read the counts on the e-contract, and 성과 shows only the methods chosen.
  await student.reload()
  await expect(methods.locator(".method-list")).toContainText("12개")
  await expect(methods.locator(".method-list")).toContainText("1명")
  await student.goto("/measurement")
  await student.getByLabel("행사 고르기").selectOption("event-muse-concert")
  const tiles = student.locator(".power-stats li")
  await expect(tiles).toHaveCount(5)
  await expect(tiles.filter({ hasText: "부스 스탬프" })).toHaveCount(1)
  await expect(tiles.filter({ hasText: "SNS 인증" })).toHaveCount(0)
  // 끝난 행사는 그렇다고 알린다.
  await student.getByLabel("행사 고르기").selectOption("event-busking-day")
  await expect(student.locator(".measure-bar .measure-state")).toHaveText("진행 완료")
  await expect(student.locator(".live-panel .eyebrow")).toHaveText("진행 완료")
})

test("a participant takes the coupon and the store's staff confirm the visit on their own page", async ({ browser }) => {
  const participant = await (await browser.newContext()).newPage()
  await participant.goto("/check-in/20261012")
  await expect(participant.getByRole("heading", { name: "가을 버스킹 데이" })).toBeVisible()
  await participant.getByRole("button", { name: "쿠폰 받기" }).click()
  const number = (await participant.locator(".coupon-code strong").textContent()) ?? ""
  expect(number).toMatch(/^UC-[A-Z2-9]{6}$/)
  // 참여자의 폰에서는 직원 PIN을 묻는 것이 아무것도 없다.
  await expect(participant.getByLabel("직원 PIN")).toHaveCount(0)

  const staff = await (await browser.newContext()).newPage()
  await staff.goto("/check-in/20261012/staff")
  await staff.getByLabel("직원 PIN").fill("000000")
  await staff.getByLabel("쿠폰 번호").fill(number)
  await staff.getByRole("button", { name: "방문 확인" }).click()
  await expect(staff.getByText(/직원 PIN이 맞지 않아요/)).toBeVisible()
  await staff.getByLabel("직원 PIN").fill("101234")
  await staff.getByRole("button", { name: "방문 확인" }).click()
  await expect(staff.getByRole("status").getByText(`${number}`, { exact: false })).toBeVisible()

  // 참여자의 페이지는 다음에 확인할 때 확정을 보여 준다.
  await expect(participant.getByText("방문이 확인됐어요", { exact: false })).toBeVisible({ timeout: 10_000 })
})

test("a new group signs up with the code shown on screen", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "회원가입" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("단체명").fill("테스트 동아리")
  await dialog.getByLabel("학교", { exact: true }).fill("삼육대학교")
  await dialog.getByLabel("담당자 이름").fill("테스트 담당자")
  await dialog.getByLabel("직책").selectOption("회장")
  await dialog.getByLabel("휴대폰 번호").fill("010-1234-5678")
  await dialog.getByLabel("학교 이메일").fill("e2e-club@syu.ac.kr")
  await dialog.getByRole("button", { name: "인증번호 받기" }).click()
  const code = await dialog.locator(".field-hint strong").textContent()
  await dialog.getByLabel("인증번호").fill(code ?? "")
  await dialog.getByRole("button", { name: "확인" }).click()
  await expect(dialog.getByText("이메일 인증이 완료됐어요.")).toBeVisible()
  await dialog.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-123")
  await dialog.getByLabel("비밀번호 확인").fill("e2e-pass-123")
  // 계약서의 문구에 문서 링크가 있으므로 확인란에 체크한다.
  await dialog.getByRole("checkbox").nth(0).check()
  await dialog.getByRole("checkbox").nth(1).check()
  // 페이지가 방문자를 위해 예시를 불러왔으므로, 새 회원의 대시보드에 자기
  // 데이터를 불러오는 동안 예시가 번쩍이면 안 된다.
  await page.evaluate(() => {
    const watch = window as unknown as { exampleShown: boolean }
    watch.exampleShown = false
    new MutationObserver(() => {
      if (document.querySelector(".dashboard")?.textContent?.includes("오후의 커피")) watch.exampleShown = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  await dialog.getByRole("button", { name: "가입하고 시작하기" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/가입했어요/)).toBeVisible()

  // 회원은 회원만 보므로, 가입한 브랜드가 아직 없으면 대시보드와 추천 매칭이
  // 예시 브랜드를 보여 주는 대신 그렇다고 알리고 근처 매장을 초대하라고
  // 안내한다.
  // 행사가 아직 없으니 첫 할 일은 행사 등록이다.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("행사를 등록하면 잘 맞는 브랜드를 찾아 드려요.")
  await expect(page.locator(".catalog-empty")).toContainText("아직 추천할 브랜드가 없어요")
  await expect(page.getByText("오후의 커피")).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { exampleShown: boolean }).exampleShown)).toBe(false)
  await page.goto("/matches")
  const empty = page.locator(".catalog-empty")
  await expect(empty).toContainText("아직 가입한 브랜드가 없어요")
  await empty.getByRole("button", { name: "학교 앞 가게 보기" }).click()
  await expect(page.getByRole("tab", { name: "학교 앞 가게" })).toHaveAttribute("aria-selected", "true")
})

test("brands show how far their store is from the school, and a brand keeps its store address", async ({ browser }) => {
  // 방문자는 데모 단체의 캠퍼스와 데모 매장을 본다.
  const student = await (await browser.newContext()).newPage()
  await student.goto("/matches")
  await student.getByRole("tab", { name: "전체" }).click()
  await expect(student.locator(".work-card", { hasText: "그린데이 샐러드" }).locator(".tag-distance")).toHaveText(/3\.3km/)
  // 온라인 브랜드는 매장이 없으므로 거리가 없다.
  await expect(student.locator(".work-card", { hasText: "프레시온" }).locator(".tag-distance")).toHaveCount(0)

  const brand = await (await browser.newContext()).newPage()
  // 여기서는 Kakao의 주소 검색이 주소를 고르는 버튼 하나로 대신한다.
  await brand.addInitScript(() => {
    type Options = { oncomplete: (data: { roadAddress: string; jibunAddress: string; address: string }) => void }
    ;(window as unknown as { daum: unknown }).daum = {
      Postcode: class {
        constructor(private options: Options) {}
        embed(element: HTMLElement) {
          const pick = document.createElement("button")
          pick.textContent = "화랑로 815 고르기"
          pick.onclick = () => this.options.oncomplete({ roadAddress: "서울 노원구 화랑로 815", jibunAddress: "", address: "" })
          element.append(pick)
        }
      },
    }
  })
  await brand.goto("/")
  await logIn(brand, "브랜드", "hello@afternoon-coffee.kr")
  await brand.goto("/me/edit")
  // The address is found, not typed; the offers are picked; 기본 정보 fills in.
  await expect(brand.getByLabel("매장 주소")).toHaveValue("서울 노원구 공릉역 2번 출구 앞")
  await expect(brand.getByLabel("매장 주소")).not.toBeEditable()
  await expect(brand.getByLabel("협찬 종류").first()).toHaveValue("할인 쿠폰")
  await expect(brand.getByLabel("협찬 내용").first()).toHaveValue("150장")
  await brand.getByRole("button", { name: "협찬 추가" }).click()
  await expect(brand.getByLabel("협찬 종류")).toHaveCount(4)
  // 고칠 수 없는 것은 따로 두고 활동에서 채운다.
  await expect(brand.getByRole("group", { name: /저절로 채워지는 정보/ })).toContainText("서울 노원구")
  // 불러오기 adds a past sponsorship to the portfolio.
  const rows = await brand.getByLabel("제목", { exact: true }).count()
  await brand.getByRole("button", { name: "지난 협찬 불러오기" }).click()
  const pick = brand.getByRole("dialog").locator("label.check-row:not(.checked)").first()
  await pick.click()
  await brand.getByRole("button", { name: /개 더하기$/ }).click()
  await expect(brand.getByLabel("제목", { exact: true })).toHaveCount(rows + 1)
  await expect(brand.getByLabel("팔로워")).toHaveCount(0)
  await brand.getByRole("button", { name: "주소 검색" }).click()
  await brand.getByRole("button", { name: "화랑로 815 고르기" }).click()
  await expect(brand.getByLabel("매장 주소")).toHaveValue("서울 노원구 화랑로 815")
  await brand.getByRole("button", { name: "저장하기" }).click()
  await expect(brand.getByText(/소개를 저장했어요/)).toBeVisible()
  // 여기서는 서버에 지도 키가 없으므로 새 주소에는 아직 위치가 없고 단체에는
  // 거리가 나오지 않는다.
  await brand.goto("/groups")
  await sortNearest(brand)
  await expect(brand.locator(".work-card").first()).toBeVisible()
  await expect(brand.locator(".tag-distance")).toHaveCount(0)
  await brand.goto("/me/edit")
  await expect(brand.getByLabel("매장 주소")).toHaveValue("서울 노원구 화랑로 815")
  await expect(brand.getByText(/아직 이 주소를 지도에서 찾지 못해/)).toBeVisible()
})

test("the language is set in 내 정보, and the page stays where it was", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await page.goto("/me")
  const language = page.getByRole("group", { name: "언어" })
  await expect(language.getByRole("button", { name: "한국어" })).toHaveAttribute("aria-pressed", "true")
  await language.getByRole("button", { name: "English" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page).toHaveURL(/\/me$/)
  // 영어에서는 행이 Language이고, 한국어를 고르면 앱이 돌아온다.
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "한국어" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "ko")
})

test("가까운 순 looks around the group's school for real shops, and says so while the map isn't connected", async ({ page }) => {
  // 회원 자신의 캠퍼스다. 방문자는 이 탭을 예시로 흐리게 본다.
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await page.goto("/matches")
  await page.getByRole("tab", { name: "학교 앞 가게" }).click()
  // 처음에는 모든 종류다.
  await expect(page.getByRole("button", { name: "전체", exact: true })).toHaveAttribute("aria-pressed", "true")
  // 테스트 서버에는 지도 키가 없다.
  await expect(page.getByText("지도 서비스가 연결되면 학교 근처 가게를 보여 드려요.")).toBeVisible()
  await page.getByRole("button", { name: "학원", exact: true }).click()
  await expect(page.getByRole("button", { name: "학원", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("지도 서비스가 연결되면 학교 근처 가게를 보여 드려요.")).toBeVisible()
})

// Kakao Maps SDK를 대신하는 것으로, 각 오버레이의 내용을 지도 상자에 넣는다.
const fakeKakaoSdk = `
window.kakao = { maps: {
  load: (done) => done(),
  LatLng: function (lat, lng) { this.lat = lat; this.lng = lng },
  LatLngBounds: function () { this.extend = () => {} },
  Map: function (el) { this.el = el; this.setBounds = () => {}; this.relayout = () => {} },
  CustomOverlay: function (o) { this.setMap = (map) => { if (map) map.el.append(o.content); else o.content.remove() } },
} }`

test("가까운 순's map sits on Kakao's map once a key is set, and on the sketch when Kakao doesn't load", async ({ page }) => {
  await page.route("**/api/site", async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), maps: { kakao: "test-key" } } })
  })
  let sdk = "ok"
  await page.route("https://dapi.kakao.com/**", (route) =>
    sdk === "ok" ? route.fulfill({ contentType: "text/javascript", body: fakeKakaoSdk }) : route.abort(),
  )
  await page.goto("/matches")
  await page.getByRole("tab", { name: "학교 앞 가게" }).click()
  await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "지도" }).click()
  const map = page.locator(".kakao-map")
  await expect(map.locator(".kakao-campus")).toBeVisible()
  const dots = map.locator(".kakao-dot")
  expect(await dots.count()).toBeGreaterThan(1)
  await dots.nth(1).click()
  await expect(dots.nth(1)).toHaveAttribute("aria-pressed", "true")
  // Kakao가 없으면 같은 매장을 스케치에 보여 준다.
  sdk = "down"
  await page.reload()
  await page.getByRole("tab", { name: "학교 앞 가게" }).click()
  await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "지도" }).click()
  await expect(page.locator(".place-map")).toBeVisible()
  await expect(page.locator(".kakao-map")).toHaveCount(0)
})

// 모든 오버레이를 지도의 왼쪽 가장자리에 Kakao처럼 zIndex 순으로 쌓는다.
const edgeKakaoSdk = fakeKakaoSdk.replace(
  "CustomOverlay: function (o) { this.setMap = (map) => { if (map) map.el.append(o.content); else o.content.remove() } },",
  `CustomOverlay: function (o) { this.setMap = (map) => {
    if (!map) return o.content.remove()
    const holder = document.createElement("div")
    holder.style.cssText = "position:absolute;left:0;top:50%;z-index:" + (o.zIndex ?? 0)
    holder.append(o.content)
    map.el.append(holder)
    o.content.remove = () => holder.remove()
  } },`,
)

test("on Kakao's map the campus label lets the shops beside it be pressed, and a picked name stays inside the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route("**/api/site", async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), maps: { kakao: "test-key" } } })
  })
  await page.route("https://dapi.kakao.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: edgeKakaoSdk }))
  await page.goto("/matches")
  await page.getByRole("tab", { name: "학교 앞 가게" }).click()
  await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "지도" }).click()
  const map = page.locator(".kakao-map")
  await expect(map.locator(".kakao-campus")).toBeVisible()
  // 매장이 캠퍼스 라벨 바로 위에 있어도 누르는 것을 받는다.
  const dot = map.locator(".kakao-dot").first()
  await dot.click()
  await expect(dot).toHaveAttribute("aria-pressed", "true")
  const name = dot.locator(".place-dot-name")
  await expect(name).toBeVisible()
  await expect(async () => {
    const [box, label] = [await map.boundingBox(), await name.boundingBox()]
    expect(label!.x).toBeGreaterThanOrEqual(box!.x)
    expect(label!.x + label!.width).toBeLessThanOrEqual(box!.x + box!.width)
  }).toPass()
})

test("brands and student groups can be searched and filtered", async ({ page }) => {
  await page.goto("/matches")
  await page.getByRole("tab", { name: "전체" }).click()
  const brandSearch = page.getByRole("searchbox", { name: "브랜드 검색" })
  await brandSearch.fill("커피")
  await expect(page.locator(".work-card", { hasText: "오후의 커피" })).toBeVisible()
  await expect(page.locator(".work-card", { hasText: "그린데이 샐러드" })).toHaveCount(0)
  await brandSearch.fill("없는낱말")
  await expect(page.getByText("조건에 맞는 브랜드가 없어요")).toBeVisible()
  // 걸린 조건은 칩으로 보이고, 빈 결과에서 한 번에 지운다.
  await expect(page.getByRole("list", { name: "걸린 조건" })).toContainText("‘없는낱말’ 검색")
  await page.getByRole("button", { name: "조건 모두 지우기" }).click()
  await expect(brandSearch).toHaveValue("")
  // 업종은 조건 칸에서 고르고, 정렬과 따로 걸린다.
  await page.locator(".catalog-conditions-toggle").click()
  await page.getByLabel("업종", { exact: true }).selectOption("cafe")
  await page.locator(".sort-choice label", { hasText: "인기순" }).click()
  await expect(page.locator(".work-card").first().locator(".work-rank")).toHaveText("1위")
  await expect(page.locator(".catalog-conditions-toggle")).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("list", { name: "걸린 조건" }).getByRole("listitem")).toHaveCount(3)

  await page.goto("/groups")
  await page.getByRole("tab", { name: "전체" }).click()
  await page.locator(".catalog-conditions-toggle").click()
  await page.getByLabel("학교", { exact: true }).selectOption("광운대학교")
  await expect(page.locator(".work-card")).toHaveCount(2)
  await expect(page.locator(".catalog-count")).toHaveText("학생단체 2곳")
  await page.getByRole("button", { name: "학교: 광운대학교 조건 지우기" }).click()
  await expect(page.locator(".work-card")).toHaveCount(8)
})

test("a member downloads their data and hands the account over to a new email", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "회원가입" }).first().click()
  const signup = page.getByRole("dialog")
  await signup.getByLabel("단체명").fill("인수인계 동아리")
  await signup.getByLabel("학교", { exact: true }).fill("삼육대학교")
  await signup.getByLabel("담당자 이름").fill("테스트 담당자")
  await signup.getByLabel("직책").selectOption("회장")
  await signup.getByLabel("휴대폰 번호").fill("010-1234-5678")
  await signup.getByLabel("학교 이메일").fill("e2e-handover@syu.ac.kr")
  await signup.getByRole("button", { name: "인증번호 받기" }).click()
  await signup.getByLabel("인증번호").fill((await signup.locator(".field-hint strong").textContent()) ?? "")
  await signup.getByRole("button", { name: "확인" }).click()
  await signup.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-123")
  await signup.getByLabel("비밀번호 확인").fill("e2e-pass-123")
  await signup.getByRole("checkbox").nth(0).check()
  await signup.getByRole("checkbox").nth(1).check()
  await signup.getByRole("button", { name: "가입하고 시작하기" }).click()
  await expect(signup).toBeHidden()

  await page.goto("/me")
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "내 데이터 내려받기" }).click()
  expect((await download).suggestedFilename()).toMatch(/^uniconnect-\d{4}-\d{2}-\d{2}\.json$/)

  await page.getByRole("button", { name: "로그인 이메일 바꾸기" }).click()
  const change = page.getByRole("dialog")
  await change.getByLabel("새 로그인 이메일").fill("e2e-next-officer@syu.ac.kr")
  await change.getByLabel("지금 비밀번호").fill("e2e-pass-123")
  await change.getByRole("button", { name: "인증번호 받기" }).click()
  // 테스트 서버는 개발 환경처럼 코드를 화면에 보여 준다.
  await change.getByLabel("인증번호").fill((await change.locator(".field-hint strong").textContent()) ?? "")
  await change.getByRole("button", { name: "이메일 바꾸기" }).click()
  await expect(change).toBeHidden()
  await expect(page.getByText("e2e-next-officer@syu.ac.kr", { exact: true })).toBeVisible()

  // 새 임원이 자기 이름, 직책, 번호를 넣는다.
  await page.getByRole("button", { name: "담당자 정보 수정" }).click()
  const contact = page.getByRole("dialog")
  await contact.getByLabel("담당자 이름").fill("새 임원")
  await contact.getByLabel("직책").selectOption("부회장")
  await contact.getByLabel("휴대폰 번호").fill("01098765432")
  await contact.getByRole("button", { name: "저장하기" }).click()
  await expect(contact).toBeHidden()
  await expect(page.getByText("새 임원 · 부회장 · 010-9876-5432")).toBeVisible()
})

test("a shop a student group invited joins as a brand from the invitation", async ({ page, request }) => {
  // 여기서는 Kakao가 연결되어 있지 않으므로, 가입한 단체가 API로 장소 ID를
  // 써서 매장을 초대한다(데모 단체는 실제 매장을 초대할 수 없다).
  const group = await signUpMember(request, "학생단체", "e2e-inviter@syu.ac.kr", "초대 동아리")
  const made = await request.post("/api/invites", { data: { placeId: "12345678" }, headers: group.headers })
  const { invite } = (await made.json()) as { invite: { code: string } }

  // 주인이 링크를 열어 누가 초대했는지 읽고 브랜드로 가입한다.
  await page.goto(`/invite/${invite.code}`)
  await expect(page.getByRole("heading", { name: "초대 동아리에서 초대했어요" })).toBeVisible()
  await page.getByRole("button", { name: "가게로 가입하기" }).click()
  const signup = page.getByRole("dialog")
  await signup.getByLabel("브랜드명").fill("골목 카페")
  await signup.getByLabel("담당자 이름").fill("테스트 담당자")
  await signup.getByLabel("직책").selectOption("대표")
  await signup.getByLabel("휴대폰 번호").fill("010-1234-5678")
  await signup.getByLabel("이메일", { exact: true }).fill("owner@golmok-cafe.kr")
  await signup.getByRole("button", { name: "인증번호 받기" }).click()
  await signup.getByLabel("인증번호").fill((await signup.locator(".field-hint strong").textContent()) ?? "")
  await signup.getByRole("button", { name: "확인" }).click()
  await signup.locator(".document-field input").setInputFiles({ name: "사업자등록증.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") })
  await signup.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-123")
  await signup.getByLabel("비밀번호 확인").fill("e2e-pass-123")
  await signup.getByRole("checkbox", { name: /동의합니다/ }).check()
  await signup.getByRole("checkbox", { name: /만 14세/ }).check()
  await signup.getByRole("button", { name: "가입하고 시작하기" }).click()
  await expect(signup).toBeHidden()

  // 운영자가 서류를 승인하면 매장이 연결되고, 단체가 찾도록 브랜드가 목록에 오른다.
  await expect(page.getByText("서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요.")).toBeVisible()
  const admin = { headers: { "X-Admin-Token": "e2e-admin-token" } }
  const { applications } = (await (await request.get("/api/admin/applications", admin)).json()) as { applications: { id: string; email: string }[] }
  const held = applications.find((item) => item.email === "owner@golmok-cafe.kr")!
  expect((await request.post(`/api/admin/applications/${held.id}/approve`, admin)).status()).toBe(200)
  const listed = async (headers?: Record<string, string>) =>
    ((await (await request.get("/api/brands", { headers })).json()) as { brands: { name: string; kakaoPlaceId?: string }[] }).brands
  expect((await listed(group.headers)).some((brand) => brand.name === "골목 카페" && brand.kakaoPlaceId === "12345678")).toBe(true)
  // 방문자의 예시에는 오르지 않는다.
  expect((await listed()).some((brand) => brand.name === "골목 카페")).toBe(false)
})

test("a shop with no company email signs up with a document and waits for approval", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-doc@syu.ac.kr", "서류 동아리")
  const made = await request.post("/api/invites", { data: { placeId: "23456789" }, headers: group.headers })
  const { invite } = (await made.json()) as { invite: { code: string } }
  await page.goto(`/invite/${invite.code}`)
  await page.getByRole("button", { name: "가게로 가입하기" }).click()
  const signup = page.getByRole("dialog")
  await signup.getByLabel("브랜드명").fill("개인메일 카페")
  await signup.getByLabel("담당자 이름").fill("테스트 담당자")
  await signup.getByLabel("직책").selectOption("대표")
  await signup.getByLabel("휴대폰 번호").fill("010-1234-5678")
  await signup.getByLabel("이메일", { exact: true }).fill("e2e-owner@gmail.com")
  await signup.getByRole("button", { name: "인증번호 받기" }).click()
  await signup.getByLabel("인증번호").fill((await signup.locator(".field-hint strong").textContent()) ?? "")
  await signup.getByRole("button", { name: "확인" }).click()
  await signup.locator(".document-field input").setInputFiles({ name: "사업자등록증.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 proof") })
  await expect(signup.locator(".document-field")).toContainText("사업자등록증.pdf")
  await signup.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-123")
  await signup.getByLabel("비밀번호 확인").fill("e2e-pass-123")
  await signup.getByRole("checkbox", { name: /동의합니다/ }).check()
  await signup.getByRole("checkbox", { name: /만 14세/ }).check()
  await signup.getByRole("button", { name: "가입하고 시작하기" }).click()
  await expect(signup).toBeHidden()
  await expect(page.getByText("서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요.")).toBeVisible()
  const held = await request.post("/api/auth/login", { data: { role: "브랜드", email: "e2e-owner@gmail.com", password: "e2e-pass-123" } })
  expect(held.status()).toBe(403)
  const { applications } = (await (await request.get("/api/admin/applications", { headers: { "X-Admin-Token": "e2e-admin-token" } })).json()) as { applications: { id: string; email: string }[] }
  const { id } = applications.find((item) => item.email === "e2e-owner@gmail.com")!
  expect((await request.post(`/api/admin/applications/${id}/approve`, { headers: { "X-Admin-Token": "e2e-admin-token" } })).status()).toBe(200)
  const allowed = await request.post("/api/auth/login", { data: { role: "브랜드", email: "e2e-owner@gmail.com", password: "e2e-pass-123" } })
  expect(allowed.status()).toBe(200)
})

test("a brand opens an accepted proposal's agreement, confirms it and proves what it did", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "브랜드", "hello@afternoon-coffee.kr")
  await page.goto("/inbox")
  await page.getByRole("tab", { name: /수락함/ }).click()
  await page.locator(".request-card", { hasText: "서울여대 러너스" }).getByRole("button", { name: "계약서" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "가을 캠퍼스 런 5K" })).toBeVisible()
  await expect(page.getByText("아직 uniconnect 계정이 없어요")).toBeVisible()
  // 자기 쪽은 운영하는 사람을 연락할 전화번호와 함께 보여 준다.
  await expect(page.locator(".agreement-contact")).toContainText("이오후 · 점장")
  await expect(page.locator(".agreement-contact a")).toHaveAttribute("href", "tel:01000000001")

  await page.getByRole("button", { name: "이 내용으로 확인하기" }).click()
  await expect(page.locator(".agreement-confirm .agreement-state")).toHaveText("상대 확인 기다리는 중")

  // 브랜드가 첫 항목을 체크하고 링크와 사진으로 증빙한다.
  const item = page.locator(".agreement-item").first()
  await item.getByRole("checkbox").check()
  await expect(item.getByRole("checkbox")).toBeChecked()
  await item.getByRole("textbox").fill("https://instagram.com/p/e2e-proof")
  await item.getByRole("button", { name: "링크 추가" }).click()
  await expect(item.getByRole("link", { name: /instagram\.com\/p\/e2e-proof/ })).toBeVisible()
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")
  await item.getByLabel("사진 추가").setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png })
  await expect(item.getByRole("img", { name: "증빙 사진" })).toBeVisible()

  // 목록에 진행 정도가 보인다.
  await page.goto("/agreements")
  await expect(page.locator(".agreement-row", { hasText: "서울여대 러너스" })).toContainText("증빙 2개")
})

test("visitors see a partner's reviews, a group reviews the brand after its event, and the brand answers", async ({
  page,
  request,
  browser,
}) => {
  // 시드된 후기가 카드와 상세 페이지에 있다.
  await page.goto("/matches")
  await expect(page.locator(".work-card", { hasText: "오후의 커피" }).first().locator(".tag-rating")).toContainText("후기 2")
  await page.goto("/matches/afternoon-coffee")
  await page.getByRole("tab", { name: /파트너 후기/ }).click()
  const reviews = page.locator(".profile-panel")
  await expect(reviews.locator(".profile-figures strong").first()).toHaveText("4.5")
  await expect(reviews.getByRole("heading", { name: "최근 후기" })).toBeVisible()
  await reviews.getByRole("button", { name: "후기 모두 보기 (2)" }).click()
  await expect(reviews.locator(".profile-review, .review-card")).toHaveCount(2)

  // 회원 둘이다. 단체의 오늘 행사를 브랜드에 제안하고 수락한다(API로).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  const group = await signUpMember(request, "학생단체", "e2e-reviewer@syu.ac.kr", "후기 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-reviewed@reviewed-cafe.kr", "후기 카페")
  await request.post("/api/events", { data: { name: "후기 공연", date: today, people: "100명", types: ["제품"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const inbox = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as {
    requests: { id: string; groupName: string }[]
  }
  const proposal = inbox.requests.find((item) => item.groupName === "후기 동아리")!
  await request.post(`/api/requests/${proposal.id}/accept`, { headers: brand.headers })
  // 후기는 확정된 e-contract 뒤에 쓴다. 가치, 단체의 확인, 수수료를 내는
  // 브랜드의 확인이 필요하다(이체이며 운영자가 확인한다).
  await request.put(`/api/agreements/${proposal.id}/value`, { data: { value: { cash: 100000, inKind: 0 } }, headers: group.headers })
  await request.post(`/api/agreements/${proposal.id}/confirm`, { headers: group.headers })
  const order = (await (await request.post("/api/billing/orders", { data: { kind: "fee", targetId: proposal.id }, headers: brand.headers })).json()) as { order: { id: string } }
  const paid = await request.post(`/api/admin/payments/${order.order.id}/paid`, { headers: { "X-Admin-Token": "e2e-admin-token" } })
  expect(paid.ok()).toBe(true)

  // 계약서에서 단체가 후기를 남긴다.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/agreements/${proposal.id}`)
  const panel = page.locator(".review-panel")
  await panel.getByRole("radio", { name: "5점" }).check()
  await panel.getByRole("checkbox", { name: "약속을 잘 지켜요" }).check()
  await panel.getByLabel("한 줄 후기").fill("커피가 공연 전에 딱 맞춰 왔어요.")
  await panel.getByRole("button", { name: "후기 남기기" }).click()
  await expect(panel.getByText("내가 남긴 후기")).toBeVisible()

  // 단체(회원)가 보는 브랜드의 페이지에 그 후기가 보인다.
  await page.goto(`/matches/${brand.listingId}`)
  await page.getByRole("tab", { name: /파트너 후기/ }).click()
  await expect(page.locator(".profile-review")).toContainText("커피가 공연 전에 딱 맞춰 왔어요.")

  // 브랜드가 계약서에서 답하고, 답은 후기 밑에 보인다.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto(`/agreements/${proposal.id}`)
  const brandPanel = brandPage.locator(".review-panel")
  await brandPanel.getByRole("button", { name: "답글 달기" }).click()
  await brandPanel.getByLabel("답글", { exact: true }).fill("다음 공연도 함께해요!")
  await brandPanel.getByRole("button", { name: "답글 저장" }).click()
  await expect(brandPanel.locator(".review-reply")).toContainText("다음 공연도 함께해요!")
  await page.reload()
  await page.getByRole("tab", { name: /파트너 후기/ }).click()
  await expect(page.locator(".profile-review .review-reply")).toContainText("후기 카페의 답글")
  await expect(page.locator(".profile-review .review-reply")).toContainText("다음 공연도 함께해요!")
})

test("the app can be installed, and the calendar gives its dates to calendar apps", async ({ page, request }) => {
  // 매니페스트와 아이콘과 서비스 워커를 서빙하며, 사이트로 가는 링크는
  // 설치한 앱이 아니라 브라우저에서 열라고 요청한다.
  const manifest = (await (await request.get("/manifest.webmanifest")).json()) as {
    name: string
    display: string
    handle_links: string
    icons: { src: string; sizes: string }[]
  }
  expect([manifest.name, manifest.display, manifest.handle_links]).toEqual(["uniconnect", "standalone", "not-preferred"])
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512", "512x512"])
  for (const icon of manifest.icons) {
    expect((await request.get(`/${icon.src}`)).headers()["content-type"]).toBe("image/png")
  }
  expect(await (await request.get("/sw.js")).text()).toContain("/api/")
  await page.goto("/")
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest")
  // 빌드한 앱은 서비스 워커를 등록한다.
  const worker = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL ?? "")
  expect(worker).toMatch(/\/sw\.js$/)

  // A group's coming event, as a calendar file from 내 행사.
  const email = "e2e-calendar@syu.ac.kr"
  const code = (await (await request.post("/api/auth/email-code", { data: { role: "학생단체", email } })).json()) as { devCode: string }
  const verified = (await (
    await request.post("/api/auth/email-code/verify", { data: { email, code: code.devCode } })
  ).json()) as { verificationToken: string }
  const signup = await request.post("/api/auth/signup", {
    data: {
      role: "학생단체",
      name: "캘린더 동아리",
      type: "공연 동아리",
      school: "삼육대학교",
      email,
      password: "e2e-pass-123",
      verificationToken: verified.verificationToken,
      agreedToTerms: true,
      over14: true,
      contact: { name: "테스트 담당자", position: "회장", phone: "010-1234-5678" },
    },
  })
  const { token } = (await signup.json()) as { token: string }
  const month = new Date(Date.now() + 30 * 86_400_000)
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(month)
  const later = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 37 * 86_400_000))
  for (const event of [
    { name: "겨울 정기 공연", date, people: "200명", types: ["제품"] },
    { name: "신년 버스킹", date: later, people: "50명", types: ["현금"] },
  ]) {
    await request.post("/api/events", { data: event, headers: { Authorization: `Bearer ${token}` } })
  }
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), token)
  await page.goto("/events")
  await page.getByRole("button", { name: "캘린더에 추가" }).click()
  // 폰의 공유 시트처럼 짜여 있다. 다가오는 날짜가 모두 골라져 있고, 그 밑에 캘린더 앱이 있다.
  const sheet = page.getByRole("dialog", { name: "캘린더에 추가" })
  await expect(sheet.getByText("일정 2개 선택됨")).toBeVisible()
  await expect(sheet.getByRole("button", { name: /겨울 정기 공연/ })).toHaveAttribute("aria-pressed", "true")
  // 날짜가 여럿이면 Google Calendar가 날짜마다의 추가 페이지를 차례로 연다.
  await sheet.getByRole("button", { name: "Google 캘린더" }).click()
  const google = sheet.getByRole("link", { name: "겨울 정기 공연 Google 캘린더에서 열기" })
  const added = new URL((await google.getAttribute("href")) ?? "")
  expect(added.origin + added.pathname).toBe("https://calendar.google.com/calendar/render")
  expect([added.searchParams.get("action"), added.searchParams.get("text")]).toEqual(["TEMPLATE", "겨울 정기 공연"])
  expect(added.searchParams.get("dates")).toMatch(new RegExp(`^${date.replace(/-/g, "")}/\\d{8}$`))
  await expect(google).toHaveAttribute("target", "_blank")
  await expect(sheet.getByRole("link", { name: "신년 버스킹 Google 캘린더에서 열기" })).toBeVisible()
  // 고른 것이 없으면 앱이 열리지 않고, 하나면 아이콘에서 바로 그 추가 페이지가 열린다.
  await sheet.getByRole("button", { name: /겨울 정기 공연/ }).click()
  await sheet.getByRole("button", { name: /신년 버스킹/ }).click()
  await expect(sheet.getByRole("button", { name: "Apple 캘린더" })).toBeDisabled()
  await sheet.getByRole("button", { name: /겨울 정기 공연/ }).click()
  await expect(sheet.getByText("일정 1개 선택됨")).toBeVisible()
  await expect(sheet.getByRole("link", { name: "Outlook" })).toHaveAttribute("href", /^https:\/\/outlook\.live\.com\//)
  // Apple Calendar는 고른 날짜의 캘린더 파일을 받는다.
  const download = page.waitForEvent("download")
  await sheet.getByRole("button", { name: "Apple 캘린더" }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^uniconnect-\d{4}-\d{2}-\d{2}\.ics$/)
  const calendar = await readFile(await file.path(), "utf8")
  expect(calendar).toContain("BEGIN:VCALENDAR")
  expect(calendar).toContain("SUMMARY:겨울 정기 공연")
  expect(calendar).not.toContain("SUMMARY:신년 버스킹")
  expect(calendar).toContain(`DTSTART;VALUE=DATE:${date.replace(/-/g, "")}`)
})

test("the account button opens a small panel with 내 정보 and 로그아웃", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-account-menu@cafe.co.kr", "메뉴 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/dashboard")
  const toggle = page.getByRole("button", { name: "내 계정" })
  await toggle.click()
  const panel = page.getByRole("region", { name: "내 계정" })
  await expect(panel.getByText("메뉴 카페")).toBeVisible()
  await expect(panel.getByText("e2e-account-menu@cafe.co.kr")).toBeVisible()
  // 벨을 누르면 Escape처럼 닫힌다.
  await page.getByRole("button", { name: /^알림/ }).click()
  await expect(panel).toHaveCount(0)
  await toggle.click()
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)
  // 내 정보 opens the page; 로그아웃 logs out.
  await toggle.click()
  await panel.getByRole("button", { name: "내 정보" }).click()
  await expect(page).toHaveURL(/\/me$/)
  await toggle.click()
  await panel.getByRole("button", { name: "로그아웃" }).click()
  await expect(page.getByText("로그아웃했어요.")).toBeVisible()
  await expect(page.getByRole("button", { name: "로그인", exact: true }).first()).toBeVisible()
  // 계정에서 나오면 같은 화면이 아니라 소개 페이지가 보인다.
  await expect(page).toHaveURL(/\/$/)
})

test("every sponsorship on 성과 분석 has its detailed report, and 요금제 보기 opens the plans in place", async ({ page, request }) => {
  await page.goto("/analytics?role=브랜드")
  const rows = page.locator(".analytics-table .analytics-row:not(.head)")
  // count()는 기다리지 않으므로 행이 도착하기를 기다린 뒤에 센다.
  await expect(rows.nth(1)).toBeVisible()
  const count = await rows.count()
  await expect(page.locator(".analytics-table .report-button")).toHaveCount(count)
  // 측정한 행사가 없는 것도 기록에서 계산해 살 수 있다.
  await rows.last().locator(".report-button").click()
  await expect(page).toHaveURL(/\/insights\/[^/]+$/)
  await expect(page.getByText("화면에서 보는 숫자 너머의 리포트")).toBeVisible()
  await expect(page.getByRole("button", { name: "로그인하고 리포트 사기" })).toBeVisible()

  const brand = await signUpMember(request, "브랜드", "e2e-plan@plan-cafe.kr", "요금제 카페")
  await page.evaluate((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/analytics")
  await page.getByRole("button", { name: "요금제 보기" }).click()
  const plans = page.getByRole("dialog", { name: "요금제 고르기" })
  await expect(plans.getByRole("button", { name: "Growth 시작하기" })).toBeVisible()
  expect((await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: brand.headers })).status()).toBe(204)
})

test("a group's profile shows a brand the deal in three boxes", async ({ page }) => {
  await page.goto("/groups")
  await page.getByRole("tab", { name: "전체" }).click()
  await page.locator(".work-card h3 button").first().click()
  await expect(page).toHaveURL(/\/groups\/[^/]+$/)
  const deal = page.getByRole("region", { name: "협찬 한눈에 보기" })
  await expect(deal.getByRole("heading", { name: "단체가 해 드리는 것" })).toBeVisible()
  await expect(deal.getByRole("heading", { name: "원하는 협찬" })).toBeVisible()
  await expect(deal.getByRole("heading", { name: "다음 행사" })).toBeVisible()
})

test("추천 매칭 opens on 전체, its scopes 전체 · 추천 · 찜 · 학교 앞 가게 apart from sort and filter", async ({ page }) => {
  await page.goto("/matches")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("브랜드 찾기")
  const tabs = page.getByRole("tablist", { name: "브랜드 보기" }).getByRole("tab")
  await expect(tabs).toHaveText(["전체", "추천", "찜", "학교 앞 가게"])
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true")
})

test("a brand writes the value, pays the 15% fee to confirm, and finds it under 결제 내역", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-fee@syu.ac.kr", "수수료 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-fee@fee-cafe.kr", "수수료 카페")
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 10 * 86_400_000))
  await request.post("/api/events", { data: { name: "수수료 공연", date, types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  const id = requests[0].id
  await request.post(`/api/requests/${id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto(`/agreements/${id}`)
  const panel = page.getByRole("region", { name: "협찬액과 수수료" })
  await expect(panel).toContainText("아직 적지 않았어요")
  await expect(page.getByText("협찬액을 적으면 수수료를 결제하고 확인할 수 있어요.")).toBeVisible()
  await panel.getByRole("button", { name: "적기" }).click()
  await panel.getByLabel("현금").fill("200000")
  await panel.getByLabel("현물 환산").fill("133,333")
  await panel.getByRole("button", { name: "저장하기" }).click()
  await expect(panel).toContainText("333,333원")
  await expect(panel).toContainText("50,000원")

  // Toss 키가 없으면 이체가 결제 방법이며, 약관이 먼저 나온다.
  await page.getByRole("button", { name: "수수료 50,000원 결제하고 확인하기" }).click()
  const pay = page.getByRole("dialog", { name: "플랫폼 수수료 결제" })
  await expect(pay).toContainText("카드 결제는 준비 중이에요")
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(pay.getByRole("alert")).toHaveText("결제 내용과 환불 규정에 동의해 주세요.")
  await pay.getByText("결제 내용을 확인했고").click()
  await expect(pay.getByRole("checkbox")).toBeChecked()
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(page.getByText("계좌 입금을 요청했어요. 입금이 확인되면 계약서가 확인돼요.")).toBeVisible()
  await expect(pay).toBeHidden()

  await page.goto("/me")
  await page.getByRole("button", { name: "결제 내역" }).click()
  const history = page.getByRole("dialog", { name: "결제 내역" })
  await expect(history).toContainText("수수료 공연 협찬 수수료")
  await expect(history).toContainText("입금 확인 중")

  // 단체는 아무것도 내지 않는 것을 본다.
  const groupPage = await (await browser.newContext()).newPage()
  await groupPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await groupPage.goto(`/agreements/${id}`)
  await expect(groupPage.getByRole("region", { name: "협찬액과 수수료" })).toContainText("학생단체는 무료예요")
  for (const member of [group, brand]) {
    expect((await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })).status()).toBe(204)
  }
})

test("the detailed report: the demo's open from 성과 분석, a member's locked behind its price", async ({ page, request, browser }) => {
  // 방문자는 데모 브랜드의 것을 분석에서 읽는다.
  await page.goto("/analytics?role=브랜드")
  await page.getByRole("button", { name: "리포트 보기" }).first().click()
  await expect(page).toHaveURL(/\/insights\/sp-/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  for (const section of [
    "핵심 요약",
    "행사 개요와 협찬 조건",
    "목표 대비 성과",
    "관객 구성",
    "전환 퍼널과 이탈",
    "시간 분석",
    "매장 방문 분석",
    "비용 효율과 투자 회수",
    "평소 대비 효과",
    "계약 이행 · 후기 · 파트너 이력",
    "우리 브랜드 협찬 중 위치와 다음 제안",
    "측정 방법과 부록",
  ]) {
    await expect(page.getByRole("region", { name: section })).toBeVisible()
  }
  await expect(page.getByRole("img", { name: /종합 등급/ })).toBeVisible()
  // 데모는 읽기만 한다. 공유 링크도 쓸 매장 집계도 없다.
  await expect(page.getByRole("button", { name: "공유 링크 만들기" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "효과 계산하기" })).toHaveCount(0)

  // 회원이 오늘 행사를 협찬하면 가격이 붙은 미리보기가 나온다.
  const group = await signUpMember(request, "학생단체", "e2e-insight@syu.ac.kr", "리포트 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-insight@insight-cafe.kr", "리포트 카페")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "리포트 공연", date: today, types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const { requests } = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string }[] }
  await request.post(`/api/requests/${requests[0].id}/accept`, { headers: brand.headers })
  await request.get(`/api/agreements/${requests[0].id}`, { headers: brand.headers })
  const member = await (await browser.newContext()).newPage()
  await member.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await member.goto(`/insights/sp-${requests[0].id}`)
  await expect(member.getByText("화면에서 보는 숫자 너머의 리포트")).toBeVisible()
  await expect(member.locator(".insight-price")).toContainText("50,000원")
  // 사기 전에 샘플을 본다. 실제 수치가 아니라고 밝힌다.
  await member.getByRole("button", { name: "샘플 리포트 보기" }).click()
  await expect(member.getByText("예시 리포트예요. 실제 협찬의 수치가 아니에요.")).toBeVisible()
  await member.getByRole("button", { name: "돌아가기" }).click()
  await member.getByRole("button", { name: "리포트 사기" }).click()
  const pay = member.getByRole("dialog", { name: "상세 성과 리포트 결제" })
  await expect(pay).toContainText("연 뒤에는 환불되지 않아요")
  await pay.getByText("결제 내용을 확인했고").click()
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(member.getByText("계좌 입금을 요청했어요. 입금이 확인되면 리포트가 열려요.")).toBeVisible()
  for (const account of [group, brand]) {
    expect((await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: account.headers })).status()).toBe(204)
  }
})

test("a brand sees its plan in 내 정보 and asks to start Growth", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-plan@plan-cafe.kr", "요금제 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/me")
  const card = page.getByRole("region", { name: "요금제" })
  await expect(card).toContainText("무료 요금제 · 이번 달 협찬 제안 0/5건")
  await expect(card).toContainText("상세 분석 리포트 모두 포함")
  await card.getByRole("button", { name: "Growth 시작하기" }).click()
  const pay = page.getByRole("dialog", { name: "Growth 결제" })
  await expect(pay).toContainText("249,000원")
  await pay.getByText("결제 내용을 확인했고").click()
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(page.getByText("계좌 입금을 요청했어요. 입금이 확인되면 Growth가 시작돼요.")).toBeVisible()
  expect((await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: brand.headers })).status()).toBe(204)
})

test("the demo brand's 내 정보 shows its plan and payments; without test keys it can't pay", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  const dialog = page.getByRole("dialog", { name: "로그인" })
  await dialog.getByRole("button", { name: /오후의 커피/ }).click()
  await expect(dialog).toBeHidden()
  await page.goto("/me")
  const card = page.getByRole("region", { name: "요금제" })
  await expect(card).toContainText("무료 요금제")
  await expect(card.getByRole("button", { name: "Growth 시작하기" })).toBeDisabled()
  await expect(card).toContainText("데모 계정은 테스트 결제로만 시연할 수 있어요.")
  await page.getByRole("button", { name: "결제 내역" }).click()
  await expect(page.getByRole("dialog", { name: "결제 내역" })).toBeVisible()
})

test("the operators' console stands on its own: token, side menu, members and a member's record", async ({ page }) => {
  await page.goto("/admin")
  // 둘레에 회원 헤더나 푸터가 없다.
  await expect(page.getByRole("button", { name: "전체 메뉴" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "운영자 콘솔" })).toBeVisible()
  await page.getByText("공유 토큰으로 들어가기").click()
  await page.getByLabel("관리자 토큰").fill("wrong-token")
  await page.getByRole("button", { name: "들어가기" }).click()
  await expect(page.getByRole("alert")).toHaveText("토큰이 맞지 않거나 이미 닫혔어요.")
  await page.getByLabel("관리자 토큰").fill("e2e-admin-token")
  await page.getByRole("button", { name: "들어가기" }).click()
  await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  // 폰에서는 사이드 메뉴가 메뉴 버튼 뒤의 서랍이다.
  const menu = page.getByRole("navigation", { name: "운영자 메뉴" })
  const openMenu = () => page.getByRole("button", { name: "메뉴 접기 · 펴기" }).click()
  await expect(menu).toBeHidden()
  await openMenu()
  await expect(menu).toBeVisible()
  await menu.getByRole("button", { name: /회원/ }).click()
  await expect(menu).toBeHidden()
  await page.getByLabel("이름 · 이메일 · 학교로 찾기").fill("afternoon")
  await page.getByRole("button", { name: "오후의 커피" }).click()
  const detail = page.getByRole("complementary", { name: "오후의 커피" })
  await expect(detail).toContainText("hello@afternoon-coffee.kr")
  // 데모 계정은 정지할 수 없으므로 그 버튼이 없다.
  await expect(detail.getByRole("button", { name: "계정 정지" })).toHaveCount(0)
  await openMenu()
  await menu.getByRole("button", { name: /제안 · 협찬/ }).click()
  await page.getByText("예시 데이터도 보기").click()
  await expect(page.locator(".console-table tbody tr").first()).toBeVisible()
  await expect(page).toHaveURL(/\/admin\?view=proposals$/)

  // 뒤로와 앞으로는 콘솔을 지나며 열린 회원도 지난다.
  await page.goBack()
  await expect(page).toHaveURL(/view=members&member=/)
  await expect(page.getByRole("complementary", { name: "오후의 커피" })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole("complementary", { name: "오후의 커피" })).toHaveCount(0)
  await page.goForward()
  await expect(page.getByRole("complementary", { name: "오후의 커피" })).toBeVisible()
  // 로고는 콘솔의 첫 화면으로 이어진다.
  await openMenu()
  await page.getByRole("button", { name: "운영자 콘솔 처음으로" }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  // 상단 바의 검색은 찾은 회원을 연다.
  await page.getByLabel("회원 찾기").fill("muse")
  await page.getByLabel("회원 찾기").press("Enter")
  await expect(page).toHaveURL(/view=members&q=muse/)
  await expect(page.getByRole("button", { name: "삼육대 뮤즈" })).toBeVisible()
  await expect(page.getByRole("button", { name: "오후의 커피" })).toHaveCount(0)

  // 여기서 올린 공지는 방문자가 닫을 때까지 사이트 전체에 보이고, 올렸다는
  // 기록은 로그에 남는다.
  await openMenu()
  await menu.getByRole("button", { name: "공지" }).click()
  await page.getByLabel("내용", { exact: true }).fill("오늘 밤 점검이 있어요")
  // 보이는 기간은 팝오버로 사이트의 캘린더를 열고, 고른 날은 입력칸에 보이며
  // 지우면 지금부터로 돌아간다.
  const period = page.getByRole("button", { name: /게시 기간/ })
  await expect(period).toContainText("바로 올리고 내릴 때까지")
  await period.click()
  const picker = page.getByRole("dialog", { name: "게시 기간 고르기" })
  await picker.locator(".date-cell.today").click()
  await expect(period).not.toContainText("바로 올리고 내릴 때까지")
  await picker.getByRole("button", { name: "기간 비우기" }).click()
  await page.keyboard.press("Escape")
  await expect(picker).toHaveCount(0)
  await expect(period).toContainText("바로 올리고 내릴 때까지")
  await page.getByRole("button", { name: "공지 올리기" }).click()
  await expect(page.locator(".console-notices li.live")).toContainText("오늘 밤 점검이 있어요")
  await openMenu()
  await menu.getByRole("button", { name: "활동 기록" }).click()
  await expect(page.locator(".console-table")).toContainText("공지 올림")
  await page.goto("/faq")
  const notice = page.getByRole("status").filter({ hasText: "오늘 밤 점검이 있어요" })
  await expect(notice).toBeVisible()
  await notice.getByRole("button", { name: "공지 닫기" }).click()
  await expect(notice).toHaveCount(0)
  await page.reload()
  await expect(page.getByText("오늘 밤 점검이 있어요")).toHaveCount(0)
})

test("the console's command palette opens screens, and maintenance covers the site until it is switched off", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/admin")
  await page.getByText("공유 토큰으로 들어가기").click()
  await page.getByLabel("관리자 토큰").fill("e2e-admin-token")
  await page.getByRole("button", { name: "들어가기" }).click()
  await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()

  await page.keyboard.press("Control+k")
  const palette = page.getByRole("dialog", { name: "명령 팔레트" })
  await palette.getByRole("combobox").fill("분석")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { level: 1, name: "분석" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2, name: "전환 퍼널" })).toBeVisible()

  // "?"는 키보드 단축키를 보여 주고 Escape가 닫는다.
  await page.keyboard.press("?")
  await expect(page.getByRole("dialog", { name: "키보드 단축키" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "키보드 단축키" })).toHaveCount(0)

  await page.route("**/api/admin/system", (route) => route.fulfill({ status: 503, json: { message: "일시적인 오류" } }), { times: 1 })
  await page.getByRole("navigation", { name: "운영자 메뉴" }).getByRole("button", { name: "시스템" }).click()
  await expect(page.getByText("시스템 정보를 불러오지 못했어요.")).toBeVisible()
  await page.getByRole("button", { name: "다시 시도", exact: true }).click()
  await expect(page.getByText("현재 상태: 정상 운영")).toBeVisible()
  await page.getByLabel("점검 중: 회원 화면 대신 안내를 보여 주고 저장을 막아요").check()
  await page.getByLabel("안내 문구").fill("오늘 밤 점검이에요")
  await expect(page.getByText("현재 상태: 정상 운영")).toBeVisible()
  await page.getByRole("button", { name: "점검 모드 켜기" }).click()
  await expect(page.getByText("현재 상태: 전체 점검")).toBeVisible()
  await expect(page.getByText("점검 모드를 켰어요.")).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByRole("alert").filter({ hasText: "잠시 점검하고 있어요" })).toContainText("오늘 밤 점검이에요")

  await page.goto("/admin?view=system")
  await page.getByLabel("점검 중: 회원 화면 대신 안내를 보여 주고 저장을 막아요").uncheck()
  await page.getByRole("button", { name: "점검 모드 끄기" }).click()
  await expect(page.getByText("점검 설정을 저장했어요.")).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByText("잠시 점검하고 있어요")).toHaveCount(0)
})

test("a brand's 상세 보기 opens the campaign itself, with finding groups as its next step", async ({ page }) => {
  await page.goto("/campaigns")
  await logIn(page, "브랜드", "hello@afternoon-coffee.kr")
  await page.goto("/event/event-coffee-tasting")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("가을 신메뉴 캠퍼스 시음회")
  await expect(page.locator(".event-facts").first()).toContainText("목표 도달 300명")
  await expect(page.locator(".event-types")).toContainText("제품")
  await page.goBack()
  await page.goto("/campaigns")
  await page.locator(".events-next-open").click()
  await expect(page).toHaveURL(/\/event\/[^/]+$/)
  await page.goto("/event/event-coffee-tasting")
  await page.getByRole("button", { name: "단체 찾기" }).last().click()
  await expect(page).toHaveURL(/\/groups$/)
})

test("coming back from Kakao's page leaves the login popup usable", async ({ page }) => {
  await page.route("**/api/auth/social", (route) => route.fulfill({ json: { providers: ["kakao"] } }))
  await page.route("**/api/auth/social/kakao/start", (route) => route.fulfill({ json: { url: "#left" } }))
  await page.goto("/dashboard")
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  const kakao = page.getByRole("dialog").getByRole("button", { name: "카카오로 로그인" })
  await kakao.click()
  await expect(kakao).toBeDisabled()
  // Chrome's back/forward cache brings the page back as it was.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })))
  await expect(kakao).toBeEnabled()
})

test("a search box's X empties it and shows everything again", async ({ page }) => {
  await page.goto("/matches")
  await page.getByRole("tab", { name: "전체" }).click()
  const box = page.getByRole("searchbox", { name: /찾기|검색/ }).first()
  const all = await page.locator(".work-card").count()
  await expect(page.getByRole("button", { name: "검색어 지우기" })).toHaveCount(0)
  await box.fill("없는 브랜드 이름")
  await expect(page.locator(".work-card")).toHaveCount(0)
  await page.getByRole("button", { name: "검색어 지우기" }).click()
  await expect(box).toHaveValue("")
  await expect(box).toBeFocused()
  await expect(page.locator(".work-card")).toHaveCount(all)
})

test("a visitor compares the plans, and a plan still to come names no price", async ({ page }) => {
  await page.goto("/plans")
  const growth = page.locator(".plan-option", { hasText: "Growth" })
  await expect(growth.getByText("249,000원 / 30일")).toBeVisible()
  await expect(growth.getByText("부가세 포함 273,900원")).toBeVisible()
  const local = page.locator(".plan-option", { hasText: "Local" })
  await expect(local.getByText("준비 중")).toBeVisible()
  await expect(local).not.toContainText("원")
  await expect(page.locator(".plan-option")).toHaveCount(3)
  await growth.getByRole("button", { name: "회원가입" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("a chat can be searched, and clearing it brings every message back", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-search@search-cafe.kr", "검색 카페")
  const group = await signUpMember(request, "학생단체", "e2e-search@syu.ac.kr", "검색 동아리")
  const { headers } = group
  await request.put("/api/profile", { data: { intro: "캠퍼스 동아리예요.", offer: "관객 100명" }, headers })
  const { conversation } = await (await request.post("/api/conversations", { data: { partnerId: brand.listingId }, headers })).json()
  for (const text of ["사과 상자를 보낼게요", "일정은 금요일이에요"]) {
    await request.post(`/api/conversations/${conversation.id}/messages`, { data: { text }, headers })
  }
  await page.addInitScript((token) => localStorage.setItem("uniconnect-token", token), group.token)
  await page.goto(`/messages/${conversation.id}`)
  const box = page.getByRole("searchbox", { name: "대화 검색" })
  await box.fill("금요일")
  await expect(page.getByText("일정은 금요일이에요")).toBeVisible()
  await expect(page.getByText("사과 상자를 보낼게요")).toHaveCount(0)
  await box.fill("없는 말")
  await expect(page.getByText("맞는 메시지가 없어요.")).toBeVisible()
  await page.getByRole("button", { name: "검색어 지우기" }).click()
  await expect(page.getByText("사과 상자를 보낼게요")).toBeVisible()
})

test("pages with a code or token in the address load no analytics, and the site's own pages do", async ({ page }) => {
  for (const path of ["/check-in/none", "/ledger/none", "/report/none", "/invite/none"]) {
    await page.goto(path)
    await page.waitForLoadState("networkidle")
    expect(await page.evaluate(() => "gtag" in window)).toBe(false)
  }
  await page.goto("/faq")
  await page.waitForFunction(() => "gtag" in window)
})

test("an operator gives a reason when suspending", async ({ page, request }) => {
  const member = await signUpMember(request, "브랜드", "e2e-stop@stop-cafe.kr", "정지 카페")
  const accounts = (await (await request.get("/api/admin/accounts?q=e2e-stop", { headers: { "X-Admin-Token": "e2e-admin-token" } })).json()) as {
    accounts: { id: string }[]
  }
  await page.addInitScript(() => sessionStorage.setItem("uniconnect-admin-token", "e2e-admin-token"))
  await page.goto(`/admin?view=members&member=${accounts.accounts[0].id}`)
  await page.getByRole("button", { name: "계정 정지" }).click()
  await page.getByLabel("정지 사유 (회원에게 메일로 가요)").fill("약관을 어겼어요")
  await page.getByRole("button", { name: "정지할게요" }).click()
  await expect(page.getByRole("button", { name: "정지 풀기" })).toBeVisible()
  expect(member.token).toBeTruthy()
})

test("a brand sees Campus Local only once it's on sale, and runs its coupon from 내 정보", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-local@local-cafe.kr", "로컬 카페")
  await page.addInitScript((token) => localStorage.setItem("uniconnect-token", token), brand.token)
  await page.goto("/me")
  await expect(page.getByRole("button", { name: "Growth 시작하기" })).toBeVisible()
  await expect(page.getByText("Campus Local")).toHaveCount(0)

  const campaign = {
    code: "local-code",
    store: "로컬 카페",
    title: "아메리카노 500원 할인",
    staffPin: "123456",
    pinMissesToday: 0,
    open: true,
    couponDays: 7,
    totals: { scans: 10, coupons: 5, visits: 2 },
  }
  const info = { onSale: true, price: 79000, priceWithVat: 86900, days: 30, until: "2099-12-31", includedInGrowth: false, campaign }
  await page.route("**/api/local", (route) => route.fulfill({ json: info }))
  await page.route("**/api/local/report*", (route) =>
    route.fulfill({ json: { month: "2026-11", months: ["2026-11"], scans: 10, coupons: 5, visits: 2, couponRate: 50, visitRate: 40 } }),
  )
  await page.reload()
  await expect(page.getByText("아메리카노 500원 할인")).toBeVisible()
  await expect(page.getByRole("button", { name: "Campus Local 30일 연장하기" })).toBeVisible()
  await expect(page.getByRole("region", { name: "월간 리포트" })).toContainText("40%")
})

test("a member sees what a Local refund returns, and isn't asked to press again when it may have gone", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-refund@refund-cafe.kr", "환불 카페")
  await page.addInitScript((token) => localStorage.setItem("uniconnect-token", token), brand.token)
  const payment = { id: "pay-1", accountName: "환불 카페", kind: "local", targetId: "", orderName: "Campus Local 30일", amount: 86900, status: "paid", method: "card", requestedAt: "2026-11-01T00:00:00.000Z", paidAt: "2026-11-01T00:00:00.000Z" }
  await page.route("**/api/billing", async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), payments: [payment] } })
  })
  await page.route("**/api/billing/payments/pay-1/refund", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { amount: 40000, days: 14, whole: false } })
      : route.fulfill({ status: 503, json: { error: "잠시 뒤에 다시 시도해 주세요." } }),
  )
  await page.goto("/me")
  await page.getByRole("button", { name: "결제 내역" }).click()
  const dialog = page.getByRole("dialog", { name: "결제 내역" })
  await dialog.getByRole("button", { name: "환불", exact: true }).click()
  await expect(dialog).toContainText("40,000원")
  await expect(dialog).toContainText("환불하면 오늘로 이용이 끝나요.")
  await dialog.getByRole("button", { name: "환불받기" }).click()
  await expect(dialog).toContainText("몇 분 뒤에 결제 내역을 확인해 주세요.")
  await expect(dialog.getByRole("button", { name: "환불받기" })).toHaveCount(0)
})

test("an always-on coupon shows no event date, and says when it's closed", async ({ page }) => {
  await page.route("**/api/check-in/always", (route) =>
    route.fulfill({ json: { eventName: "로컬 카페", eventDate: "2026-11-01", groupName: "", coupons: [], alwaysOn: true, open: false, couponDays: 7 } }),
  )
  await page.route("**/api/check-in/always/*", (route) => route.fulfill({ status: 409, json: { error: "새 쿠폰을 받을 수 없어요." } }))
  await page.goto("/check-in/always")
  await expect(page.getByText("지금은 새 쿠폰을 받을 수 없어요.")).toBeVisible()
  await expect(page.getByText("2026")).toHaveCount(0)
})

test("both sides record a cash payment on the agreement, which says the platform doesn't check it", async ({ page, request, browser }) => {
  const later = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 10 * 86_400_000))
  const due = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 5 * 86_400_000))
  const group = await signUpMember(request, "학생단체", "e2e-payout@syu.ac.kr", "지급 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-payout@payout-cafe.kr", "지급 카페")
  await request.post("/api/events", { data: { name: "지급 공연", date: later, people: "100명", types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const inbox = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string; groupName: string }[] }
  const proposal = inbox.requests.find((item) => item.groupName === "지급 동아리")!
  await request.post(`/api/requests/${proposal.id}/accept`, { headers: brand.headers })
  await request.put(`/api/agreements/${proposal.id}/value`, { data: { value: { cash: 100000, inKind: 0 } }, headers: group.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/agreements/${proposal.id}`)
  const panel = page.getByRole("region", { name: "협찬금 지급" })
  await expect(panel).toContainText("입금 여부는 플랫폼이 확인하지 않아요.")
  await panel.getByLabel("지급 예정일").fill(due)
  await panel.getByRole("button", { name: "예정일 저장" }).click()
  await expect(page.getByText("지급 예정일을 정했어요. 두 쪽 모두 다시 확인해 주세요.")).toBeVisible()

  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto(`/agreements/${proposal.id}`)
  await brandPage.getByRole("button", { name: "협찬금을 보냈어요" }).click()
  await expect(brandPage.getByRole("region", { name: "협찬금 지급" })).toContainText("100,000원")

  await page.reload()
  await expect(panel).toContainText("보냄")
  await panel.getByRole("button", { name: "협찬금을 받았어요" }).click()
  await expect(panel).toContainText("받음")
  await expect(panel.getByLabel("지급 예정일")).toBeDisabled()
})

test("a declined card refund offers a refund by bank transfer", async ({ page }) => {
  const payment = {
    id: "pay-x", accountId: "acc-x", accountName: "환불 카페", kind: "local", targetId: "", orderName: "Campus Local 30일",
    amount: 86900, status: "paid", method: "card", card: true, requestedAt: "2026-11-01T00:00:00.000Z", paidAt: "2026-11-01T00:00:00.000Z",
  }
  let tries = 0
  const bodies: unknown[] = []
  await page.route("**/api/admin/payments", (route) => route.fulfill({ json: { payments: [payment] } }))
  await page.route("**/api/admin/payments/pay-x/refund", (route) => route.fulfill({ json: { amount: 40000, days: 14, whole: false } }))
  await page.route("**/api/admin/payments/pay-x/cancel", (route) => {
    bodies.push(route.request().postDataJSON())
    tries += 1
    return tries === 1
      ? route.fulfill({ status: 409, json: { error: "환불하지 못했어요. 카드사가 부분 취소를 받지 않았어요." } })
      : route.fulfill({ json: { payment: { ...payment, refundedAmount: 40000 } } })
  })
  await page.addInitScript(() => sessionStorage.setItem("uniconnect-admin-token", "e2e-admin-token"))
  await page.goto("/admin?view=payments")
  await page.getByRole("tab", { name: /결제 완료/ }).click()
  await page.getByRole("button", { name: "환불", exact: true }).click()
  await expect(page.getByText("40,000원").first()).toBeVisible()
  await page.getByRole("button", { name: "카드 결제 환불하기" }).click()
  await expect(page.getByText("카드 환불이 거절됐어요.", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "계좌로 직접 돌려주기" }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toMatchObject({ outside: true })
})

test("a refund turned away for another reason doesn't ask for a bank refund", async ({ page }) => {
  const payment = {
    id: "pay-y", accountId: "acc-y", accountName: "환불 카페", kind: "local", targetId: "", orderName: "Campus Local 30일",
    amount: 86900, status: "paid", method: "card", card: true, requestedAt: "2026-11-01T00:00:00.000Z", paidAt: "2026-11-01T00:00:00.000Z",
  }
  await page.route("**/api/admin/payments", (route) => route.fulfill({ json: { payments: [payment] } }))
  await page.route("**/api/admin/payments/pay-y/refund", (route) => route.fulfill({ json: { amount: 86900, days: null, whole: true } }))
  await page.route("**/api/admin/payments/pay-y/cancel", (route) => route.fulfill({ status: 409, json: { error: "이미 취소된 결제예요." } }))
  await page.addInitScript(() => sessionStorage.setItem("uniconnect-admin-token", "e2e-admin-token"))
  await page.goto("/admin?view=payments")
  await page.getByRole("tab", { name: /결제 완료/ }).click()
  await page.getByRole("button", { name: "환불", exact: true }).click()
  await page.getByRole("button", { name: "카드 결제 환불하기" }).click()
  await expect(page.getByText("이미 취소된 결제예요.")).toBeVisible()
  await expect(page.getByRole("button", { name: "계좌로 직접 돌려주기" })).toHaveCount(0)
})


test("the venue QR opens on the participants' view, and PINs only behind 운영자용 PIN", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await page.goto("/measurement")
  await page.getByRole("button", { name: "현장 QR 열기" }).click()
  const dialog = page.getByRole("dialog", { name: "현장 참여 QR" })
  await expect(dialog.getByRole("tab", { name: "참여자용" })).toHaveAttribute("aria-selected", "true")
  await expect(dialog.locator(".qr-content")).not.toContainText("PIN")
  await expect(dialog.locator(".qr-op-card")).toHaveCount(0)
  // 행사장에 띄우면 QR과 안내뿐이다.
  await dialog.getByRole("button", { name: "행사장에 띄우기" }).click()
  const shown = page.getByRole("dialog", { name: "행사장에 띄운 참여 QR" })
  await expect(shown).toBeVisible()
  await expect(shown).not.toContainText("PIN")
  // 띄운 화면 안에서만 초점이 돈다(뒤의 '행사 고르기'로 빠지지 않는다).
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press("Tab")
    expect(await shown.evaluate((layer) => layer.contains(document.activeElement))).toBe(true)
  }
  // Esc는 띄우기만 끝내고 QR 창으로, 초점은 '행사장에 띄우기'로 돌아온다.
  await page.keyboard.press("Escape")
  await expect(shown).toBeHidden()
  await expect(page.getByRole("dialog", { name: "현장 참여 QR" })).toBeVisible()
  await expect(page.getByRole("button", { name: "행사장에 띄우기" })).toBeFocused()
  // 운영자용은 띄우지 말라는 안내와 함께 따로 열린다.
  await page.getByRole("dialog", { name: "현장 참여 QR" }).getByRole("tab", { name: "운영자용 PIN" }).click()
  await expect(page.getByText("이 화면은 행사장에 띄우지 마세요.", { exact: false })).toBeVisible()
  // 협찬사의 매장 PIN은 단체에게 오지 않는다. 단체 PIN과 매장 PIN이 있는 곳만 보인다.
  const operators = page.getByRole("dialog", { name: "현장 참여 QR" }).locator(".qr-content.operators")
  await expect(operators).toContainText("단체 확인 PIN")
  await expect(operators).toContainText("협찬 브랜드만 계약서에서 확인해요")
  await expect(operators).not.toContainText("101234")
  // 매장 직원용과 우리 단체용은 각자의 카드이고, 주소를 복사하면 결과를 알려 준다.
  await expect(operators.locator(".qr-op-card")).toHaveCount(2)
  await operators.getByRole("button", { name: "단체용 주소 복사" }).click()
  await expect(page.getByText(/주소를 복사했어요|복사하지 못했어요/)).toBeVisible()
  // 운영자용 카드는 휴대폰 폭마다 시트 안에 들어가고, 긴 주소는 카드 안에서 줄바꿈한다.
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 800 })
    const sheet = (await page.getByRole("dialog", { name: "현장 참여 QR" }).boundingBox())!
    expect(sheet.x).toBeGreaterThanOrEqual(0)
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(width + 0.5)
    for (const box of await operators.locator(".qr-op-card, .qr-op-card .qr-link").all()) {
      const rect = (await box.boundingBox())!
      expect(rect.x).toBeGreaterThanOrEqual(sheet.x)
      expect(rect.x + rect.width).toBeLessThanOrEqual(sheet.x + sheet.width + 0.5)
    }
    const body = page.locator(".qr-body")
    expect(await body.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
  }
  // 참여자용으로 돌아가도 넘치지 않는다.
  await page.getByRole("dialog", { name: "현장 참여 QR" }).getByRole("tab", { name: "참여자용" }).click()
  expect(await page.locator(".qr-body").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
})

for (const [role, email] of [["학생단체", "muse@syu.ac.kr"], ["브랜드", "hello@afternoon-coffee.kr"]] as const) {
  test(`a logged-in ${role} sees its main action on the first 390x844 screen`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await logIn(page, role, email)
    await page.goto("/dashboard")
    // 회원의 첫머리는 그라데이션 히어로가 아니라 지금 할 일과 다음 행동이다.
    await expect(page.locator(".meeting-hero")).toHaveCount(0)
    const top = page.locator(".dash-top")
    await expect(top.getByRole("heading", { level: 1 })).toBeVisible()
    const main = top.locator(".dash-top-actions .pill").first()
    await expect(main).toBeVisible()
    const box = (await main.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(844)
  })
}

test("the sponsorship steps stack on phones and sit in one row of five on wide cards", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/")
  await logIn(page, "브랜드", "hello@afternoon-coffee.kr")
  await page.goto("/inbox")
  await page.getByRole("tab", { name: /수락/ }).first().click()
  const steps = page.locator(".request-progress").first()
  await expect(steps.locator("li")).toHaveCount(5)
  await expect(steps.locator('li[aria-current="step"]')).toHaveCount(1)
  const tops = async () => Promise.all((await steps.locator("li i").all()).map(async (dot) => (await dot.boundingBox())!.y))
  // 넓은 카드: 다섯 점이 한 줄에 있다(4개 + 1개로 꺾이지 않는다).
  expect(new Set((await tops()).map(Math.round)).size).toBe(1)
  // 휴대폰: 위에서 아래로 쌓이고 카드 밖으로 나가지 않는다.
  await page.setViewportSize({ width: 320, height: 800 })
  const stacked = await tops()
  expect(stacked.every((y, index) => index === 0 || y > stacked[index - 1])).toBe(true)
  const card = (await page.locator(".request-card", { has: steps }).first().boundingBox())!
  for (const dot of await steps.locator("li").all()) {
    const box = (await dot.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(card.x)
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5)
  }
})

test("a match card puts its score at the top right, its actions at the bottom right and save and compare at the top", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await page.goto("/matches")
  const card = page.locator(".work-card").first()
  await expect(card.getByRole("button", { name: "상세 정보" })).toBeVisible()
  // 카드는 차례로 미끄러져 들어오므로, 움직임이 끝난 뒤에 잰다.
  // 끝없이 도는 움직임은 기다리지 않는다.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  const detail = (await card.getByRole("button", { name: "상세 정보" }).boundingBox())!
  // 둘째 칸은 제안하기 버튼이거나, 보낸 뒤에는 그 자리의 상태(제안 보냄, 협찬 확정)다.
  const propose = (await card.locator(".work-actions .primary-button, .work-actions .proposal-button").first().boundingBox())!
  expect(Math.round(detail.y)).toBe(Math.round(propose.y))
  expect(Math.round(detail.height)).toBe(Math.round(propose.height))
  expect(detail.height).toBeGreaterThanOrEqual(44)
  // 행동 줄은 오른쪽 아래: 제안하기가 카드의 오른쪽 패딩 선에 붙고, 상세 정보는 그 왼쪽이다.
  const box = (await card.boundingBox())!
  const pad = await card.evaluate((element) => parseFloat(getComputedStyle(element).paddingRight))
  expect(Math.abs(box.x + box.width - pad - (propose.x + propose.width))).toBeLessThanOrEqual(1)
  expect(detail.x + detail.width).toBeLessThanOrEqual(propose.x)
  // 추천 지수는 이름 줄의 오른쪽 위, 같은 오른쪽 선에 서고 이름과 겹치지 않는다.
  const score = (await card.locator(".score-badge").boundingBox())!
  expect(Math.abs(box.x + box.width - pad - (score.x + score.width))).toBeLessThanOrEqual(1)
  const title = (await card.locator(".work-name").boundingBox())!
  expect(title.x + title.width).toBeLessThanOrEqual(score.x)
  expect(Math.abs(score.y - title.y)).toBeLessThanOrEqual(2)
  // 찜과 비교는 위쪽, 이름보다 위에 있다.
  const heart = (await card.locator(".save-toggle").boundingBox())!
  const name = (await card.locator(".work-title h3").boundingBox())!
  expect(heart.y + heart.height).toBeLessThanOrEqual(name.y + 1)
  expect(heart.width).toBeGreaterThanOrEqual(44)
})

test("on phones the calendar is a compact date picker and the chosen day lists its events", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-picker@syu.ac.kr", "달력 밴드")
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  for (const name of ["아주 긴 이름을 가진 첫 번째 정기 공연", "두 번째 공연", "세 번째 공연", "네 번째 공연"]) {
    await request.post("/api/events", { data: { name, date: day, people: "100명", types: ["제품"] }, headers: group.headers })
  }
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto("/events")
  const busy = page.locator(".calendar-day.has-events").first()
  // 칸에는 이름이 없고 점 둘과 남은 개수만 있다.
  await expect(busy.locator(".day-event").first()).toBeHidden()
  await expect(busy.locator(".day-dots i")).toHaveCount(2)
  await expect(busy.locator(".day-dots small")).toHaveText("+2")
  for (const cell of await page.locator(".calendar-day").all()) {
    const box = (await cell.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(56)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  // 다른 날을 고르면 그날의 목록으로 바뀌고, 그날을 다시 고르면 네 행사가 보인다.
  const other = page.locator(".calendar-day:not(.has-events):not(.outside)").first()
  await other.click()
  await expect(other).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(".day-panel .day-empty")).toBeVisible()
  await busy.click()
  await expect(page.locator(".day-panel .day-event-card")).toHaveCount(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("a new screen starts at the top, back returns to where the list was, and in-page actions keep the place", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await page.goto("/matches")
  // 정렬은 같은 화면 안의 조작이고, 뒤로 돌아와도 그 정렬이다.
  await page.locator(".catalog-conditions-toggle").click()
  await page.locator(".sort-choice label", { hasText: "인기순" }).click()
  const cards = page.locator(".work-card")
  await expect(cards.nth(5)).toBeVisible()
  const last = cards.last()
  const scrollY = () => page.evaluate(() => window.scrollY)

  // 찜은 같은 화면 안의 조작이라 위치가 그대로다.
  await last.locator(".save-toggle").scrollIntoViewIfNeeded()
  const atHeart = await scrollY()
  expect(atHeart).toBeGreaterThan(500)
  await last.locator(".save-toggle").click()
  await expect(last.locator(".save-toggle")).toHaveAttribute("aria-pressed", "true")
  expect(Math.abs((await scrollY()) - atHeart)).toBeLessThan(4)

  // 카드 상세는 맨 위에서 시작한다.
  const detail = last.getByRole("button", { name: "상세 정보" })
  await detail.scrollIntoViewIfNeeded()
  const leaving = await scrollY()
  await detail.click()
  await expect(page.locator(".profile-actions")).toBeVisible()
  expect(await scrollY()).toBe(0)

  // 뒤로 가면 목록의 그 자리로 돌아온다.
  await page.goBack()
  await expect(page.getByRole("list", { name: "걸린 조건" })).toContainText("인기순")
  await expect(last).toBeVisible()
  await expect.poll(scrollY).toBeGreaterThan(leaving - 4)
  expect(Math.abs((await scrollY()) - leaving)).toBeLessThan(4)

  // 아래쪽에서 다른 메뉴로 가면 새 화면의 맨 위에서 시작한다.
  await page.locator("footer").getByRole("button", { name: "받은 협찬" }).click()
  await expect(page).toHaveURL(/\/offers/)
  expect(await scrollY()).toBe(0)
  // 뒤로는 목록의 자리로, 다시 앞으로는 받은 협찬의 맨 위로.
  await page.goBack()
  await expect.poll(scrollY).toBeGreaterThan(500)
  await page.goForward()
  await expect(page).toHaveURL(/\/offers/)
  await expect.poll(scrollY).toBe(0)
})

test("when accepting fails the confirmation stays open to try again, and a retry accepts once", async ({ page, request }) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 10 * 86_400_000))
  const group = await signUpMember(request, "학생단체", "e2e-accept-fail@syu.ac.kr", "수락 실패 밴드")
  const brand = await signUpMember(request, "브랜드", "e2e-accept-fail@fail-cafe.kr", "수락 실패 카페")
  await request.post("/api/events", { data: { name: "실패 공연", date: today, people: "100명", types: ["제품"] }, headers: group.headers })
  expect((await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })).status()).toBeLessThan(300)
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/inbox")
  const card = page.locator(".request-card", { hasText: "수락 실패 밴드" })
  await card.getByRole("button", { name: "수락하기" }).click()
  const dialog = page.getByRole("dialog", { name: "이 제안을 수락할까요?" })
  // 서버에 닿지 못하면 확인창은 열린 채 이유를 말한다.
  await page.route("**/api/requests/*/accept", (route) => route.abort("internetdisconnected"))
  await dialog.getByRole("button", { name: "수락하기" }).click()
  await expect(dialog.getByRole("alert")).toContainText("수락하지 못했어요")
  await expect(dialog).toBeVisible()
  // 연결이 돌아오면 다시 눌러 한 번만 수락된다.
  await page.unroute("**/api/requests/*/accept")
  let calls = 0
  page.on("request", (sent) => {
    if (sent.url().includes("/accept")) calls++
  })
  await dialog.getByRole("button", { name: "다시 수락하기" }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole("tab", { name: /수락함/ }).click()
  await expect(page.locator(".request-card", { hasText: "수락 실패 밴드" })).toContainText("계약 확인 대기")
  expect(calls).toBe(1)
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("an event being registered survives a reload as a draft, and goes once it is registered", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-draft@syu.ac.kr", "초안 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/events")
  await page.getByRole("button", { name: "새로 등록" }).click()
  await page.getByLabel("행사명").fill("초안으로 남는 공연")
  await expect(page.locator(".draft-status")).toContainText("임시 저장됨")
  // 새로고침해도 쓰던 이름이 돌아오고, 불러왔다고 알린다.
  page.once("dialog", (dialog) => void dialog.accept())
  await page.reload()
  await expect(page.getByLabel("행사명")).toHaveValue("초안으로 남는 공연")
  await expect(page.locator(".draft-banner")).toContainText("초안을 불러왔어요")
  // 다른 계정에는 이 초안이 보이지 않는다.
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("uniconnect-draft:")))
  expect(keys).toHaveLength(1)
  expect(keys[0]).toContain(":new")
  // 등록하면 초안이 사라진다.
  await page.getByText("현금", { exact: true }).first().click()
  await page.getByRole("button", { name: "등록하고 매칭 받기" }).click()
  await expect(page).not.toHaveURL(/\/new/)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("uniconnect-draft:")))).toHaveLength(0)
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("a draft keeps what was typed just before leaving, waits out a slow session check, and stays when registering fails", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-draft-edge@syu.ac.kr", "경계 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  const drafts = () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("uniconnect-draft:")))
  await page.goto("/events")
  await page.getByRole("button", { name: "새로 등록" }).click()
  // 0.5초 저장 대기가 끝나기 전에 바로 새로고침해도 쓰던 이름이 남는다.
  await page.getByLabel("행사명").fill("바로 새로고침한 공연")
  page.once("dialog", (dialog) => void dialog.accept())
  await page.reload()
  await expect(page.getByLabel("행사명")).toHaveValue("바로 새로고침한 공연")

  // 다른 화면으로 바로 가도(앱 안의 이동) 남는다.
  await page.getByLabel("행사명").fill("바로 떠난 공연")
  await page.goBack()
  await expect(page).not.toHaveURL(/\/new/)
  await page.goForward()
  await expect(page.getByLabel("행사명")).toHaveValue("바로 떠난 공연")

  // 세션 확인이 늦은 채로 등록 주소를 바로 열어도 그 계정의 초안이 돌아온다.
  const url = page.url()
  await page.route("**/api/auth/me", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto(url)
  await expect(page.getByLabel("행사명")).toHaveValue("바로 떠난 공연")
  await page.unroute("**/api/auth/me")

  // 서버가 등록을 받지 않으면 초안은 그대로 남고, 고친 것도 계속 저장된다.
  await page.route("**/api/events", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "잠시 후 다시 시도해 주세요." }) })
      : route.continue(),
  )
  await page.getByText("현금", { exact: true }).first().click()
  await page.getByRole("button", { name: "등록하고 매칭 받기" }).click()
  await expect(page.getByText("잠시 후 다시 시도해 주세요.").first()).toBeVisible()
  await expect(page).toHaveURL(/\/new/)
  expect(await drafts()).toHaveLength(1)
  await page.getByLabel("행사명").fill("다시 보내는 공연")
  await expect(page.locator(".draft-status")).toContainText("임시 저장됨")
  await page.unroute("**/api/events")

  // 로그아웃하면 이 계정의 초안이 지워지고, 내려가던 양식이 다시 쓰지 않는다.
  await page.getByLabel("행사명").fill("로그아웃 직전의 공연")
  await page.getByRole("button", { name: "내 계정" }).click()
  await page.getByRole("region", { name: "내 계정" }).getByRole("button", { name: "로그아웃" }).click()
  await expect(page.getByText("로그아웃했어요.")).toBeVisible()
  expect(await drafts()).toHaveLength(0)
  // 로그아웃으로 그 토큰은 끝났으니 다시 로그인해서 정리한다.
  const again = await request.post("/api/auth/login", { data: { role: "학생단체", email: "e2e-draft-edge@syu.ac.kr", password: "e2e-pass-123" } })
  const { token } = (await again.json()) as { token: string }
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: { Authorization: `Bearer ${token}` } })
  expect(left.status()).toBe(204)
})

test("a member's dashboard opens on the work waiting for them, and each row leads to it", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "브랜드", "hello@afternoon-coffee.kr")
  await page.goto("/dashboard")
  const board = page.getByRole("region", { name: "지금 확인할 일" })
  // 내가 할 일, 상대를 기다리는 일, 일정 · 결과로 나뉜다. 상대만 할 일이 남은 것은
  // 내 할 일에 들지 않는다.
  await expect(board.getByRole("listitem")).toHaveCount(7)
  await expect(board.getByRole("list", { name: "내가 할 일" }).getByRole("listitem")).toHaveCount(3)
  await expect(board.getByRole("list", { name: "상대를 기다리는 일" })).toContainText("상대 확인 대기")
  await expect(board.getByRole("button", { name: /증빙 남은 할 일/ })).toBeVisible()
  // 소개 구역은 회원 대시보드에 없다.
  await expect(page.locator(".about-statement-section")).toHaveCount(0)
  await expect(page.locator(".why-uniconnect, .value-points")).toHaveCount(0)
  await board.getByRole("button", { name: /검토할 제안/ }).click()
  await expect(page).toHaveURL(/\/inbox$/)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

// #334: 학생단체 대표가 서류 둘을 내고, 운영자가 가입 승인에서 두 서류를 보고 승인하면
// 내 정보에 확인과 기한이 보인다.
test("a group sends its verification documents, and an operator approves them in the console", async ({ page, request, browser }) => {
  const group = await signUpMember(request, "학생단체", "e2e-verify@syu.ac.kr", "확인 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/me")
  await page.getByRole("button", { name: "단체 확인 신청하기" }).click()
  const modal = page.getByRole("dialog", { name: "학생단체 확인" })
  await modal.getByLabel("대표자 이름").fill("김대표")
  await modal.getByLabel("재학 증명").setInputFiles({ name: "재학증명서.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 enrolled") })
  await modal.getByLabel("단체 소속 증빙").setInputFiles({ name: "임명장.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 member") })
  await expect(modal).toContainText("임명장.pdf")
  await modal.getByRole("button", { name: "확인 요청 보내기" }).click()
  await expect(modal).toBeHidden()
  await expect(page.getByText("서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요.")).toBeVisible()
  await expect(page.getByText("운영자가 서류를 보고 있어요")).toBeVisible()

  const console = await (await browser.newContext()).newPage()
  await console.goto("/admin")
  await console.getByText("공유 토큰으로 들어가기").click()
  await console.getByLabel("관리자 토큰").fill("e2e-admin-token")
  await console.getByRole("button", { name: "들어가기" }).click()
  await expect(console.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  await console.goto("/admin?view=approvals")
  const row = console.locator(".console-approvals li", { hasText: "e2e-verify@syu.ac.kr" })
  await expect(row).toContainText("확인 동아리 · 학생단체 확인")
  await expect(row).toContainText("대표자 김대표 · 삼육대학교")
  const download = console.waitForEvent("download")
  await row.getByRole("button", { name: "소속 증빙 내려받기" }).click()
  expect((await download).suggestedFilename()).toBe("임명장.pdf")
  await row.getByRole("button", { name: "승인" }).click()
  await expect(console.getByText("확인 동아리의 학생단체 확인을 승인했어요.")).toBeVisible()

  await page.reload()
  await expect(page.locator(".settings-row", { hasText: "단체 확인" })).toContainText("확인됨 ·")
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

// #335: 계약서에서 분쟁을 접수하고, 양쪽이 말과 증빙을 남기며, 결론 전에는 탈퇴할 수
// 없고, 운영자는 콘솔에서 확인을 시작해 결론을 기록한다.
test("either side of an agreement opens a dispute, both add to it, and an operator records a conclusion", async ({ page, request, browser }) => {
  const later = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 10 * 86_400_000))
  const group = await signUpMember(request, "학생단체", "e2e-dispute@syu.ac.kr", "분쟁 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-dispute@dispute-cafe.kr", "분쟁 카페")
  await request.post("/api/events", { data: { name: "분쟁 공연", date: later, people: "100명", types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })
  const inbox = (await (await request.get("/api/requests", { headers: brand.headers })).json()) as { requests: { id: string; groupName: string }[] }
  const proposal = inbox.requests.find((item) => item.groupName === "분쟁 동아리")!
  await request.post(`/api/requests/${proposal.id}/accept`, { headers: brand.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/agreements/${proposal.id}`)
  const panel = page.getByRole("region", { name: "협찬 분쟁" })
  await panel.getByRole("button", { name: "분쟁 접수" }).click()
  await panel.getByLabel("어떤 일인가요").selectOption("payout")
  await panel.getByLabel("있었던 일").fill("약속한 날까지 협찬금이 들어오지 않았어요.")
  await panel.getByRole("button", { name: "분쟁 접수하기" }).click()
  await expect(page.getByText("분쟁을 접수했어요. 분쟁 카페에 알렸어요.")).toBeVisible()
  const record = panel.locator(".dispute-record")
  await expect(record).toContainText("협찬금 지급")
  await expect(record).toContainText("접수됨")
  await expect(record).toContainText("우리가 접수")
  await record.getByLabel("남길 말").fill("입금 내역을 확인해 주세요.")
  await record.getByRole("button", { name: "남기기" }).click()
  await expect(record).toContainText("입금 내역을 확인해 주세요.")
  await expect(record).toContainText("1/20번 남겼어요")
  await expect(record).toContainText("올린 증빙은 상대방과 운영자도 볼 수 있어요.")
  await record.locator(".dispute-upload input").setInputFiles({ name: "통장내역.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 bank") })
  await expect(record.getByRole("button", { name: /통장내역\.pdf/ })).toBeVisible()

  // 결론이 나기 전에는 당사자가 탈퇴할 수 없다.
  const leave = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(leave.status()).toBe(409)

  // 상대는 같은 기록을 보고 말을 남기지만, 거둘 수는 없다.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto(`/agreements/${proposal.id}`)
  const brandRecord = brandPage.getByRole("region", { name: "협찬 분쟁" }).locator(".dispute-record")
  await expect(brandRecord).toContainText("분쟁 동아리에서 접수")
  await expect(brandRecord.getByRole("button", { name: /통장내역\.pdf/ })).toBeVisible()
  await expect(brandRecord.getByRole("button", { name: "분쟁 거두기" })).toHaveCount(0)
  // 상대가 접수했어도 운영자가 판단할 '접수할 때의 계약'을 같이 본다.
  await brandRecord.getByText("접수할 때의 계약 보기").click()
  await expect(brandRecord.locator(".dispute-snapshot")).toContainText("양쪽 모두 확인하기 전이었어요")
  await expect(brandRecord.locator(".dispute-snapshot li").first()).toBeVisible()
  await brandRecord.getByLabel("남길 말").fill("이번 주 안에 보낼게요.")
  await brandRecord.getByRole("button", { name: "남기기" }).click()
  await expect(brandRecord).toContainText("이번 주 안에 보낼게요.")

  // 운영자가 확인을 시작하고 결론을 기록한다.
  const console = await (await browser.newContext()).newPage()
  await console.goto("/admin")
  await console.getByText("공유 토큰으로 들어가기").click()
  await console.getByLabel("관리자 토큰").fill("e2e-admin-token")
  await console.getByRole("button", { name: "들어가기" }).click()
  await expect(console.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  await console.goto("/admin?view=disputes")
  const row = console.locator(".console-approvals li", { hasText: "분쟁 공연" })
  await row.getByRole("button", { name: "열기" }).click()
  const detail = console.getByRole("region", { name: "분쟁 분쟁 공연" })
  await expect(detail).toContainText("이번 주 안에 보낼게요.")
  await expect(detail).toContainText("양쪽 모두 확인하기 전이었어요")
  await detail.getByRole("button", { name: "확인 시작" }).click()
  await expect(console.getByText("확인을 시작했어요. 양쪽에 알렸어요.")).toBeVisible()
  await detail.getByLabel("운영자 메모").fill("양쪽에 입금 일정을 물어볼 것")
  await detail.getByRole("button", { name: "메모 남기기" }).click()
  await expect(detail).toContainText("양쪽에 입금 일정을 물어볼 것")
  await detail.getByRole("combobox").selectOption("agreed")
  await detail.getByLabel("결론의 이유").fill("브랜드가 이번 주 안에 보내기로 합의했어요.")
  await detail.getByRole("checkbox").check()
  await detail.getByRole("button", { name: "결론 기록하기" }).click()
  await expect(console.getByText("결론을 기록했어요. 양쪽에 알렸어요.")).toBeVisible()

  // 당사자에게는 결론이 보이고 운영자 메모는 보이지 않는다.
  await page.reload()
  await expect(record).toContainText("양쪽 합의")
  await expect(record).toContainText("브랜드가 이번 주 안에 보내기로 합의했어요.")
  await expect(record).not.toContainText("양쪽에 입금 일정을 물어볼 것")
  await expect(record.getByLabel("남길 말")).toHaveCount(0)
})
