import { describe, expect, test } from "vitest"

import { regions, universities } from "./universities"

describe("universities by region", () => {
  test("every region has its schools, each written once per region", () => {
    for (const region of regions) {
      const schools = universities[region]
      expect(schools.length).toBeGreaterThan(0)
      expect(new Set(schools).size).toBe(schools.length)
    }
  })

  test("the campuses groups come from are listed (backend/src/data/campuses.ts)", () => {
    for (const school of ["삼육대학교", "서울여자대학교", "광운대학교", "서울과학기술대학교", "덕성여자대학교", "인덕대학교"]) {
      expect(universities.서울).toContain(school)
    }
  })
})
