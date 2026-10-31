import { todayInKorea } from "./dates.js"
import type { Database } from "../types.js"

// One figure two ways: from real members only, and with the demo accounts
// and the seed data that came with them.
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

// What the operators watch (GET /api/admin/stats): sign-ups, events,
// proposals and their answers, sponsorships, on-site measurement, messages
// and questions waiting. "real" leaves out the demo accounts and anything
// no member made (the seed's proposals), so it is what actual members did.
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
  // A conversation is real once either side's listing belongs to a member.
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

// What the dashboards may show anyone (GET /api/site): how many members
// signed up on each side, from how many schools, and the sponsorships they
// made, never counting the demo accounts or the seed.
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
