import type { IconName } from "../components/Icon"
import type { Role } from "../types"

export const roles: Role[] = ["학생단체", "브랜드"]

export const roleOptions: {
  value: Role
  title: string
  caption: string
  icon: IconName
}[] = [
  { value: "학생단체", title: "협찬 받기", caption: "학생단체 · 동아리", icon: "users" },
  { value: "브랜드", title: "협찬 하기", caption: "스폰서 · 브랜드", icon: "store" },
]

// Keep in sync with accountTypes in backend/src/lib/validation.ts
// (lib/lists.sync.test.ts checks).
export const accountTypes: Record<Role, string[]> = {
  학생단체: ["공연 동아리", "학술 동아리", "봉사 동아리", "학생회", "연합 동아리", "기타"],
  브랜드: ["카페 · 식음료", "뷰티 · 패션", "콘텐츠 · 미디어", "스포츠 · 웰니스", "교육", "기타"],
}

export const createLabel = (role: Role) =>
  role === "학생단체" ? "새 행사 등록" : "새 캠페인 등록"
