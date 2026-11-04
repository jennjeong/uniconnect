import type { APIRequestContext } from "@playwright/test"

// API로 가입한 회원이다. 테스트 서버가 보여 주는 코드(EXPOSE_EMAIL_CODES)로
// 가입하며, 데모 계정은 예시만 만나기 때문이다. 토큰과 그것을 보내는 헤더를
// 돌려준다. 브랜드는 소개도 써서 학생단체가 찾을 수 있게 한다. `type`으로
// 다른 계정 유형(예: 총학생회)을 고를 수 있다.
export async function signUpMember(
  request: APIRequestContext,
  role: "학생단체" | "브랜드",
  email: string,
  name: string,
  type?: string,
) {
  const students = role === "학생단체"
  const code = (await (await request.post("/api/auth/email-code", { data: { role, email } })).json()) as { devCode: string }
  const verified = (await (
    await request.post("/api/auth/email-code/verify", { data: { email, code: code.devCode } })
  ).json()) as { verificationToken: string }
  const signup = await request.post("/api/auth/signup", {
    data: {
      role,
      name,
      type: type ?? (students ? "공연 동아리" : "카페 · 식음료"),
      school: students ? "삼육대학교" : "",
      email,
      password: "e2e-pass-123",
      verificationToken: verified.verificationToken,
      agreedToTerms: true,
      over14: true,
      contact: { name: "테스트 담당자", position: "회장", phone: "010-1234-5678" },
    },
  })
  const { token } = (await signup.json()) as { token: string }
  const headers = { Authorization: `Bearer ${token}` }
  if (students) return { token, headers, listingId: undefined }
  const written = await request.put("/api/profile", {
    data: { intro: "대학가에서 학생 행사를 돕는 카페예요.", offers: ["음료 · 식품", "할인 쿠폰"] },
    headers,
  })
  const { profile } = (await written.json()) as { profile: { id: string } }
  return { token, headers, listingId: profile.id }
}
