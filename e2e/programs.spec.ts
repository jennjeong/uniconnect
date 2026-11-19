import { expect, test } from "@playwright/test"

import { signUpMember } from "./members"

// 캠퍼스 캠페인(#401): 방문자는 예시를 보고, 브랜드 회원은 요청서를 내고 견적을 받아 결제로 이어진다.
test("a visitor sees an example campus campaign with its quote", async ({ page }) => {
  await page.goto("/programs")
  await expect(page.getByText("예시 캠페인이에요")).toBeVisible()
  await expect(page.getByRole("button", { name: "캠페인 요청하기" })).toHaveCount(0)
  await page.getByRole("button", { name: /봄 학기 신제품 시음/ }).click()
  await expect(page).toHaveURL(/\/programs\/example$/)
  const quote = page.getByRole("region", { name: "견적" })
  await expect(quote).toContainText("1,650,000원")
  await expect(quote).toContainText("uniconnect는 받지 않아요")
  await expect(page.getByRole("button", { name: "운영비 결제하기" })).toHaveCount(0)
})

test("a member brand requests a campus campaign, gets a quote and can withdraw before paying", async ({ page, request }) => {
  const brand = await signUpMember(request, "브랜드", "e2e-program@program-soda.kr", "캠페인 탄산수")
  await page.addInitScript((value) => localStorage.setItem("uniconnect-token", value), brand.token)
  await page.goto("/programs")
  await expect(page.getByText("아직 요청한 캠페인이 없어요.")).toBeVisible()

  await page.getByRole("button", { name: "캠페인 요청하기" }).click()
  const form = page.getByRole("form", { name: "캠페인 요청서" })
  await form.getByLabel("캠페인 이름").fill("가을 축제 시음")
  await form.getByLabel("알리려는 제품").fill("저당 탄산수")
  await form.getByRole("button", { name: "서울" }).click()
  await form.getByLabel("학교 수").fill("3")
  await form.getByRole("button", { name: "요청서 보내기" }).click()
  await expect(page.getByText("요청서를 보냈어요. 견적이 나오면 알려 드릴게요.")).toBeVisible()

  await page.getByRole("button", { name: /가을 축제 시음/ }).click()
  await expect(page.getByRole("list", { name: "진행 단계" }).locator("[aria-current=step]")).toHaveText("견적 준비 중")
  const id = page.url().split("/").pop()!

  // 운영자가 견적을 쓰면 결제할 수 있다.
  const quoted = await request.put(`/api/admin/programs/${id}/quote`, {
    data: { fee: 900_000, costs: [{ label: "단체 지원금", amount: 1_200_000 }] },
    headers: { "X-Admin-Token": "e2e-admin-token" },
  })
  expect(quoted.status()).toBe(200)
  await page.reload()
  await expect(page.getByRole("list", { name: "진행 단계" }).locator("[aria-current=step]")).toHaveText("결제 대기")
  await expect(page.getByRole("region", { name: "견적" })).toContainText("990,000원")
  await expect(page.getByRole("button", { name: "운영비 결제하기" })).toBeVisible()

  await page.getByRole("button", { name: "요청 거두기" }).click()
  await expect(page.getByText("캠페인 요청을 거뒀어요.")).toBeVisible()
  await expect(page.getByText("취소된 캠페인이에요.")).toBeVisible()
})
