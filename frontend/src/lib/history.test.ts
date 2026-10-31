import { describe, expect, test } from "vitest"

import { historyCsv, sponsorHistory, trackRecord } from "./history"
import type { EventMeasurement } from "../types"

const noVenue = { samples: 0, stamps: 0, posts: 0, surveys: 0, purchases: 0, giveaways: 0, raffles: 0, signups: 0, experiences: 0 }

const event = (eventId: string, eventDate: string, sponsorValue: number, roas: number, brands: string[], scans: number, visits: number) =>
  ({
    eventId,
    metrics: { scans, coupons: Math.round(scans / 2), visits, ...noVenue },
    report: {
      eventId,
      eventName: `행사 ${eventId}`,
      eventDate,
      sponsorValue,
      roas,
      sponsors: brands.map((brandName, index) => ({ id: `${eventId}-${index}`, brandName })),
    },
  }) as unknown as EventMeasurement

describe("the sponsorship record", () => {
  const list = [
    event("a", "2026-05-10", 300000, 240, ["오후의 커피"], 120, 30),
    event("b", "2026-10-12", 0, 0, [], 40, 0),
    event("c", "2026-12-01", 200000, 0, ["오후의 커피"], 0, 0),
    event("d", "2026-09-01", 500000, 120, ["오후의 커피", "캠퍼스 문구"], 200, 50),
  ]

  test("keeps events that have begun, latest first, with ROAS only where a value is set", () => {
    const rows = sponsorHistory(list, "2026-11-01")
    expect(rows.map((row) => row.eventId)).toEqual(["b", "d", "a"])
    expect(rows[0].roas).toBeNull()
    expect(rows[1]).toMatchObject({ brands: ["오후의 커피", "캠퍼스 문구"], roas: 120, scans: 200, visits: 50 })
  })

  test("adds up to a track record, each brand counted once", () => {
    expect(trackRecord(sponsorHistory(list, "2026-11-01"))).toEqual({ events: 3, brands: 2, scans: 360, visits: 80, roas: 180 })
    expect(trackRecord([])).toEqual({ events: 0, brands: 0, scans: 0, visits: 0, roas: null })
  })

  test("hands over as a spreadsheet", () => {
    const file = historyCsv(sponsorHistory(list, "2026-11-01")).replace(/^﻿/, "").split("\r\n")
    expect(file[0]).toBe("행사,시작일,종료일,협찬사,협찬 가치(원),QR 스캔,쿠폰 수령,매장 방문,ROAS(%)")
    expect(file[1]).toBe("행사 b,2026-10-12,2026-10-12,,0,40,20,0,")
    expect(file[2]).toBe("행사 d,2026-09-01,2026-09-01,오후의 커피 / 캠퍼스 문구,500000,200,100,50,120")
  })
})
