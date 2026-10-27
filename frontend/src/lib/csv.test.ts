import { describe, expect, test } from "vitest"

import { analyticsCsv, csvCell, reportCsv, toCsv } from "./csv"
import type { Metrics, Report, Sponsorship } from "../types"

const noVenue = { samples: 0, stamps: 0, posts: 0, surveys: 0, purchases: 0, giveaways: 0, raffles: 0, signups: 0, experiences: 0 }
const lines = (file: string) => file.replace(/^﻿/, "").split("\r\n")

describe("CSV files", () => {
  test("cells are quoted when they need it, and formulas stay text", () => {
    expect(csvCell("뮤즈")).toBe("뮤즈")
    expect(csvCell('공연, "가을"')).toBe('"공연, ""가을"""')
    expect(csvCell("줄\n바꿈")).toBe('"줄\n바꿈"')
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"")
    expect(csvCell("+82 10")).toBe("'+82 10")
    expect(csvCell("@me")).toBe("'@me")
    expect(csvCell(-5)).toBe("-5")
  })

  test("the file opens in Excel with Korean intact", () => {
    expect(toCsv([["행사", 1], []])).toBe("﻿행사,1\r\n\r\n")
  })

  test("a report lists the event, its goals, the counts, the hours and each sponsor", () => {
    const report = {
      eventId: "e1",
      code: "20261012",
      eventName: "가을 버스킹",
      eventDate: "2026-10-12",
      expectedAudience: 160,
      sponsorValue: 300000,
      reach: 328,
      roas: 243,
      targets: { reach: 300, scans: 120, coupons: 60, visits: 30, qrRate: 70, visitRate: 30, roas: 200 },
      hourlyScans: [{ date: "2026-10-12", hour: 18, scans: 20 }],
      valueBreakdown: [],
      averageSpend: 9000,
      snsReach: 200,
      coupon: { store: "오후의 커피", title: "음료 1잔" },
      methods: [],
      venue: noVenue,
      sponsors: [
        { id: "s1", brandName: "오후의 커피", coupon: { store: "오후의 커피", title: "음료 1잔" }, value: 300000, coupons: 40, visits: 12, roas: 243, methods: [], ...noVenue },
      ],
    } as unknown as Report
    const metrics: Metrics = { scans: 128, coupons: 40, visits: 12, ...noVenue }
    const file = lines(reportCsv(report, metrics))
    expect(file[0]).toBe("행사,가을 버스킹")
    expect(file).toContain("도달 인원,328,300,109")
    expect(file).toContain("QR 스캔,128")
    expect(file).toContain("2026-10-12,18,20")
    expect(file).toContain("오후의 커피,300000,40,12,243")
  })

  test("analytics have a line per sponsorship, and a column only for the counts some have", () => {
    const sponsorship = (extra: Partial<Sponsorship>): Sponsorship => ({
      id: "p1",
      groupName: "삼육대 뮤즈",
      eventName: "가을 버스킹",
      date: "2026-10-12",
      spend: 300000,
      coupons: 40,
      visits: 12,
      sales: 729000,
      targetRoas: 200,
      ...extra,
    })
    const file = lines(analyticsCsv([sponsorship({ samples: 30 }), sponsorship({ id: "p2", groupName: "=cmd" })]))
    expect(file[0]).toBe("단체,행사,날짜,집행액(원),쿠폰 수령,매장 방문,추정 매출(원),ROAS (%),목표 ROAS (%),방문당 비용(원),샘플 · 시음")
    expect(file[1]).toBe("삼육대 뮤즈,가을 버스킹,2026-10-12,300000,40,12,729000,243,200,25000,30")
    expect(file[2].startsWith("'=cmd,")).toBe(true)
  })
})
