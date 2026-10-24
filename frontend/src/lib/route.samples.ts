import type { View } from "./route"

// One view of every kind, for the address tests (route.test.ts and
// appPaths.sync.test.ts).
export const sampleViews: View[] = [
  { page: "대시보드" },
  { page: "추천 매칭" },
  { page: "추천 매칭", detail: "afternoon-coffee" },
  { page: "단체 찾기", detail: "삼육대 뮤즈/2026" },
  { page: "받은 협찬" },
  { page: "내 행사" },
  { page: "성과 측정" },
  { page: "리포트" },
  { page: "단체 찾기" },
  { page: "받은 제안" },
  { page: "행사 일정" },
  { page: "성과 분석" },
  { page: "대시보드", create: "2026-11-27" },
  { page: "대시보드", profile: "page" },
  { page: "대시보드", profile: "edit" },
  { page: "대시보드", messages: true },
  { page: "대시보드", chat: "conversation 1" },
  { page: "대시보드", faq: true },
  { page: "대시보드", legal: "terms" },
  { page: "대시보드", legal: "privacy" },
  { page: "대시보드", admin: true },
  { page: "대시보드", invite: "Ab3_x-9Z" },
]
