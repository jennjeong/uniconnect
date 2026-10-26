import { describe, expect, test } from "vitest"

import { answerNotices, brandNotifications, soonNotices, studentNotifications } from "./notifications"
import type { Inquiry, Match } from "../types"

describe("the notice of the operators' answers", () => {
  const asked = (id: string, extra: Partial<Inquiry> = {}): Inquiry => ({
    id,
    category: "계정 · 가입",
    question: "로그인 이메일을 바꿀 수 있나요?",
    createdAt: "2026-11-01T00:00:00.000Z",
    ...extra,
  })
  const answered = { answer: "내 정보에서 바꿀 수 있어요.", answeredAt: "2026-11-02T00:00:00.000Z" }

  test("shows only answers not yet seen, and opens the help center", () => {
    expect(answerNotices([asked("waiting"), asked("seen", { ...answered, answerReadAt: "2026-11-03T00:00:00.000Z" })])).toEqual([])
    const [notice] = answerNotices([asked("new", answered)])
    expect(notice).toMatchObject({ key: "answers", title: "문의에 답변이 왔어요", faq: true })
    expect(notice.caption).toBe("‘계정 · 가입’ 질문의 답을 확인해 보세요.")
    expect(answerNotices([asked("a", answered), asked("b", answered)])[0].caption).toBe("답변 2개를 확인해 보세요.")
  })
})

describe("notices for a member with nothing yet", () => {
  const match: Match = { id: "brand-1", name: "첫 카페", category: "카페 · 식음료", industry: "cafe", offer: "", score: 70, tags: [] }

  test("a group or a brand that just joined has none, so the bell has nothing to point at", () => {
    expect(studentNotifications({ matches: [], brands: [], statuses: {}, report: null, offers: [], events: [] })).toEqual([])
    expect(brandNotifications({ matches: [], requests: [], sponsorships: [], events: [] })).toEqual([])
  })

  test("the matches are a notice once there are some", () => {
    const student = studentNotifications({ matches: [match], brands: [match], statuses: {}, report: null, offers: [], events: [] })
    expect(student.map((notice) => notice.title)).toEqual(["새 추천 매칭 1건"])
    const brand = brandNotifications({ matches: [match], requests: [], sponsorships: [], events: [] })
    expect(brand.map((notice) => notice.title)).toEqual(["추천 학생단체 1곳"])
  })
})

describe("notices of the days that are near", () => {
  const entries = [
    { id: "far", name: "먼 공연", date: "2026-11-30" },
    { id: "three", name: "사흘 뒤 공연", date: "2026-11-28" },
    { id: "today", name: "오늘 공연", date: "2026-11-25" },
    { id: "tomorrow", name: "내일 공연", date: "2026-11-26" },
    { id: "past", name: "어제 공연", date: "2026-11-24" },
  ]

  test("lists the days three days away or nearer, nearest first", () => {
    const notices = soonNotices(entries, "내 행사", "2026-11-25")
    expect(notices.map((notice) => notice.title)).toEqual([
      "오늘은 ‘오늘 공연’ 날이에요",
      "내일은 ‘내일 공연’ 날이에요",
      "‘사흘 뒤 공연’까지 3일 남았어요",
    ])
    expect(notices.every((notice) => notice.icon === "calendar" && notice.target === "내 행사")).toBe(true)
    expect(notices[0].key).toBe("soon-today")
  })

  test("has nothing when no day is near", () => {
    expect(soonNotices(entries, "행사 일정", "2026-12-10")).toEqual([])
  })
})
