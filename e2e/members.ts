import type { APIRequestContext } from "@playwright/test"

// A member signed up through the API with the code the test server shows
// (EXPOSE_EMAIL_CODES), as the demo accounts meet only the examples: its
// token and the header that sends it. A brand also writes its introduction,
// so student groups find it. `type` picks another account type (a student
// council's, say).
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
    data: { intro: "대학가에서 학생 행사를 돕는 카페예요.", offer: "음료 쿠폰 100장" },
    headers,
  })
  const { profile } = (await written.json()) as { profile: { id: string } }
  return { token, headers, listingId: profile.id }
}
