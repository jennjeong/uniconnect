// 브랜드가 판단하는 학생단체의 행사: 어떤 종류이고 누가 오는지 (backend
// lib/validation.ts가 같은 목록을 가지며 lists.sync.test.ts가 검사한다).
// 값으로는 한국어를 유지하고 t()로 보여준다.
export const eventKinds = ["축제", "체육대회", "MT · OT", "간식 행사", "세미나 · 강연", "네트워킹", "공모전 · 해커톤", "졸업 전시 · 패션쇼", "총회", "공연", "기타"] as const
export const audienceYears = ["1학년", "2학년", "3학년", "4학년", "대학원생", "졸업생 · 동문", "교직원", "지역 주민"] as const

// 홍보 · 배포 계획: 브랜드 로고가 어디에 보이는지, 물품이 사람들에게 어떻게
// 닿는지, 단체가 무엇을 올리는지 (backend lib/validation.ts,
// lists.sync.test.ts가 검사한다).
export const logoSpots = ["행사 포스터", "현수막", "부스 배너", "SNS 카드뉴스", "SNS 릴스 · 숏폼", "행사 안내 자료", "무대 · 스크린 소개"] as const
export const handoutWays = ["운영진이 직접 배포", "부스 방문자에게 증정", "이벤트 참여자에게 증정", "선착순 배포", "추첨 당첨자에게 증정"] as const
export const promoPosts = ["협찬 게시물 1회", "협찬 게시물 2회", "릴스 · 숏폼 영상", "행사 전 SNS 사전 홍보", "행사 당일 스토리", "행사 후 후기 게시물", "브랜드 계정 태그"] as const
