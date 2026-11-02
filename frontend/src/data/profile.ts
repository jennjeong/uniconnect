import { t } from "../i18n"
import type { Role } from "../types"

// Keep in sync with factLabels and snsPlatforms in backend/src/lib/validation.ts
// (lib/lists.sync.test.ts checks). The labels and platforms are values the
// server checks: keep them in Korean and show them with t().
export const factFields: Record<Role, { label: string; placeholder: string }[]> = {
  학생단체: [
    { label: "회원 수", placeholder: t("예) 42명") },
    { label: "주요 활동", placeholder: t("예) 정기 공연 · 버스킹") },
    { label: "행사 규모", placeholder: t("예) 회당 관객 120~160명") },
    { label: "활동 기간", placeholder: t("예) 2014년부터") },
  ],
  브랜드: [
    { label: "위치", placeholder: t("예) 공릉역 2번 출구 · 캠퍼스에서 1.2km") },
    { label: "제공 서비스", placeholder: t("예) 음료 쿠폰 · 현금 · 시음 부스") },
    { label: "선호 행사", placeholder: t("예) 공연 · 축제 · 스터디") },
    { label: "평균 응답", placeholder: t("예) 1일 이내") },
  ],
}

export const snsPlatforms = ["인스타그램", "유튜브", "틱톡", "블로그", "웹사이트", "기타"]

// What a brand can offer, picked on its profile (any number). Keep in sync
// with brandOffers in backend/src/lib/validation.ts; values shown with t().
export const brandOffers = [
  "현금 후원",
  "제품 협찬",
  "음료 · 식품",
  "할인 쿠폰",
  "시음 · 샘플링",
  "굿즈 · 경품",
  "매장 공간 대관",
  "부스 운영",
  "촬영 · 디자인",
  "SNS 홍보",
]

// What each side calls its offer and its portfolio.
export const profileLabels: Record<Role, { offer: string; portfolio: string; portfolioHint: string }> = {
  학생단체: {
    offer: t("협찬하면 얻는 것"),
    portfolio: t("지난 활동 · 협찬 실적"),
    portfolioHint: t("예) 가을 버스킹 데이 (2026.10) / 관객 160명 · QR 참여 128명"),
  },
  브랜드: {
    offer: t("제공하는 협찬"),
    portfolio: t("포트폴리오"),
    portfolioHint: t("예) 삼육대 뮤즈 버스킹 데이 (2026.10) / 쿠폰 150장 · ROAS 243%"),
  },
}
