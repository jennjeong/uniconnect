import { agreementState, duplicateIds, duplicatesOf, fieldAlerts, staleProposals, timeline } from "./adminInsights.js"
import { tagsOf } from "./adminTools.js"
import { paymentsOf } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { proUntil } from "./plan.js"
import { statusOf } from "./proposals.js"
import { isDemoAccount } from "./reviews.js"
import { platformStats } from "./stats.js"
import type { Account, Database } from "../types.js"

// The operators' console (pages/AdminPage.tsx): what needs them now, the
// platform's figures with eight weeks of trend and the revenue, every
// member with what it did, and every proposal. Never passwords, tokens,
// PINs or messages.

const koreanDate = (at: string) => new Date(new Date(at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

export function overview(database: Database, now = new Date()) {
  const today = todayInKorea(now)
  // Eight weeks, oldest first, each starting on a Monday.
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7))
  const weeks = Array.from({ length: 8 }, (_, index) => addDays(monday, (index - 7) * 7))
  const weekOf = (date: string) => [...weeks].reverse().find((start) => start <= date)
  const demo = new Set(Object.values(database.demoAccountIds))
  const weekly = weeks.map((week) => ({ week, signups: 0, proposals: 0, accepted: 0 }))
  for (const account of database.accounts) {
    if (demo.has(account.id)) continue
    const week = weekOf(koreanDate(account.createdAt))
    const row = weekly.find((item) => item.week === week)
    if (row) row.signups += 1
  }
  for (const proposal of [...database.requests, ...database.offers]) {
    if (!proposal.fromAccountId || demo.has(proposal.fromAccountId)) continue
    const row = weekly.find((item) => item.week === weekOf(koreanDate(proposal.createdAt)))
    if (!row) continue
    row.proposals += 1
    if (proposal.status === "수락") row.accepted += 1
  }
  const paid = paymentsOf(database).filter((payment) => payment.status === "paid")
  const month = today.slice(0, 7)
  const revenue = {
    total: paid.reduce((sum, payment) => sum + payment.amount, 0),
    thisMonth: paid.filter((payment) => koreanDate(payment.paidAt ?? payment.requestedAt).slice(0, 7) === month).reduce((sum, payment) => sum + payment.amount, 0),
    byKind: { fee: 0, report: 0, pro: 0, ad: 0 } as Record<"fee" | "report" | "pro" | "ad", number>,
    partners: database.accounts.filter((account) => proUntil(database, account.id) !== null).length,
  }
  for (const payment of paid) revenue.byKind[payment.kind] += payment.amount
  return {
    stats: platformStats(database, now),
    weekly,
    revenue,
    attention: {
      applications: database.applications?.length ?? 0,
      // Questions on hold wait on something else, so they don't count here.
      inquiries: database.inquiries.filter((inquiry) => !inquiry.answer && !database.inquiryHandling?.[inquiry.id]?.heldAt).length,
      reports: database.reports.filter((report) => !report.resolution).length,
      transfers: paymentsOf(database).filter((payment) => payment.status === "pending" && payment.transferRequestedAt).length,
      suspended: database.accounts.filter((account) => account.suspendedAt).length,
      stale: staleProposals(database, now).length,
      cancels: database.agreements.filter((agreement) => agreementState(agreement) === "cancel").length,
      alerts: fieldAlerts(database, now).length,
    },
  }
}

// One member as the list shows it.
export function memberRow(database: Database, account: Account) {
  const listing = account.role === "학생단체"
    ? database.groups.find((item) => item.id === account.groupId)
    : database.brands.find((item) => item.id === account.brandId)
  const lastSeen = database.sessions
    .filter((session) => session.accountId === account.id)
    .map((session) => session.lastUsedAt ?? session.createdAt)
    .sort()
    .at(-1)
  return {
    id: account.id,
    name: account.name,
    role: account.role,
    type: account.type,
    email: account.email,
    school: account.school,
    createdAt: account.createdAt,
    ...(lastSeen ? { lastSeen } : {}),
    ...(account.suspendedAt ? { suspendedAt: account.suspendedAt } : {}),
    demo: isDemoAccount(database, account),
    partnersUntil: proUntil(database, account.id),
    listed: Boolean(listing),
    paused: Boolean(listing?.pausedAt),
    events: (database.events[account.id] ?? []).length,
    sent: [...database.requests, ...database.offers].filter((item) => item.fromAccountId === account.id).length,
    sponsorships: (database.sponsorships[account.id] ?? []).length,
    business: Boolean(account.business),
    tags: tagsOf(database, account.id),
    duplicate: duplicateIds(database).has(account.id),
  }
}

// Everything about one member the operators may see.
export function memberDetail(database: Database, account: Account) {
  const received = account.role === "브랜드"
    ? database.requests.filter((item) => item.brandId === account.brandId)
    : database.offers.filter((item) => item.groupId === account.groupId)
  const sent = [...database.requests, ...database.offers].filter((item) => item.fromAccountId === account.id)
  const proposal = (item: (typeof sent)[number]) => ({
    id: item.id,
    partner: "groupName" in item ? item.groupName : item.brandName,
    event: "eventName" in item ? item.eventName : item.campaignName,
    status: statusOf(database, item),
    createdAt: item.createdAt,
  })
  return {
    ...memberRow(database, account),
    ...(account.contact ? { contact: account.contact } : {}),
    eventList: (database.events[account.id] ?? []).map(({ id, name, date, endDate, people }) => ({ id, name, date, endDate, people })),
    sentList: sent.map(proposal),
    receivedList: received.map(proposal),
    payments: paymentsOf(database)
      .filter((payment) => payment.accountId === account.id)
      .map(({ id, orderName, amount, status, paidAt, requestedAt }) => ({ id, orderName, amount, status, at: paidAt ?? requestedAt })),
    inquiries: database.inquiries.filter((item) => item.accountId === account.id).length,
    reportsAbout: database.reports.filter((item) => item.accountId === account.id).length,
    sessions: database.sessions.filter((session) => session.accountId === account.id).length,
    note: database.adminNotes?.[account.id] ?? null,
    businessNumber: account.business?.number ?? null,
    timeline: timeline(database, account),
    duplicates: duplicatesOf(database, account),
  }
}

// Every proposal, newest first: who to whom, about what, and where it stands.
export function proposalRows(database: Database) {
  const named = (id?: string) => database.accounts.find((account) => account.id === id)?.name
  return [
    ...database.requests.map((item) => ({
      id: item.id,
      kind: "request" as const,
      from: named(item.fromAccountId) ?? item.groupName,
      to: database.brands.find((brand) => brand.id === item.brandId)?.name ?? "",
      event: item.eventName,
      date: item.eventDate,
      status: statusOf(database, item),
      createdAt: item.createdAt,
      example: !item.fromAccountId,
    })),
    ...database.offers.map((item) => ({
      id: item.id,
      kind: "offer" as const,
      from: named(item.fromAccountId) ?? item.brandName,
      to: database.groups.find((group) => group.id === item.groupId)?.name ?? "",
      event: item.campaignName,
      date: item.campaignDate,
      status: statusOf(database, item),
      createdAt: item.createdAt,
      example: !item.fromAccountId,
    })),
  ]
    .map((row) => ({ ...row, confirmed: Boolean(database.agreements.find((item) => item.id === row.id)?.confirmed.brand && database.agreements.find((item) => item.id === row.id)?.confirmed.group) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
