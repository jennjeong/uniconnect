import { describe, expect, test } from "vitest"

import { inquiryCategories } from "../data/inquiries"
import { metricInfo } from "../data/metrics"
import { navItems } from "../data/navigation"
import { placeCategories } from "../data/places"
import { reviewTags } from "../data/reviews"
import { accountTypes, roles } from "../data/roles"
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
      ...valueTypes,
      ...Object.values(metricInfo).map((info) => info.label),
      ...inquiryCategories,
      ...placeCategories.map((category) => category.label),
      ...roles.flatMap((role) => reviewTags[role]),
      "매칭 중",
      "집행 예정",
      "측정 완료",
      "검토 중",
      "수락",
      "거절",
    ]
    expect(values.filter((value) => !(value in en))).toEqual([])
  })
})
