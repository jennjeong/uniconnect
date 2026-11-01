import { readFile } from "node:fs/promises"

import { expect, test, type Page } from "@playwright/test"

import { codeAt, stepAt } from "../backend/src/lib/totp"
import { signUpMember } from "./members"

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

test("search engines find the sitemap from robots.txt", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toContain("Sitemap: https://uniconnect-pied.vercel.app/sitemap.xml")
  const sitemap = await request.get("/sitemap.xml")
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()["content-type"]).toMatch(/xml/)
  const xml = await sitemap.text()
  expect(xml).toContain("<loc>https://uniconnect-pied.vercel.app/faq</loc>")
  // Screens kept out of search stay out of it.
  expect(xml).not.toContain("/dashboard")
})

test("visitors browse the site, its help and its 404 page", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/uniconnect/)
  // The introduction leads to the example dashboard, marked as an example,
  // and back.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("좋은 행사와")
  await page.getByRole("button", { name: "예시 화면 둘러보기" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator(".demo-chip")).toHaveText("예시 화면")
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("좋은 행사와")
  await page.goto("/matches")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/terms")
  await expect(page.getByRole("heading", { name: "서비스 이용약관" })).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/no-such-page")
  await expect(page.getByText("페이지를 찾을 수 없어요").first()).toBeVisible()
})

test("a visitor sees made-up shops and the example groups on the nearby tabs", async ({ page }) => {
  // Nearby shops and groups depend on the account's campus or store, so a
  // visitor sees examples in full, under a note that says so. The test
  // server has no map key, and the made-up shops need none.
  await page.goto("/matches")
  await page.getByRole("tab", { name: "가까운 순" }).click()
  await expect(page.getByRole("note")).toContainText("학교마다 근처 가게가 달라요")
  await expect(page.getByText("삼육대학교 근처에 있다고 가정해 만든 예시 가게예요. 가까운 순서예요.")).toBeVisible()
  await expect(page.getByText("예시로 만든 가게예요. 실제 가게나 카카오의 정보가 아니에요.")).toBeVisible()
  // The nearest made-up shop has no Kakao Map page, and inviting it asks to log in.
  const shop = page.locator(".work-card").first()
  await expect(shop).toContainText("정문분식")
  await expect(shop.getByRole("link")).toHaveCount(0)
  await page.getByRole("button", { name: "학원", exact: true }).click()
  await expect(page.locator(".work-card").first()).toContainText("토익스퀘어 어학원")
  await page.getByRole("button", { name: "토익스퀘어 어학원 초대하기" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()

  await page.goto("/groups")
  await page.getByRole("tab", { name: "가까운 순" }).click()
  await expect(page.getByRole("note")).toContainText("매장마다 가까운 학생단체가 달라요")
  // The example groups, nearest the demo brand's store first.
  await expect(page.locator(".work-card").first()).toContainText("과기대 소리샘")
  await page.getByRole("note").getByRole("button", { name: "회원가입" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("the menu counts what waits for a member, and nothing for a visitor", async ({ page }) => {
  const menu = page.locator("#site-menu")
  const openMenu = () => page.getByRole("button", { name: "전체 메뉴" }).click()
  // A visitor sees the demo accounts' inboxes as examples; their counts
  // would read as the visitor's own notifications.
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
  // Logged in, the brand sees its own unanswered proposals counted.
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
  // Kept on the account: after a reload the notices are there, all read.
  await page.reload()
  await bell.click()
  await expect(panel.locator(".notification-list > button").first()).toBeVisible()
  await expect(panel.locator("button.unread")).toHaveCount(0)
  await expect(dot).toHaveCount(0)
})

test("a member saves a brand with the heart, finds it on the 찜 tab and lets it go", async ({ page }) => {
  // A visitor's heart asks them to log in.
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
  // The detail page shows it saved, and lets it go.
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
  await expect(page.locator(".hero-eyebrow")).toContainText("반가워요")
  await expect(page.locator(".demo-chip")).toHaveCount(0)
})

test("the login popup logs into a demo account with one press, with nothing to type", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "로그인", exact: true }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: /오후의 커피/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator(".hero-eyebrow")).toContainText("반가워요, 오후의 커피")
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

test("a proposal sent waits under 검토 중 beside those received, and is taken back there", async ({ page, request }) => {
  const group = await signUpMember(request, "학생단체", "e2e-sender@syu.ac.kr", "보내는 동아리")
  const brand = await signUpMember(request, "브랜드", "e2e-receiver@receiver-cafe.kr", "받는 카페")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "보내는 공연", date: today, people: "80명", types: ["현금"] }, headers: group.headers })
  await request.post("/api/proposals", { data: { matchId: brand.listingId }, headers: group.headers })

  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto("/offers")
  const sentPart = page.locator(".inbox-part", { has: page.getByRole("heading", { name: /보낸 제안/ }) })
  const card = sentPart.locator(".request-card", { hasText: "받는 카페" })
  await expect(card).toContainText("보내는 공연")
  // Asked once more, then gone.
  await card.getByRole("button", { name: "제안 취소" }).click()
  await card.getByRole("button", { name: "제안 취소" }).click()
  await expect(sentPart.locator(".request-card")).toHaveCount(0)
  await expect(page.getByText("받는 카페에 보낸 제안을 취소했어요.")).toBeVisible()
  // The brand leaves, so later cases see no member brand from this one.
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
  // It began today, so its dates stay as they are.
  await expect(page.getByText("이미 시작한 행사라 일정은 바꿀 수 없어요.")).toBeVisible()
  await expect(page.getByLabel("행사명")).toHaveValue("고칠 공연")
  await page.getByLabel("행사명").fill("고친 공연")
  await page.getByRole("button", { name: "저장하기" }).click()
  await expect(page.getByText("행사 정보를 고쳤어요.")).toBeVisible()
  await expect(page.locator(".day-event-card", { hasText: "고친 공연" })).toBeVisible()
  // The group leaves, so later cases see no member group from this one.
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
  const panel = page.getByRole("region", { name: "협찬 물품 배송" })
  await panel.getByLabel("택배사").selectOption("우체국택배")
  await panel.getByLabel("운송장 번호").fill("6070 1234 5678")
  await panel.getByLabel("메모 (선택)").fill("음료 2박스")
  await panel.getByRole("button", { name: "배송 남기기" }).click()
  await expect(page.getByText("배송을 남겼어요. 상대에게 알렸어요.")).toBeVisible()
  await expect(panel.locator(".shipment-list")).toContainText("우체국택배 · 607012345678")
  await expect(panel.getByRole("link", { name: "배송 조회" })).toHaveAttribute("href", /search\.naver\.com.*607012345678/)

  // The group sees it, without a way to take the brand's parcel off.
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
  // Agreeing asks once more, as it can't be undone.
  await panel.getByRole("button", { name: "취소에 동의" }).click()
  await panel.getByRole("button", { name: "취소에 동의" }).click()
  await expect(page.getByRole("status").getByText("협찬을 취소했어요.", { exact: true })).toBeVisible()
  await expect(page.locator(".agreement-state.canceled")).toHaveText("취소된 협찬")
  await expect(page.getByRole("button", { name: "이 내용으로 확인하기" })).toHaveCount(0)
  // Both leave, so later cases see no member from this one.
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
  // The blocked brand is gone from the catalog.
  await page.goto("/matches")
  await page.waitForLoadState("networkidle")
  await expect(page.locator(".work-card", { hasText: "신고된 카페" })).toHaveCount(0)

  await page.goto("/me")
  await page.locator(".blocked-list li", { hasText: "신고된 카페" }).getByRole("button", { name: "차단 풀기" }).click()
  await expect(page.getByText("신고된 카페의 차단을 풀었어요.")).toBeVisible()
  // Both leave, so later cases see no member from this one.
  for (const member of [group, brand]) {
    const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })
    expect(left.status()).toBe(204)
  }
})

test("a brand's 내 정보 offers the business check once the server has its key", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-business@business-cafe.kr", "확인할 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/me")
  // The test server has no NTS_SERVICE_KEY, so it isn't offered yet.
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
  // The dashboard's hero says so, and brings it back with one press.
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
  await expect(checklist.getByRole("listitem")).toHaveCount(6)
  await checklist.getByRole("button", { name: "소개 쓰기" }).click()
  await expect(page).toHaveURL(/\/me\/edit$/)
  // A registered event checks its step.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  await request.post("/api/events", { data: { name: "첫 공연", date: today, types: ["현금"] }, headers: group.headers })
  await page.goto("/dashboard")
  await expect(progress).toHaveAttribute("aria-valuenow", "1")
  // 나중에 folds it to one line, kept after a reload.
  await checklist.getByRole("button", { name: "나중에" }).click()
  const folded = page.getByRole("region", { name: "소개 완성 체크리스트" })
  await expect(folded).toContainText("1/6 완료")
  await page.reload()
  await folded.getByRole("button", { name: "펼치기" }).click()
  await expect(checklist).toBeVisible()
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
})

test("the report and the analytics download as CSV files that Excel opens", async ({ page }) => {
  // A visitor sees the demo group's report and the demo brand's analytics.
  for (const [path, name, first] of [
    ["/reports", /^uniconnect-report-\d{4}-\d{2}-\d{2}\.csv$/, "행사,"],
    ["/analytics", /^uniconnect-analytics-\d{4}-\d{2}-\d{2}\.csv$/, "단체,행사,날짜,"],
  ] as const) {
    await page.goto(path)
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "CSV로 내보내기" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(name)
    const text = await readFile(await file.path(), "utf8")
    // A byte order mark first, so Excel reads it as UTF-8.
    expect(text.startsWith(`\uFEFF${first}`)).toBe(true)
    expect(text).toContain("\r\n")
  }
})

test("the report page keeps the sponsorship record, handed over as a CSV file", async ({ page }) => {
  await page.goto("/reports")
  const record = page.getByRole("table", { name: "협찬 기록" })
  // The header row folds away on a phone; each event's row opens its report.
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
  await expect(table.getByRole("rowheader", { name: "일치율" })).toBeVisible()
  await expect(table.getByRole("columnheader")).toHaveCount(2)
  await table.getByRole("button", { name: "상세 보기" }).first().click()
  await expect(page).toHaveURL(/\/matches\/[^/]+$/)
})

test("a group opens other groups' events from its calendar, and one event's page from there", async ({ page }) => {
  await page.goto("/events")
  // The summary over the calendar leads with the next event.
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
  const why = page.getByRole("region", { name: "연결에서 끝나지 않고, 협찬을 끝까지 함께해요" })
  await expect(why.getByRole("heading", { name: "이렇게 바뀌어요" })).toBeVisible()
  await expect(why.locator(".why-pillars li")).toHaveCount(4)
  // Too few members yet to show the counts.
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
  // A calendar app reads it without logging in.
  const feed = await request.get(url)
  expect(feed.status()).toBe(200)
  expect(await feed.text()).toContain("SUMMARY:구독 공연")
  await expect(sheet.getByRole("link", { name: "Apple · Outlook에서 구독" })).toHaveAttribute("href", url.replace(/^https?:/, "webcal:"))
  // A new link, asked for twice, stops the old one.
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
  await expect(card).toContainText("가입 0곳 · 첫 협찬 성사 0곳")
  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(new URL(link).pathname + new URL(link).search)
  expect(await visitor.evaluate(() => sessionStorage.getItem("uniconnect-ref"))).toBe(new URL(link).searchParams.get("ref"))
  const left = await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: group.headers })
  expect(left.status()).toBe(204)
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
  // Its page shows to brands once the group has a listing.
  await request.put("/api/profile", { data: { intro: "캠퍼스 공연 동아리예요.", offer: "관객 100명" }, headers: group.headers })
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + 14 * 86_400_000))
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/new?date=${day}`)
  await page.getByLabel("행사명").fill("페이지 공연")
  await page.locator("label.check-row", { hasText: "행사 운영비 지원" }).click()
  await page.getByLabel("행사 유형").selectOption("공연")
  await page.getByLabel("시작 시각").fill("18:00")
  await page.getByLabel("끝나는 시각").fill("21:30")
  await page.getByLabel("여성 비율").fill("60")
  await page.locator("label.check-row", { hasText: "1학년" }).click()
  await page.getByLabel("주요 전공").fill("실용음악")
  await page.getByLabel("장소", { exact: true }).fill("삼육대학교 대강당")
  await page.getByLabel(/행사 소개/).fill("밴드 다섯 팀의 종강 공연이에요.")
  await page.getByRole("button", { name: "묶음 추가" }).click()
  await page.getByLabel("묶음 이름", { exact: true }).fill("메인 스폰서")
  await page.getByLabel("브랜드가 받는 것", { exact: true }).fill("무대 현수막 로고")
  await page.getByLabel("원하는 협찬", { exact: true }).fill("현금 30만원")
  // A promotion plan needs the group's agreement before it registers.
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
  await expect(page.locator(".event-makeup")).toContainText("여성 60% · 남성 40%")
  await expect(page.locator(".event-makeup")).toContainText("1학년")
  await expect(page.locator(".event-promo")).toContainText("현수막")
  await expect(page.locator(".event-promo")).toContainText("협찬 게시물 1회")
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  await page.locator(".event-photo-add input").setInputFiles({ name: "stage.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") })
  await expect(page.getByRole("img", { name: "페이지 공연 사진" })).toBeVisible()
  // The plan PDF goes on the page for brands to download.
  await page
    .locator("label", { hasText: "기획안 올리기" })
    .locator("input")
    .setInputFiles({ name: "종강공연 기획안.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nplan\n%%EOF") })
  await expect(page.getByText("기획안을 올렸어요.")).toBeVisible()
  // The group makes a proposal PDF from the page.
  const proposal = page.waitForEvent("download")
  await page.getByRole("button", { name: "제안서 PDF" }).click()
  expect((await proposal).suggestedFilename()).toBe(`uniconnect-proposal-${day}.pdf`)
  await expect(page.getByText("제안서를 PDF로 저장했어요.")).toBeVisible()
  // 복제 opens the form with everything but the dates filled in.
  await page.getByRole("button", { name: "복제해서 새로 등록" }).click()
  await expect(page).toHaveURL(/\/new\?date=[\d-]+&from=/)
  await expect(page.getByLabel("행사명")).toHaveValue("페이지 공연")
  await expect(page.getByLabel("장소", { exact: true })).toHaveValue("삼육대학교 대강당")
  await expect(page.getByLabel("브랜드가 받는 것", { exact: true })).toHaveValue("무대 현수막 로고")
  await page.goBack()
  await expect(page).toHaveURL(/\/event\/[^/]+$/)

  // A brand member reads the same page, and goes on to the group's profile.
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

  // The council sees the club and its coming event, nothing private.
  await page.reload()
  const card = page.locator(".council-club")
  await expect(card).toContainText("소속 밴드")
  await expect(card.locator(".council-events")).toContainText("소속 밴드 공연")

  // Unlinked, it is gone.
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
  // The provider's answer comes back as ?social=, said once and taken from the address.
  // A Kakao account no member linked logs no one in: the login opens again.
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

  // The invited person joins from the login popup in another browser.
  const vice = await (await browser.newContext()).newPage()
  await vice.goto("/")
  await vice.getByRole("button", { name: "로그인", exact: true }).first().click()
  await vice.getByRole("dialog").getByRole("button", { name: "초대받았나요?" }).click()
  const join = vice.getByRole("dialog", { name: "초대받아 함께 관리하기" })
  await join.getByLabel("초대받은 이메일").fill("e2e-vice@syu.ac.kr")
  await join.getByLabel("초대 코드").fill(code)
  await join.getByLabel("새 비밀번호", { exact: true }).fill("vice-pass-123")
  await join.getByLabel("새 비밀번호 확인").fill("vice-pass-123")
  await join.getByRole("button", { name: "함께 관리 시작하기" }).click()
  await expect(join).toBeHidden()
  await expect(vice.getByText("함께 동아리 계정을 함께 관리하기 시작했어요.")).toBeVisible()

  // In 내 정보 the owner's part is gone for the co-admin.
  await vice.goto("/me")
  await expect(vice.locator(".profile-member-note")).toContainText("부회장님은 공동 관리자로 로그인했어요")
  await expect(vice.getByRole("button", { name: "회원 탈퇴" })).toHaveCount(0)
  await expect(vice.getByRole("button", { name: "로그인 이메일 바꾸기" })).toHaveCount(0)
  await expect(vice.getByRole("button", { name: /2단계 인증/ })).toHaveCount(0)

  // The owner sees the co-admin joined, and takes it off, which logs it out.
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
  // A dot opens its brand's card beside the map.
  await map.getByRole("button", { name: /^오후의 커피, / }).click()
  await expect(map.locator(".nearby-map-card h3")).toHaveText("오후의 커피")
  // Brands without a store are named under it, and open the same way.
  const unplaced = map.locator(".catalog-map-unplaced button")
  await expect(unplaced.first()).toBeVisible()
  const name = await unplaced.first().innerText()
  await unplaced.first().click()
  await expect(map.locator(".nearby-map-card h3")).toHaveText(name)
  // Search narrows the dots too.
  await page.getByRole("searchbox", { name: "브랜드 검색" }).fill("오후의 커피")
  await expect(dots).toHaveCount(1)

  // Brands see the groups around their store the same way.
  await page.goto("/groups?role=브랜드")
  await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "지도" }).click()
  await expect(page.getByRole("group", { name: "내 매장 기준 지도" })).toBeVisible()
  await expect(page.locator(".catalog-map .place-dot").first()).toBeVisible()
})

test("a member turns on two-step login, logs in with the app's code, and sees its devices", async ({ page, request, browser }) => {
  const member = await signUpMember(request, "학생단체", "e2e-2fa@syu.ac.kr", "보안 동아리")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), member.token)
  await page.goto("/me")

  // On with the password, the app's key and its first code; the recovery codes show once.
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

  // Logging in on another browser asks for the code after the password.
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
  // The next step's code, as the first was used to turn it on.
  await login.getByLabel("인증 코드").fill(codeAt(secret, stepAt(Date.now()) + 1))
  await login.getByRole("button", { name: "확인하고 로그인" }).click()
  await expect(login).toBeHidden()

  // Its device list shows it and the first browser, which it can log out.
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

  // The group's message reaches the brand's open page within moments, and
  // the group sees it read as the brand's page shows it.
  await page.getByLabel("보낼 메시지").fill("협찬 이야기 나눠요!")
  await page.keyboard.press("Enter")
  await expect(brandPage.getByText("협찬 이야기 나눠요!")).toBeVisible({ timeout: 2500 })
  await expect(page.locator(".chat-read")).toHaveText("읽음", { timeout: 2500 })

  // And the brand's reply comes back the same way.
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

  // The group sends a photo from the clip beside the box, then a PDF.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/messages/${conversation.id}`)
  const clip = page.getByLabel("사진이나 PDF 보내기")
  await clip.setInputFiles({ name: "poster.jpg", mimeType: "image/jpeg", buffer: await readFile("frontend/src/assets/examples/groups.jpg") })
  await expect(page.getByRole("img", { name: "보낸 사진" })).toBeVisible()
  await clip.setInputFiles({ name: "제안서.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") })
  await expect(page.getByRole("button", { name: /제안서\.pdf/ })).toBeVisible()

  // The brand sees both, its list says a PDF came last, and it saves the PDF by its name.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto("/messages")
  await expect(brandPage.locator(".chat-row-preview")).toHaveText("PDF 파일")
  await brandPage.locator(".chat-row").click()
  await expect(brandPage.getByRole("img", { name: "받은 사진" })).toBeVisible()
  const download = brandPage.waitForEvent("download")
  await brandPage.getByRole("button", { name: /제안서\.pdf/ }).click()
  expect((await download).suggestedFilename()).toBe("제안서.pdf")

  // A file is deleted, not edited.
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

  // The group writes its post from the board.
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

  // A brand member finds it on the board and applies with its campaign.
  const brandPage = await (await browser.newContext()).newPage()
  await brandPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await brandPage.goto("/board")
  await brandPage.locator(".post-card", { hasText: "종강 공연 협찬사를 찾아요" }).locator("h3 button").click()
  await brandPage.getByRole("button", { name: "지원하기" }).click()
  const apply = brandPage.getByRole("dialog")
  await expect(apply.getByLabel("제안할 캠페인")).toContainText("모집 시음회")
  // The message is saved as a template, kept on the account for next time.
  await apply.getByLabel("전할 메시지").fill("시음 부스로 함께하고 싶어요.")
  await apply.getByRole("button", { name: "지금 문구 저장" }).click()
  await apply.getByLabel("문구 이름").fill("첫 지원")
  await apply.getByRole("button", { name: "저장", exact: true }).click()
  await expect(brandPage.getByText("제안 문구를 저장했어요.")).toBeVisible()
  await expect(apply.getByLabel("저장한 문구")).toContainText("첫 지원")
  await apply.getByRole("button", { name: "제안 보내기" }).click()
  await expect(brandPage.getByText("지원했어요 · 검토 중")).toBeVisible()

  // The group sees the application on its post, to answer in its inbox.
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

test("a student group proposes and the brand accepts", async ({ browser }) => {
  const student = await (await browser.newContext()).newPage()
  await student.goto("/")
  await logIn(student, "학생단체", "muse@syu.ac.kr")
  // Logging in opens the dashboard; the brand's page is one step away.
  await student.goto("/matches/afternoon-coffee")
  await student.locator(".profile-actions").getByRole("button", { name: /협찬 제안 보내기/ }).click()
  // The form picks the event (the nearest at first) and takes a note.
  const form = student.getByRole("dialog")
  await expect(form.getByLabel("제안할 행사")).toBeVisible()
  await form.getByLabel("전할 메시지").fill("현장 부스와 SNS로 브랜드를 알릴게요.")
  await form.getByRole("button", { name: "제안 보내기" }).click()
  await expect(form).toBeHidden()
  await expect(student.locator(".profile-actions").getByText("제안 완료")).toBeVisible()

  const brand = await (await browser.newContext()).newPage()
  await brand.goto("/")
  await logIn(brand, "브랜드", "hello@afternoon-coffee.kr")
  await brand.goto("/inbox")
  const card = brand.locator(".request-card", { hasText: "삼육대 뮤즈" }).first()
  await expect(card).toContainText("현장 부스와 SNS로 브랜드를 알릴게요.")
  await card.getByRole("button", { name: /수락하기/ }).click()
  await expect(brand.locator(".request-card", { hasText: "삼육대 뮤즈" }).first()).toBeHidden()
  await brand.getByRole("tab", { name: /수락함/ }).click()
  // Accepted: the result and the progress steps show on the card.
  const accepted = brand.locator(".request-card", { hasText: "삼육대 뮤즈" })
  await expect(accepted.locator(".request-result.confirmed")).toBeVisible()
  await expect(accepted.getByRole("list", { name: "협찬 진행 상황" })).toBeVisible()
})

test("the e-contract sets how the sponsorship is confirmed, and once both sides confirm, each side records its own methods at the venue", async ({ browser }) => {
  // The concert the group proposed above, which the brand accepted.
  const student = await (await browser.newContext()).newPage()
  await student.goto("/")
  await logIn(student, "학생단체", "muse@syu.ac.kr")
  await student.goto("/agreements")
  await student.locator(".agreement-row", { hasText: "2026 뮤즈 종강 공연" }).click()
  await expect(student.getByRole("heading", { name: "2026 뮤즈 종강 공연 임시 전자 계약서" })).toBeVisible()
  const methods = student.locator(".methods-panel")
  const status = methods.getByRole("heading", { name: /협찬 확인 방식/ })
  // At first the QR, its coupon and the store's visits, not yet settled.
  await expect(methods.locator(".method-list li")).toHaveCount(3)
  await expect(methods.locator(".method-list")).toContainText("QR 체크인")
  await expect(methods.locator(".method-list")).toContainText("매장 방문")
  await expect(status).toContainText("두 쪽이 계약서를 모두 확인하면 성과에 반영돼요")
  await expect(methods.locator(".venue-access")).toHaveCount(0)

  // The group adds booth stamps for itself and sampling for the brand.
  await methods.getByRole("button", { name: "협찬 확인 방식 고르기" }).click()
  await methods.getByRole("checkbox", { name: /부스 방문 · 스탬프/ }).check()
  await methods.getByRole("checkbox", { name: /샘플링 · 시음/ }).check()
  await expect(methods.getByRole("group", { name: "샘플링 · 시음 확인하는 쪽" }).getByRole("radio", { name: "오후의 커피" })).toBeChecked()
  await expect(methods.getByRole("group", { name: "매장 방문 확인하는 쪽" }).getByRole("radio", { name: "삼육대 뮤즈" })).toBeDisabled()
  await methods.getByRole("button", { name: "저장" }).click()
  await expect(methods.locator(".method-list li")).toHaveCount(5)
  await expect(methods.locator(".method-list")).toContainText("삼육대 뮤즈에서 현장 확인")
  // They count once both sides confirm the e-contract.
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

  // The group's own venue page opens with its PIN, which only it sees, and takes the stamps.
  await student.reload()
  await expect(status).toContainText("확정됐어요")
  const link = await methods.locator(".venue-access a").getAttribute("href")
  const pin = (await methods.locator(".venue-access span strong").textContent())!
  expect(link).toMatch(/\/check-in\/[\w-]+\/group$/)
  const venue = await (await browser.newContext()).newPage()
  await venue.goto(link!)
  // The event shows before the PIN, so the staff know it is the right page.
  await expect(venue.getByRole("heading", { level: 1 })).toHaveText("2026 뮤즈 종강 공연")
  await expect(venue.getByText(/삼육대 뮤즈 · /)).toBeVisible()
  await venue.getByLabel("단체 확인 PIN").fill(pin === "0000" ? "0001" : "0000")
  await expect(venue.getByText(/단체 확인 PIN이 맞지 않아요/)).toBeVisible()
  await venue.getByLabel("단체 확인 PIN").fill(pin)
  const stamp = venue.getByRole("button", { name: "부스 방문 · 스탬프 한 명 확인" })
  await expect(stamp).toBeVisible()
  await expect(venue.getByRole("button", { name: /샘플링/ })).toHaveCount(0)
  await stamp.click()
  await stamp.click()
  await venue.getByRole("button", { name: "부스 방문 · 스탬프 하나 되돌리기" }).click()
  await expect(venue.locator(".venue-counter-head strong")).toHaveText("1")

  // The brand's store staff count the samples on the staff page with the brand's PIN.
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
  // An event that has ended says so.
  await student.getByLabel("행사 고르기").selectOption("event-busking-day")
  await expect(student.locator(".measure-bar .measure-state")).toHaveText("진행 완료")
  await expect(student.locator(".live-panel .eyebrow")).toHaveText("Event Ended")
})

test("a participant takes the coupon and the store's staff confirm the visit on their own page", async ({ browser }) => {
  const participant = await (await browser.newContext()).newPage()
  await participant.goto("/check-in/20261012")
  await expect(participant.getByRole("heading", { name: "가을 버스킹 데이" })).toBeVisible()
  await participant.getByRole("button", { name: "쿠폰 받기" }).click()
  const number = (await participant.locator(".coupon-code strong").textContent()) ?? ""
  expect(number).toMatch(/^UC-[A-Z2-9]{6}$/)
  // Nothing on the participant's phone asks for the staff PIN.
  await expect(participant.getByLabel("직원 PIN")).toHaveCount(0)

  const staff = await (await browser.newContext()).newPage()
  await staff.goto("/check-in/20261012/staff")
  await staff.getByLabel("직원 PIN").fill("0000")
  await staff.getByLabel("쿠폰 번호").fill(number)
  await staff.getByRole("button", { name: "방문 확인" }).click()
  await expect(staff.getByText(/직원 PIN이 맞지 않아요/)).toBeVisible()
  await staff.getByLabel("직원 PIN").fill("1012")
  await staff.getByRole("button", { name: "방문 확인" }).click()
  await expect(staff.getByRole("status").getByText(`${number}`, { exact: false })).toBeVisible()

  // The participant's page shows the confirmation on its next check.
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
  // The agreement's words hold links to the documents, so tick the boxes.
  await dialog.getByRole("checkbox").nth(0).check()
  await dialog.getByRole("checkbox").nth(1).check()
  // The page loaded the examples for the visitor; none may flash on the
  // new member's dashboard while its own data loads.
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

  // Members see only members: with no brand signed up yet, the dashboard
  // and 추천 매칭 say so, and point to inviting nearby shops, instead of
  // showing the example brands.
  await expect(page.locator(".insight-title")).toHaveText("아직 가입한 브랜드가 없어요.")
  await expect(page.locator(".catalog-empty")).toContainText("아직 추천할 브랜드가 없어요")
  await expect(page.getByText("오후의 커피")).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { exampleShown: boolean }).exampleShown)).toBe(false)
  await page.goto("/matches")
  const empty = page.locator(".catalog-empty")
  await expect(empty).toContainText("아직 가입한 브랜드가 없어요")
  await empty.getByRole("button", { name: "가까운 가게 보기" }).click()
  await expect(page.getByRole("tab", { name: "가까운 순" })).toHaveAttribute("aria-selected", "true")
})

test("brands show how far their store is from the school, and a brand keeps its store address", async ({ browser }) => {
  // Visitors see the demo group's campus and the demo stores.
  const student = await (await browser.newContext()).newPage()
  await student.goto("/matches")
  await student.getByRole("tab", { name: "전체" }).click()
  await expect(student.locator(".work-card", { hasText: "그린데이 샐러드" }).locator(".tag-distance")).toHaveText(/3\.3km/)
  // Online brands have no store, so no distance.
  await expect(student.locator(".work-card", { hasText: "프레시온" }).locator(".tag-distance")).toHaveCount(0)

  const brand = await (await browser.newContext()).newPage()
  await brand.goto("/")
  await logIn(brand, "브랜드", "hello@afternoon-coffee.kr")
  await brand.goto("/me/edit")
  await expect(brand.getByLabel("매장 주소")).toHaveValue("서울 노원구 공릉역 2번 출구 앞")
  await brand.getByLabel("매장 주소").fill("서울 노원구 화랑로 815")
  await brand.getByRole("button", { name: "저장하기" }).click()
  await expect(brand.getByText(/소개를 저장했어요/)).toBeVisible()
  // The server has no map key here, so the new address has no place yet
  // and the groups show no distance.
  await brand.goto("/groups")
  await brand.getByRole("tab", { name: "가까운 순" }).click()
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
  // In English the row is Language, and Korean brings the app back.
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "한국어" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "ko")
})

test("가까운 순 looks around the group's school for real shops, and says so while the map isn't connected", async ({ page }) => {
  // A member's own campus; visitors see this tab blurred, as an example.
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await page.goto("/matches")
  await page.getByRole("tab", { name: "가까운 순" }).click()
  // Every kind at first.
  await expect(page.getByRole("button", { name: "전체", exact: true })).toHaveAttribute("aria-pressed", "true")
  // The test server has no map key.
  await expect(page.getByText("지도 서비스가 연결되면 학교 근처 가게를 보여 드려요.")).toBeVisible()
  await page.getByRole("button", { name: "학원", exact: true }).click()
  await expect(page.getByRole("button", { name: "학원", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("지도 서비스가 연결되면 학교 근처 가게를 보여 드려요.")).toBeVisible()
})

test("brands and student groups can be searched and filtered", async ({ page }) => {
  await page.goto("/matches")
  await page.getByRole("tab", { name: "전체" }).click()
  const brandSearch = page.getByRole("searchbox", { name: "브랜드 검색" })
  await brandSearch.fill("커피")
  await expect(page.locator(".work-card", { hasText: "오후의 커피" })).toBeVisible()
  await expect(page.locator(".work-card", { hasText: "그린데이 샐러드" })).toHaveCount(0)
  await brandSearch.fill("없는낱말")
  await expect(page.getByText("찾는 브랜드가 없어요.", { exact: false })).toBeVisible()

  await page.goto("/groups")
  await page.getByRole("tab", { name: "전체" }).click()
  await page.getByLabel("학교", { exact: true }).selectOption("광운대학교")
  await expect(page.locator(".work-card")).toHaveCount(2)
  await page.getByRole("button", { name: "조건 지우기" }).click()
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
  // The test server shows codes on screen, as in development.
  await change.getByLabel("인증번호").fill((await change.locator(".field-hint strong").textContent()) ?? "")
  await change.getByRole("button", { name: "이메일 바꾸기" }).click()
  await expect(change).toBeHidden()
  await expect(page.getByText("e2e-next-officer@syu.ac.kr", { exact: true })).toBeVisible()

  // The new officer puts in their own name, position and number.
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
  // Kakao isn't connected here, so a group that signed up invites a shop by
  // its place ID through the API (the demo group can't invite real shops).
  const group = await signUpMember(request, "학생단체", "e2e-inviter@syu.ac.kr", "초대 동아리")
  const made = await request.post("/api/invites", { data: { placeId: "12345678" }, headers: group.headers })
  const { invite } = (await made.json()) as { invite: { code: string } }

  // The owner opens the link, reads who invited, and signs up as a brand.
  await page.goto(`/invite/${invite.code}`)
  await expect(page.getByRole("heading", { name: "초대 동아리에서 초대했어요" })).toBeVisible()
  await page.getByRole("button", { name: "가게로 가입하기" }).click()
  const signup = page.getByRole("dialog")
  await signup.getByLabel("브랜드명").fill("골목 카페")
  await signup.getByLabel("담당자 이름").fill("테스트 담당자")
  await signup.getByLabel("직책").selectOption("대표")
  await signup.getByLabel("휴대폰 번호").fill("010-1234-5678")
  await signup.getByLabel("회사 이메일").fill("owner@golmok-cafe.kr")
  await signup.getByRole("button", { name: "인증번호 받기" }).click()
  await signup.getByLabel("인증번호").fill((await signup.locator(".field-hint strong").textContent()) ?? "")
  await signup.getByRole("button", { name: "확인" }).click()
  await signup.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-123")
  await signup.getByLabel("비밀번호 확인").fill("e2e-pass-123")
  await signup.getByRole("checkbox").nth(0).check()
  await signup.getByRole("checkbox").nth(1).check()
  await signup.getByRole("button", { name: "가입하고 시작하기" }).click()
  await expect(signup).toBeHidden()

  // Back on the invitation, one press links the shop, and the brand is listed for groups to find.
  await page.getByRole("button", { name: "우리 가게로 연결하기" }).click()
  await expect(page.getByText("연결됐어요. 이제 초대 동아리의 협찬 제안을 받을 수 있어요.")).toBeVisible()
  const listed = async (headers?: Record<string, string>) =>
    ((await (await request.get("/api/brands", { headers })).json()) as { brands: { name: string; kakaoPlaceId?: string }[] }).brands
  expect((await listed(group.headers)).some((brand) => brand.name === "골목 카페" && brand.kakaoPlaceId === "12345678")).toBe(true)
  // Visitors' examples don't list it.
  expect((await listed()).some((brand) => brand.name === "골목 카페")).toBe(false)
})

test("a brand opens an accepted proposal's agreement, confirms it and proves what it did", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "브랜드", "hello@afternoon-coffee.kr")
  await page.goto("/inbox")
  await page.getByRole("tab", { name: /수락함/ }).click()
  await page.locator(".request-card", { hasText: "서울여대 러너스" }).getByRole("button", { name: "계약서" }).click()
  await expect(page.getByRole("heading", { name: "가을 캠퍼스 런 5K 임시 전자 계약서" })).toBeVisible()
  await expect(page.getByText("아직 uniconnect 계정이 없어요")).toBeVisible()
  // Its own side shows the person running it, with a number to call.
  await expect(page.locator(".agreement-contact")).toContainText("이오후 · 점장")
  await expect(page.locator(".agreement-contact a")).toHaveAttribute("href", "tel:01000000001")

  await page.getByRole("button", { name: "이 내용으로 확인하기" }).click()
  await expect(page.locator(".agreement-confirm .agreement-state")).toHaveText("상대 확인 기다리는 중")

  // The brand ticks its first item and proves it with a link and a photo.
  const item = page.locator(".agreement-item").first()
  await item.getByRole("checkbox").check()
  await expect(item.getByRole("checkbox")).toBeChecked()
  await item.getByRole("textbox").fill("https://instagram.com/p/e2e-proof")
  await item.getByRole("button", { name: "링크 추가" }).click()
  await expect(item.getByRole("link", { name: /instagram\.com\/p\/e2e-proof/ })).toBeVisible()
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")
  await item.getByLabel("사진 추가").setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png })
  await expect(item.getByRole("img", { name: "증빙 사진" })).toBeVisible()

  // The list shows how far it is.
  await page.goto("/agreements")
  await expect(page.locator(".agreement-row", { hasText: "서울여대 러너스" })).toContainText("증빙 2개")
})

test("visitors see a partner's reviews, a group reviews the brand after its event, and the brand answers", async ({
  page,
  request,
  browser,
}) => {
  // The seeded reviews, on the card and the detail page.
  await page.goto("/matches")
  await expect(page.locator(".work-card", { hasText: "오후의 커피" }).first().locator(".tag-rating")).toContainText("후기 2")
  await page.goto("/matches/afternoon-coffee")
  await page.getByRole("tab", { name: /파트너 후기/ }).click()
  const reviews = page.locator(".profile-panel")
  await expect(reviews.locator(".profile-figures strong").first()).toHaveText("4.5")
  await expect(reviews.getByRole("heading", { name: "최근 후기" })).toBeVisible()
  await reviews.getByRole("button", { name: "후기 모두 보기 (2)" }).click()
  await expect(reviews.locator(".profile-review, .review-card")).toHaveCount(2)

  // Two members: a group's event today, proposed to a brand and accepted (through the API).
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

  // On the agreement, the group leaves its review.
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await page.goto(`/agreements/${proposal.id}`)
  const panel = page.locator(".review-panel")
  await panel.getByRole("radio", { name: "5점" }).check()
  await panel.getByRole("checkbox", { name: "약속을 잘 지켜요" }).check()
  await panel.getByLabel("한 줄 후기").fill("커피가 공연 전에 딱 맞춰 왔어요.")
  await panel.getByRole("button", { name: "후기 남기기" }).click()
  await expect(panel.getByText("내가 남긴 후기")).toBeVisible()

  // It shows on the brand's page, which the group (a member) sees.
  await page.goto(`/matches/${brand.listingId}`)
  await page.getByRole("tab", { name: /파트너 후기/ }).click()
  await expect(page.locator(".profile-review")).toContainText("커피가 공연 전에 딱 맞춰 왔어요.")

  // The brand answers it on the agreement, and the answer shows under the review.
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
  // The manifest, its icons and the service worker are served; links to the
  // site ask to open in the browser, not the installed app.
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
  // The built app registers the service worker.
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
  // Laid out like the phone's share sheet: the coming dates, all picked, then the calendar apps.
  const sheet = page.getByRole("dialog", { name: "캘린더에 추가" })
  await expect(sheet.getByText("일정 2개 선택됨")).toBeVisible()
  await expect(sheet.getByRole("button", { name: /겨울 정기 공연/ })).toHaveAttribute("aria-pressed", "true")
  // With several dates, Google Calendar opens each one's add page in turn.
  await sheet.getByRole("button", { name: "Google 캘린더" }).click()
  const google = sheet.getByRole("link", { name: "겨울 정기 공연 Google 캘린더에서 열기" })
  const added = new URL((await google.getAttribute("href")) ?? "")
  expect(added.origin + added.pathname).toBe("https://calendar.google.com/calendar/render")
  expect([added.searchParams.get("action"), added.searchParams.get("text")]).toEqual(["TEMPLATE", "겨울 정기 공연"])
  expect(added.searchParams.get("dates")).toMatch(new RegExp(`^${date.replace(/-/g, "")}/\\d{8}$`))
  await expect(google).toHaveAttribute("target", "_blank")
  await expect(sheet.getByRole("link", { name: "신년 버스킹 Google 캘린더에서 열기" })).toBeVisible()
  // With none picked no app opens; with one, its add page opens straight from the icon.
  await sheet.getByRole("button", { name: /겨울 정기 공연/ }).click()
  await sheet.getByRole("button", { name: /신년 버스킹/ }).click()
  await expect(sheet.getByRole("button", { name: "Apple 캘린더" })).toBeDisabled()
  await sheet.getByRole("button", { name: /겨울 정기 공연/ }).click()
  await expect(sheet.getByText("일정 1개 선택됨")).toBeVisible()
  await expect(sheet.getByRole("link", { name: "Outlook" })).toHaveAttribute("href", /^https:\/\/outlook\.live\.com\//)
  // Apple Calendar takes the calendar file with the picked date.
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
  // The bell closes it, as Escape does.
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
  // Out of the account, the introduction shows rather than the same screen.
  await expect(page).toHaveURL(/\/$/)
})

test("every sponsorship on 성과 분석 has its detailed report, and 요금제 보기 opens the plans in place", async ({ page, request }) => {
  await page.goto("/analytics?role=브랜드")
  const rows = page.locator(".analytics-table .analytics-row:not(.head)")
  const count = await rows.count()
  expect(count).toBeGreaterThan(1)
  await expect(page.locator(".analytics-table .report-button")).toHaveCount(count)
  // One without a measured event can be bought too, worked out from its record.
  await rows.last().locator(".report-button").click()
  await expect(page).toHaveURL(/\/insights\/[^/]+$/)
  await expect(page.getByText("화면에서 보는 숫자 너머의 리포트")).toBeVisible()
  await expect(page.getByRole("button", { name: "로그인하고 리포트 사기" })).toBeVisible()

  const brand = await signUpMember(request, "브랜드", "e2e-plan@plan-cafe.kr", "요금제 카페")
  await page.evaluate((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/analytics")
  await page.getByRole("button", { name: "요금제 보기" }).click()
  const plans = page.getByRole("dialog", { name: "요금제 고르기" })
  await expect(plans.getByRole("button", { name: "캠퍼스 파트너스 시작하기" })).toBeVisible()
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

test("추천 매칭 opens on 전체, its tabs in the order 전체 · 추천 · 인기 · 가까운 순 · 업종별 · 찜", async ({ page }) => {
  await page.goto("/matches")
  const tabs = page.getByRole("tablist", { name: "브랜드 보기" }).getByRole("tab")
  await expect(tabs).toHaveText(["전체", "추천", "인기", "가까운 순", "업종별", "찜"])
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

  // Without Toss keys, the transfer is the way to pay; the terms come first.
  await page.getByRole("button", { name: "수수료 50,000원 결제하고 확인하기" }).click()
  const pay = page.getByRole("dialog", { name: "플랫폼 수수료 결제" })
  await expect(pay).toContainText("카드 결제는 준비 중이에요")
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(pay.getByRole("alert")).toHaveText("결제 내용과 환불 규정에 동의해 주세요.")
  await pay.getByText("결제 내용을 확인했고,").click()
  await expect(pay.getByRole("checkbox")).toBeChecked()
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(page.getByText("계좌 입금을 요청했어요. 입금이 확인되면 계약서가 확인돼요.")).toBeVisible()
  await expect(pay).toBeHidden()

  await page.goto("/me")
  await page.getByRole("button", { name: "결제 내역" }).click()
  const history = page.getByRole("dialog", { name: "결제 내역" })
  await expect(history).toContainText("수수료 공연 협찬 수수료")
  await expect(history).toContainText("입금 확인 중")

  // The group sees it pays nothing.
  const groupPage = await (await browser.newContext()).newPage()
  await groupPage.addInitScript((value) => localStorage.setItem("uniconnect-token", value), group.token)
  await groupPage.goto(`/agreements/${id}`)
  await expect(groupPage.getByRole("region", { name: "협찬액과 수수료" })).toContainText("학생단체는 무료예요")
  for (const member of [group, brand]) {
    expect((await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: member.headers })).status()).toBe(204)
  }
})

test("the detailed report: the demo's open from 성과 분석, a member's locked behind its price", async ({ page, request, browser }) => {
  // Visitors read the demo brand's, from its analytics.
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
  // The demo only reads: no share link, no store counts to write.
  await expect(page.getByRole("button", { name: "공유 링크 만들기" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "효과 계산하기" })).toHaveCount(0)

  // A member's sponsorship of today's event: the preview with its price.
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
  await member.getByRole("button", { name: "리포트 사기" }).click()
  const pay = member.getByRole("dialog", { name: "상세 성과 리포트 결제" })
  await expect(pay).toContainText("연 뒤에는 환불되지 않아요")
  await pay.getByText("결제 내용을 확인했고,").click()
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(member.getByText("계좌 입금을 요청했어요. 입금이 확인되면 리포트가 열려요.")).toBeVisible()
  for (const account of [group, brand]) {
    expect((await request.delete("/api/auth/account", { data: { password: "e2e-pass-123" }, headers: account.headers })).status()).toBe(204)
  }
})

test("a brand sees its plan in 내 정보 and asks to start Campus Partners", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-plan@plan-cafe.kr", "요금제 카페")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/me")
  const card = page.getByRole("region", { name: "요금제" })
  await expect(card).toContainText("무료 요금제 · 이번 달 협찬 제안 0/5건")
  await expect(card).toContainText("상세 분석 리포트 모두 포함")
  await card.getByRole("button", { name: "캠퍼스 파트너스 시작하기" }).click()
  const pay = page.getByRole("dialog", { name: "캠퍼스 파트너스 결제" })
  await expect(pay).toContainText("300,000원")
  await pay.getByText("결제 내용을 확인했고,").click()
  await pay.getByRole("button", { name: "계좌 입금으로 요청하기" }).click()
  await expect(page.getByText("계좌 입금을 요청했어요. 입금이 확인되면 캠퍼스 파트너스가 시작돼요.")).toBeVisible()
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
  await expect(card.getByRole("button", { name: "캠퍼스 파트너스 시작하기" })).toBeDisabled()
  await expect(card).toContainText("데모 계정은 테스트 결제로만 시연할 수 있어요.")
  await page.getByRole("button", { name: "결제 내역" }).click()
  await expect(page.getByRole("dialog", { name: "결제 내역" })).toBeVisible()
})

test("the operators' console stands on its own: token, side menu, members and a member's record", async ({ page }) => {
  await page.goto("/admin")
  // No member header or footer around it.
  await expect(page.getByRole("button", { name: "전체 메뉴" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "운영자 콘솔" })).toBeVisible()
  await page.getByLabel("관리자 토큰").fill("wrong-token")
  await page.getByRole("button", { name: "들어가기" }).click()
  await expect(page.getByRole("alert")).toHaveText("관리자 토큰이 맞지 않아요.")
  await page.getByLabel("관리자 토큰").fill("e2e-admin-token")
  await page.getByRole("button", { name: "들어가기" }).click()
  await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  // On a phone the side menu is a drawer behind the menu button.
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
  // The demo accounts can't be stopped, so there is no button for it.
  await expect(detail.getByRole("button", { name: "계정 정지" })).toHaveCount(0)
  await openMenu()
  await menu.getByRole("button", { name: /제안 · 협찬/ }).click()
  await page.getByText("예시 데이터도 보기").click()
  await expect(page.locator(".console-table tbody tr").first()).toBeVisible()
  await expect(page).toHaveURL(/\/admin\?view=proposals$/)

  // Back and forward move through the console, the open member too.
  await page.goBack()
  await expect(page).toHaveURL(/view=members&member=/)
  await expect(page.getByRole("complementary", { name: "오후의 커피" })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole("complementary", { name: "오후의 커피" })).toHaveCount(0)
  await page.goForward()
  await expect(page.getByRole("complementary", { name: "오후의 커피" })).toBeVisible()
  // The logo leads to the console's first screen.
  await openMenu()
  await page.getByRole("button", { name: "운영자 콘솔 처음으로" }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()
  // The top bar's search opens the members found.
  await page.getByLabel("회원 찾기").fill("muse")
  await page.getByLabel("회원 찾기").press("Enter")
  await expect(page).toHaveURL(/view=members&q=muse/)
  await expect(page.getByRole("button", { name: "삼육대 뮤즈" })).toBeVisible()
  await expect(page.getByRole("button", { name: "오후의 커피" })).toHaveCount(0)

  // A notice posted here shows across the site until a visitor closes it,
  // and the log keeps that it went up.
  await openMenu()
  await menu.getByRole("button", { name: "공지" }).click()
  await page.getByLabel("내용").fill("오늘 밤 점검이 있어요")
  // The showing period opens the site's calendar in a popover; a picked day
  // shows on the field, and clearing it goes back to from now on.
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
  await page.getByLabel("관리자 토큰").fill("e2e-admin-token")
  await page.getByRole("button", { name: "들어가기" }).click()
  await expect(page.getByRole("heading", { level: 2, name: "지금 처리할 일" })).toBeVisible()

  await page.keyboard.press("Control+k")
  const palette = page.getByRole("dialog", { name: "명령 팔레트" })
  await palette.getByRole("combobox").fill("분석")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { level: 1, name: "분석" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2, name: "전환 퍼널" })).toBeVisible()

  // "?" shows the keyboard shortcuts, and Escape closes them.
  await page.keyboard.press("?")
  await expect(page.getByRole("dialog", { name: "키보드 단축키" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "키보드 단축키" })).toHaveCount(0)

  await page.getByRole("navigation", { name: "운영자 메뉴" }).getByRole("button", { name: "시스템" }).click()
  await page.getByLabel("점검 중: 회원 화면 대신 안내를 보여 주고 저장을 막아요").check()
  await page.getByLabel("안내 문구").fill("오늘 밤 점검이에요")
  await page.getByRole("button", { name: "저장" }).first().click()
  await expect(page.getByText("점검 모드를 켰어요.")).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByRole("alert").filter({ hasText: "잠시 점검하고 있어요" })).toContainText("오늘 밤 점검이에요")

  await page.goto("/admin?view=system")
  await page.getByLabel("점검 중: 회원 화면 대신 안내를 보여 주고 저장을 막아요").uncheck()
  await page.getByRole("button", { name: "저장" }).first().click()
  await expect(page.getByText("점검 설정을 저장했어요.")).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByText("잠시 점검하고 있어요")).toHaveCount(0)
})
