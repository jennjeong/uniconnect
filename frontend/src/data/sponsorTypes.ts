import type { Role } from "../types"

// Kinds of sponsorship, as the server takes them (sponsorTypes in
// backend/src/lib/validation.ts; lib/lists.sync.test.ts checks they agree).
// Student groups pick what they want; brands pick what they offer.
export const sponsorOptions: Record<Role, { value: string; caption: string }[]> = {
  학생단체: [
    { value: "현금", caption: "행사 운영비 지원" },
    { value: "제품", caption: "음료 · 간식 · 굿즈 같은 현물" },
    { value: "서비스", caption: "촬영 · 디자인 · 장소 지원" },
    { value: "기타", caption: "원하는 협찬을 직접 적어 주세요" },
  ],
  브랜드: [
    { value: "현금", caption: "행사 운영비 후원" },
    { value: "제품", caption: "자사 제품 · 시음 · 샘플링" },
    { value: "서비스", caption: "매장 공간 · 촬영 · 디자인 지원" },
    { value: "기타", caption: "제공할 협찬을 직접 적어 주세요" },
  ],
}

// The same kinds for a sponsorship's value in the goals form.
export const valueTypes = sponsorOptions.학생단체.map((option) => option.value)
