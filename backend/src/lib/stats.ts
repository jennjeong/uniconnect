import { todayInKorea } from "./dates.js"
import type { Database } from "../types.js"

// 같은 수치를 두 가지로: 실제 회원만 센 것, 그리고 데모 계정과 함께 온
// 시드 데이터를 더한 것.
export type Figure = { real: number; total: number }

export type PlatformStats = Record<
  | "students"
  | "brands"
  | "newThisWeek"
  | "events"
  | "upcomingEvents"
  | "proposals"
  | "accepted"
  | "declined"
  | "sponsorships"
  | "scans"
  | "coupons"
  | "visits"
  | "messages"
  | "questionsWaiting",
  Figure
>

// 운영자가 보는 것(GET /api/admin/stats): 가입, 행사, 제안과 그 답, 협찬,
// 현장 측정, 메시지, 대기 중인 문의. "real"은 데모 계정과 회원이 만들지
// 않은 것(시드의 제안)을 빼서 실제 회원이 한 일만 센다.
export function platformStats(database: Database, now = new Date()): PlatformStats {
  const demo = new Set(Object.values(database.demoAccountIds))
  const isReal = (accountId: string | undefined) => accountId !== undefined && !demo.has(accountId)
  const count = <T>(items: T[], real: (item: T) => boolean): Figure => ({
    real: items.filter(real).length,
    total: items.length,
  })
  const sum = <T>(items: T[], value: (item: T) => number, real: (item: T) => boolean): Figure => ({
    real: items.filter(real).reduce((total, item) => total + value(item), 0),
    total: items.reduce((total, item) => total + value(item), 0),
  })

  const accounts = database.accounts
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const today = todayInKorea(now)
  const events = Object.entries(database.events).flatMap(([accountId, list]) =>
    list.map((event) => ({ accountId, last: event.endDate ?? event.date })),
  )
  const proposals = [...database.requests, ...database.offers]
  const sponsorships = Object.entries(database.sponsorships).flatMap(([accountId, list]) => list.map(() => accountId))
  // 대화는 어느 한쪽의 리스팅이 회원 것이면 실제 대화다.
  const memberListings = new Set(
    accounts.filter((account) => isReal(account.id)).flatMap((account) => [account.groupId, account.brandId]),
  )
  const messages = database.conversations.flatMap((conversation) =>
    conversation.messages.map(() => memberListings.has(conversation.groupId) || memberListings.has(conversation.brandId)),
  )

  return {
    students: count(accounts.filter((account) => account.role === "학생단체"), (account) => isReal(account.id)),
    brands: count(accounts.filter((account) => account.role === "브랜드"), (account) => isReal(account.id)),
    newThisWeek: count(accounts.filter((account) => account.createdAt >= weekAgo), (account) => isReal(account.id)),
    events: count(events, (event) => isReal(event.accountId)),
    upcomingEvents: count(events.filter((event) => event.last >= today), (event) => isReal(event.accountId)),
    proposals: count(proposals, (proposal) => isReal(proposal.fromAccountId)),
    accepted: count(proposals.filter((proposal) => proposal.status === "수락"), (proposal) => isReal(proposal.fromAccountId)),
    declined: count(proposals.filter((proposal) => proposal.status === "거절"), (proposal) => isReal(proposal.fromAccountId)),
    sponsorships: count(sponsorships, isReal),
    scans: sum(database.measurements, (item) => item.metrics.scans, (item) => isReal(item.accountId)),
    coupons: sum(database.measurements, (item) => item.metrics.coupons, (item) => isReal(item.accountId)),
    visits: sum(database.measurements, (item) => item.metrics.visits, (item) => isReal(item.accountId)),
    messages: count(messages, (real) => real),
    questionsWaiting: count(database.inquiries.filter((inquiry) => !inquiry.answer), (inquiry) => isReal(inquiry.accountId)),
  }
}

// 대시보드가 누구에게나 보여 줄 수 있는 것(GET /api/site): 양쪽에 가입한
// 회원 수, 학교 수, 이들이 맺은 협찬. 데모 계정과 시드는 세지 않는다.
export function publicCounts(database: Database) {
  const demo = new Set(Object.values(database.demoAccountIds))
  const members = database.accounts.filter((account) => !demo.has(account.id))
  const groups = members.filter((account) => account.role === "학생단체")
  return {
    groups: groups.length,
    brands: members.filter((account) => account.role === "브랜드").length,
    schools: new Set(groups.map((account) => account.school.trim()).filter(Boolean)).size,
    sponsorships: Object.entries(database.sponsorships)
      .filter(([accountId]) => !demo.has(accountId))
      .reduce((total, [, list]) => total + list.length, 0),
  }
}
