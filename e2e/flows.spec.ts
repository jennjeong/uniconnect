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

test("a visitor sees the nearby tabs as blurred examples", async ({ page }) => {
  // Nearby shops and groups depend on the account's campus or store.
  await page.goto("/matches")
  await page.getByRole("tab", { name: "가까운 순" }).click()
  await expect(page.getByText("학교마다 근처 가게가 달라요")).toBeVisible()
  await expect(page.locator(".demo-preview-content")).toHaveAttribute("inert", "")
  await page.goto("/groups")
  await page.getByRole("tab", { name: "가까운 순" }).click()
  await expect(page.getByText("매장마다 가까운 학생단체가 달라요")).toBeVisible()
  await page.locator(".demo-preview-note").getByRole("button", { name: "회원가입" }).click()
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

test("a member who opens the introduction goes on to the dashboard", async ({ page }) => {
  await page.goto("/")
  await logIn(page, "학생단체", "muse@syu.ac.kr")
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto("/")
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator(".hero-eyebrow")).toContainText("반가워요")
  await expect(page.locator(".demo-chip")).toHaveCount(0)
})

test("a student group proposes and the brand accepts", async ({ browser }) => {
  const student = await (await browser.newContext()).newPage()
  await student.goto("/")
  await logIn(student, "학생단체", "muse@syu.ac.kr")
  // Logging in opens the dashboard; the brand's page is one step away.
  await student.goto("/matches/afternoon-coffee")
  await student.locator(".profile-actions").getByRole("button", { name: /협찬 제안 보내기/ }).click()
  await expect(student.locator(".profile-actions").getByText("제안 완료")).toBeVisible()

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
  await page.locator(".request-card", { hasText: "서울여대 러너스" }).getByRole("button", { name: "약속서" }).click()
  await expect(page.getByRole("heading", { name: "가을 캠퍼스 런 5K 협찬 약속서" })).toBeVisible()
  await expect(page.getByText("아직 uniconnect 계정이 없어요")).toBeVisible()

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

test("visitors see a partner's reviews, and a group reviews the brand after its event", async ({ page, request }) => {
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
    },
  })
  const { token } = (await signup.json()) as { token: string }
  const month = new Date(Date.now() + 30 * 86_400_000)
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(month)
  await request.post("/api/events", {
    data: { name: "겨울 정기 공연", date, people: "200명", types: ["제품"] },
    headers: { Authorization: `Bearer ${token}` },
  })
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), token)
  await page.goto("/events")
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "캘린더에 추가" }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^uniconnect-\d{4}-\d{2}-\d{2}\.ics$/)
  const calendar = await readFile(await file.path(), "utf8")
  expect(calendar).toContain("BEGIN:VCALENDAR")
  expect(calendar).toContain("SUMMARY:겨울 정기 공연")
  expect(calendar).toContain(`DTSTART;VALUE=DATE:${date.replace(/-/g, "")}`)
})
