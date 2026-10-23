import type { Role } from "../types"

// Keep in sync with factLabels and snsPlatforms in backend/src/lib/validation.ts
// (lib/lists.sync.test.ts checks).
export const factFields: Record<Role, { label: string; placeholder: string }[]> = {
  학생단체: [
    { label: "회원 수", placeholder: "예) 42명" },
    { label: "주요 활동", placeholder: "예) 정기 공연 · 버스킹" },
    { label: "행사 규모", placeholder: "예) 회당 관객 120~160명" },
    { label: "활동 기간", placeholder: "예) 2014년부터" },
  ],
  브랜드: [
    { label: "위치", placeholder: "예) 공릉역 2번 출구 · 캠퍼스에서 1.2km" },
    { label: "제공 서비스", placeholder: "예) 음료 쿠폰 · 현금 · 시음 부스" },
    { label: "선호 행사", placeholder: "예) 공연 · 축제 · 스터디" },
    { label: "평균 응답", placeholder: "예) 1일 이내" },
  ],
}

export const snsPlatforms = ["인스타그램", "유튜브", "틱톡", "블로그", "웹사이트", "기타"]

// What each side calls its offer and its portfolio.
export const profileLabels: Record<Role, { offer: string; portfolio: string; portfolioHint: string }> = {
  학생단체: {
    offer: "협찬하면 얻는 것",
    portfolio: "지난 활동 · 협찬 실적",
    portfolioHint: "예) 가을 버스킹 데이 (2026.10) / 관객 160명 · QR 참여 128명",
  },
  브랜드: {
    offer: "제공하는 협찬",
    portfolio: "포트폴리오",
    portfolioHint: "예) 삼육대 뮤즈 버스킹 데이 (2026.10) / 쿠폰 150장 · ROAS 243%",
  },
}
