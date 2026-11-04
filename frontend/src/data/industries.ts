import type { Industry } from "../types"

// The brands' industries, in the order of 추천 매칭's 업종별 chips.
export const brandIndustries: [Industry, string][] = [
  ["cafe", "카페·식음료"],
  ["beauty", "뷰티"],
  ["photo", "사진"],
  ["content", "영상·콘텐츠"],
  ["wellness", "웰니스·F&B"],
  ["education", "교육"],
  ["sports", "스포츠"],
]

// 단체 찾기의 분야별 칩 순서대로, 학생단체의 분야.
export const groupFields: [Industry, string][] = [
  ["performance", "공연·행사"],
  ["content", "콘텐츠"],
  ["sports", "스포츠"],
  ["wellness", "봉사"],
  ["education", "학술"],
]
