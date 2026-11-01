import { describe, expect, test } from "vitest"

import { peakHour, shares, studentInsights } from "./studentInsights"
import type { Metrics, Report } from "../types"

const noVenue = { samples: 0, stamps: 0, posts: 0, surveys: 0, purchases: 0, giveaways: 0, raffles: 0, signups: 0, experiences: 0 }
const metrics: Metrics = { scans: 40, coupons: 20, visits: 4, ...noVenue }
const report = {
  expectedAudience: 100,
  hourlyScans: [
    { date: "2026-11-01", hour: 13, scans: 10 },
    { date: "2026-11-01", hour: 18, scans: 25 },
    { date: "2026-11-02", hour: 13, scans: 5 },
  ],
  makeup: { female: 50 },
  survey: {
    responses: 20,
    grade: { "1학년": 12, "2학년": 8 },
    field: { "자연 · 공학": 15, "예체능": 5 },
    visited: { 처음이에요: 10, "가 본 적 있어요": 10 },
    gender: { 여성: 14, 남성: 6 },
  },
} as unknown as Report

describe("the students' report", () => {
  test("shares put the largest answer first", () => {
    expect(shares({ a: 1, b: 3, c: 0 })).toEqual([
      { label: "b", count: 3, share: 75 },
      { label: "a", count: 1, share: 25 },
    ])
  })

  test("the busiest hour adds up the event's days", () => {
    expect(peakHour(report)).toBe(18)
  })

  test("rates, the leading answers and advice for next time", () => {
    const insight = studentInsights(report, metrics)
    expect([insight.participation, insight.couponRate, insight.visitRate, insight.firstTime]).toEqual([40, 50, 20, 50])
    expect(insight.grade?.label).toBe("1학년")
    expect(insight.advice.some((line) => line.includes("참여율이 40%"))).toBe(true)
    expect(insight.advice.some((line) => line.includes("실제 여성 참여는 70%"))).toBe(true)
    expect(insight.advice.length).toBeLessThanOrEqual(6)
    // Without a survey, it asks for one next time.
    const bare = studentInsights({ ...report, survey: undefined } as Report, metrics)
    expect(bare.advice.at(-1)).toContain("설문")
    expect(bare.advice.filter((line) => line.includes("설문"))).toHaveLength(1)
  })
})
