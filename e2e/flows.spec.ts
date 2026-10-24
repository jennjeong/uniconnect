import { expect, test, type Page } from "@playwright/test"

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
  await page.goto("/matches")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/terms")
  await expect(page.getByRole("heading", { name: "서비스 이용약관" })).toBeVisible()
  await page.goto("/faq")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/no-such-page")
  await expect(page.getByText("페이지를 찾을 수 없어요").first()).toBeVisible()
})

test("a student group proposes and the brand accepts", async ({ browser }) => {
  const student = await (await browser.newContext()).newPage()
  await student.goto("/")
  await logIn(student, "학생단체", "muse@syu.ac.kr")
  // Logging in opens the dashboard; the brand's page is one step away.
  await student.goto("/matches/afternoon-coffee")
  await student.locator(".banner-actions").getByRole("button", { name: /협찬 제안 보내기/ }).click()
  await expect(student.locator(".banner-actions").getByText("제안 완료")).toBeVisible()

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
  await dialog.getByRole("button", { name: "가입하고 시작하기" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/가입했어요/)).toBeVisible()
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

test("가까운 순 looks around the school for real shops, and says so while the map isn't connected", async ({ page }) => {
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
  // Kakao isn't connected here, so the group invites a shop by its place ID through the API.
  const login = await request.post("/api/auth/login", {
    data: { role: "학생단체", email: "muse@syu.ac.kr", password: demoPassword },
  })
  const { token } = (await login.json()) as { token: string }
  const made = await request.post("/api/invites", {
    data: { placeId: "12345678" },
    headers: { Authorization: `Bearer ${token}` },
  })
  const { invite } = (await made.json()) as { invite: { code: string } }

  // The owner opens the link, reads who invited, and signs up as a brand.
  await page.goto(`/invite/${invite.code}`)
  await expect(page.getByRole("heading", { name: "삼육대 뮤즈에서 초대했어요" })).toBeVisible()
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
  await expect(page.getByText("연결됐어요. 이제 삼육대 뮤즈의 협찬 제안을 받을 수 있어요.")).toBeVisible()
  const { brands } = (await (await request.get("/api/brands")).json()) as { brands: { name: string; kakaoPlaceId?: string }[] }
  expect(brands.some((brand) => brand.name === "골목 카페" && brand.kakaoPlaceId === "12345678")).toBe(true)
})
