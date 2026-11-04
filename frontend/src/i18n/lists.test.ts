import { describe, expect, test } from "vitest"

import { carriers } from "../data/carriers"
import { audienceYears, eventKinds, handoutWays, logoSpots, promoPosts } from "../data/eventDetails"
import { inquiryCategories } from "../data/inquiries"
import { methodInfo } from "../data/methods"
import { metricInfo } from "../data/metrics"
import { navItems } from "../data/navigation"
import { placeCategories } from "../data/places"
import { reportReasons } from "../data/reports"
import { reviewTags } from "../data/reviews"
import { accountTypeGroups, accountTypes, positionHints, roles } from "../data/roles"
import { valueTypes } from "../data/sponsorTypes"
import { regions } from "../data/universities"
import { brandOffers } from "../data/profile"
import { en } from "./en"

// 코드에 쓰이지 않고 목록에서 가져와 화면이 t(value)로 보여주는 값, 각각의
// 영어와 함께.
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
      // 현장의 기록이 말하는 것 (backend lib/measurements.ts의 recordMetric).
      "샘플링 · 시음",
      ...inquiryCategories,
      ...reportReasons,
      ...carriers,
      ...eventKinds,
      ...regions,
      ...brandOffers,
      ...audienceYears,
      ...logoSpots,
      ...handoutWays,
      ...promoPosts,
      ...placeCategories.map((category) => category.label),
      ...roles.flatMap((role) => reviewTags[role]),
      "매칭 중",
      "집행 예정",
      "측정 완료",
      // 행사 측정의 상태 (lib/measurements.ts).
      "진행 전",
      "측정 중",
      "진행 완료",
      "검토 중",
      "수락",
      "거절",
      "취소됨",
      "마감",
      // 상세 페이지가 막대로 보여주는 매칭의 항목 (matchScore.ts).
      "업종 궁합",
      "관심사",
      "협찬 경험",
      "행사 규모",
      "함께한 이력",
      "응답 준비",
      "가까운 행사",
      // The catalogs' 찜 tab (MatchesPage, GroupsPage).
      "찜",
    ]
    expect(values.filter((value) => !(value in en))).toEqual([])
  })
})
