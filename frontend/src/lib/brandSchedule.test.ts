import { describe, expect, test } from "vitest"

import { upcomingAwaitingContract, upcomingSponsorships } from "./brandSchedule"
import type { EventItem, SentProposal, SponsorRequest } from "../types"

const today = "2026-11-10"
const request = (extra: Partial<SponsorRequest>): SponsorRequest =>
  ({
    id: "r1", brandId: "b", groupName: "삼육대 뮤즈", school: "", industry: "카페", eventName: "가을 공연",
    eventDate: "2026-11-20", people: "", ask: "", message: "", status: "수락", createdAt: "", contract: "confirmed",
    ...extra,
  }) as SponsorRequest
const sent = (extra: Partial<SentProposal>): SentProposal =>
  ({
    id: "s1", partnerId: "g", partnerName: "연세 축제", industry: "카페", eventName: "겨울 캠페인",
    eventDate: "2026-11-15", offer: "", status: "수락", createdAt: "", contract: "confirmed",
    ...extra,
  }) as SentProposal

describe("the brand's upcoming sponsorships", () => {
  test("count received and sent confirmed ones once, nearest first", () => {
    const list = upcomingSponsorships([request({}), request({})], [sent({})], [], today)
    expect(list.map((item) => item.id)).toEqual(["s1", "r1"])
    expect(list[0]).toMatchObject({ partner: "연세 축제", from: "sent" })
  })

  test("leave out accepted ones waiting for the contract, and canceled ones", () => {
    const requests = [request({ id: "w", contract: "waiting" }), request({ id: "c", status: "취소됨" })]
    expect(upcomingSponsorships(requests, [sent({ contract: "waiting" })], [], today)).toEqual([])
    expect(upcomingAwaitingContract(requests, [sent({ contract: "waiting" })], [], today).map((item) => item.id)).toEqual(["s1", "w"])
  })

  test("keep a campaign over several days until its last day, by Korean date", () => {
    const campaign = { name: "겨울 캠페인", date: "2026-11-08", endDate: "2026-11-10" } as EventItem
    expect(upcomingSponsorships([], [sent({ eventDate: "2026-11-08" })], [campaign], today)).toHaveLength(1)
    expect(upcomingSponsorships([], [sent({ eventDate: "2026-11-08" })], [campaign], "2026-11-11")).toHaveLength(0)
    // 지난 하루짜리 행사와 날짜가 없는 제안은 빠진다.
    expect(upcomingSponsorships([request({ eventDate: "2026-11-09" }), request({ id: "x", eventDate: "" })], [], [], today)).toEqual([])
  })
})
