import { readFile } from "node:fs/promises"

import { expect, test, type Page } from "@playwright/test"

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
  const row = page.locator(".service-row", { has: page.getByText("사업자 확인", { exact: true }) })
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
  await expect(page.getByText("e2e-next-officer@syu.ac.kr")).toBeVisible()

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
