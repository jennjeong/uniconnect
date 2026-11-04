import { t } from "../i18n"
import type { Role } from "../types"

// backend/src/lib/validation.ts의 factLabels, snsPlatforms와 맞춰 둔다
// (lib/lists.sync.test.ts가 검사한다). 라벨과 플랫폼은 서버가 검사하는 값이므로
// 한국어로 유지하고 t()로 보여준다.
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

// 브랜드가 프로필에서 고를 수 있는 제공 내용 (개수 제한 없음).
// backend/src/lib/validation.ts의 brandOffers와 맞춰 둔다. 값은 t()로 보여준다.
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

// 각 쪽이 자기 제공 내용과 포트폴리오를 부르는 이름.
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
