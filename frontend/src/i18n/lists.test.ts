import { describe, expect, test } from "vitest"

import { inquiryCategories } from "../data/inquiries"
import { methodInfo } from "../data/methods"
import { metricInfo } from "../data/metrics"
import { navItems } from "../data/navigation"
import { placeCategories } from "../data/places"
import { reviewTags } from "../data/reviews"
import { accountTypeGroups, accountTypes, positionHints, roles } from "../data/roles"
import { valueTypes } from "../data/sponsorTypes"
import { en } from "./en"

// Values the screens show through t(value), from lists rather than written
// in the code, each with its English.
describe("English for listed values", () => {
  test("roles, menu pages, account types, kinds and statuses", () => {
    const values = [
      ...roles,
      ...roles.flatMap((role) => navItems[role].flatMap((item) => [item.label, ...(item.short ? [item.short] : [])])),
      ...roles.flatMap((role) => accountTypes[role]),
      ...roles.flatMap((role) => accountTypeGroups[role].map((group) => group.label)),
      ...roles.flatMap((role) => positionHints[role]),
      ...valueTypes,
      ...Object.values(metricInfo).map((info) => info.label),
      ...Object.values(methodInfo).flatMap((info) => [info.label, info.detail]),
      // What the venue's records say (backend lib/measurements.ts recordMetric).
      "샘플링 · 시음",
      ...inquiryCategories,
      ...placeCategories.map((category) => category.label),
      ...roles.flatMap((role) => reviewTags[role]),
      "매칭 중",
      "집행 예정",
      "측정 완료",
      // Where an event's measurement stands (lib/measurements.ts).
      "진행 전",
      "측정 중",
      "진행 완료",
      "검토 중",
      "수락",
      "거절",
      "마감",
      // The parts of a match the detail page shows as bars (matchScore.ts).
      "업종 궁합",
      "관심사",
      "협찬 경험",
      "행사 규모",
      "함께한 이력",
      "응답 준비",
      "가까운 행사",
    ]
    expect(values.filter((value) => !(value in en))).toEqual([])
  })
})
