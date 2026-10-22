import type { Role } from "../types.js"
import { HttpError } from "./errors.js"

export const accountTypes: Record<Role, string[]> = {
  학생단체: ["공연 동아리", "학술 동아리", "봉사 동아리", "학생회", "연합 동아리", "기타"],
  브랜드: ["카페 · 식음료", "뷰티 · 패션", "콘텐츠 · 미디어", "스포츠 · 웰니스", "교육", "기타"],
}

// Fixed facts each side's listing can fill in from 내 정보.
// Keep in sync with frontend/src/data/profile.ts.
export const factLabels: Record<Role, string[]> = {
  학생단체: ["회원 수", "주요 활동", "행사 규모", "활동 기간"],
  브랜드: ["위치", "제공 서비스", "선호 행사", "평균 응답"],
}

export const snsPlatforms = ["인스타그램", "유튜브", "틱톡", "블로그", "웹사이트", "기타"]

// "기타" comes with a free-text typeNote on the event.
export const sponsorTypes = ["현금", "제품", "서비스", "기타"]

// Kinds of question for the operators. Keep in sync with
// frontend/src/data/inquiries.ts.
export const inquiryCategories = ["이용 방법", "계정 · 가입", "제안 · 매칭", "오류 신고", "기타"]

export function parseRole(value: unknown): Role {
  if (value === "학생단체" || value === "브랜드") return value
  throw new HttpError(400, "회원 유형을 선택해 주세요.")
}

export const text = (value: unknown) => String(value ?? "").trim()
