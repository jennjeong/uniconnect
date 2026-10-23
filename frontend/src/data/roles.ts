import { t } from "../i18n"
import type { Role } from "../types"

export const roles: Role[] = ["학생단체", "브랜드"]

export const roleOptions: {
  value: Role
  title: string
  caption: string
}[] = [
  // Each shows with its symbol from the logo (components/RoleMark.tsx).
  { value: "학생단체", title: t("협찬 받기"), caption: t("학생단체 · 동아리") },
  { value: "브랜드", title: t("협찬 하기"), caption: t("스폰서 · 브랜드") },
]

// Keep in sync with accountTypes in backend/src/lib/validation.ts
// (lib/lists.sync.test.ts checks).
export const accountTypes: Record<Role, string[]> = {
  학생단체: ["공연 동아리", "학술 동아리", "봉사 동아리", "학생회", "연합 동아리", "기타"],
  브랜드: ["카페 · 식음료", "뷰티 · 패션", "콘텐츠 · 미디어", "스포츠 · 웰니스", "교육", "기타"],
}

export const createLabel = (role: Role) =>
  role === "학생단체" ? t("새 행사 등록") : t("새 캠페인 등록")
