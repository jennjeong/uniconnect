import type { Role } from "../types.js"
import { HttpError } from "./errors.js"

export const accountTypes: Record<Role, string[]> = {
  학생단체: ["공연 동아리", "학술 동아리", "봉사 동아리", "학생회", "연합 동아리", "기타"],
  브랜드: ["카페 · 식음료", "뷰티 · 패션", "콘텐츠 · 미디어", "스포츠 · 웰니스", "교육", "기타"],
}

export const sponsorTypes = ["현금", "제품", "서비스"]

export function parseRole(value: unknown): Role {
  if (value === "학생단체" || value === "브랜드") return value
  throw new HttpError(400, "회원 유형을 선택해 주세요.")
}

export const text = (value: unknown) => String(value ?? "").trim()
