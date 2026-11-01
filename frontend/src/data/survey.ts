// The participants' optional four questions on the check-in page (backend
// lib/validation.ts surveyOptions; lib/lists.sync.test.ts checks they
// match), kept in Korean and shown through t().
export const surveyOptions = {
  grade: ["1학년", "2학년", "3학년", "4학년 이상", "대학원생", "졸업생 · 기타"],
  field: ["인문 · 사회", "경영 · 경제", "자연 · 공학", "의약 · 보건", "예체능", "교육", "기타"],
  visited: ["처음이에요", "가 본 적 있어요", "잘 모르겠어요"],
  gender: ["여성", "남성", "밝히고 싶지 않아요"],
} as const

export type SurveyKey = keyof typeof surveyOptions

export const surveyQuestions: Record<SurveyKey, string> = {
  grade: "학년",
  field: "전공 계열",
  visited: "쿠폰 가게에 가 본 적 있나요?",
  gender: "성별",
}
