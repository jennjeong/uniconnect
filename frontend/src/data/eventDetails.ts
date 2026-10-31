// A student group's event as brands judge it: what kind it is and who comes
// (backend lib/validation.ts lists the same; lists.sync.test.ts checks).
// Kept in Korean as values and shown through t().
export const eventKinds = ["축제", "체육대회", "MT · OT", "간식 행사", "세미나 · 강연", "네트워킹", "공모전 · 해커톤", "졸업 전시 · 패션쇼", "총회", "공연", "기타"] as const
export const audienceYears = ["1학년", "2학년", "3학년", "4학년", "대학원생", "졸업생 · 동문", "교직원", "지역 주민"] as const
