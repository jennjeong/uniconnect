// A student group's event as brands judge it: what kind it is and who comes
// (backend lib/validation.ts lists the same; lists.sync.test.ts checks).
// Kept in Korean as values and shown through t().
export const eventKinds = ["축제", "체육대회", "MT · OT", "간식 행사", "세미나 · 강연", "네트워킹", "공모전 · 해커톤", "졸업 전시 · 패션쇼", "총회", "공연", "기타"] as const
export const audienceYears = ["1학년", "2학년", "3학년", "4학년", "대학원생", "졸업생 · 동문", "교직원", "지역 주민"] as const

// 홍보 · 배포 계획: where a brand's logo shows, how goods reach people, and
// what the group posts (backend lib/validation.ts; lists.sync.test.ts checks).
export const logoSpots = ["행사 포스터", "현수막", "부스 배너", "SNS 카드뉴스", "SNS 릴스 · 숏폼", "행사 안내 자료", "무대 · 스크린 소개"] as const
export const handoutWays = ["운영진이 직접 배포", "부스 방문자에게 증정", "이벤트 참여자에게 증정", "선착순 배포", "추첨 당첨자에게 증정"] as const
export const promoPosts = ["협찬 게시물 1회", "협찬 게시물 2회", "릴스 · 숏폼 영상", "행사 전 SNS 사전 홍보", "행사 당일 스토리", "행사 후 후기 게시물", "브랜드 계정 태그"] as const
