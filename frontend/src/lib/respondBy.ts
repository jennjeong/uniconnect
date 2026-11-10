import { daysUntil, fromIsoDate, todayIso } from "./date"
import type { ProposalTerms, RequestStatus } from "../types"

// 제안의 응답 기한(terms.respondBy)이 지금 어디쯤인지. 답을 기다리는 제안만
// 기한이 의미가 있다: 수락·거절·취소된 제안과 행사가 끝나 마감된 제안(statusOf)은
// 기한을 보이지 않는다. 기한이 지나도 자동으로 마감하지 않는다.
export type DeadlineState = "overdue" | "today" | "soon" | "later"

// 이 날수 안이면 임박.
export const soonDays = 3

export function deadlineOf(item: { status: RequestStatus; terms?: ProposalTerms }, today = todayIso()) {
  if (item.status !== "검토 중") return null
  const date = item.terms?.respondBy
  if (!date || !fromIsoDate(date)) return null
  const days = daysUntil(date, today)
  const state: DeadlineState = days < 0 ? "overdue" : days === 0 ? "today" : days <= soonDays ? "soon" : "later"
  return { date, days, state }
}

// 기한이 있는 제안을 가까운(지난) 순서로 앞에, 기한이 없는 제안은 원래 순서대로 뒤에.
export function byDeadline<T extends { status: RequestStatus; terms?: ProposalTerms }>(items: T[], today = todayIso()) {
  return items
    .map((item, index) => ({ item, index, deadline: deadlineOf(item, today) }))
    .sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.date.localeCompare(b.deadline.date) || a.index - b.index
      if (a.deadline) return -1
      if (b.deadline) return 1
      return a.index - b.index
    })
    .map(({ item }) => item)
}
