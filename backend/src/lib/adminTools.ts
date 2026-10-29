import { randomUUID } from "node:crypto"

import { config } from "../config.js"
import { createSeed } from "../data/seed.js"
import { cardReady, paymentsOf, testMode } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { proUntil } from "./plan.js"
import type { Account, AdminAction, AdminLogEntry, Announcement, Database, Payment } from "../types.js"

// The console keeps the latest entries only.
export const adminLogLimit = 500

// Notes what an operator did, by id only.
export function logAdmin(
  database: Database,
  action: AdminAction,
  target: AdminLogEntry["target"],
  detail?: string,
  now = new Date(),
) {
  const log = (database.adminLog ??= [])
  log.push({ id: randomUUID(), at: now.toISOString(), action, target, ...(detail ? { detail } : {}) })
  if (log.length > adminLogLimit) log.splice(0, log.length - adminLogLimit)
}

// The log newest first, each target with the name it has now (a member
// that left shows without one).
export function adminLogRows(database: Database) {
  const label = (target: AdminLogEntry["target"]) => {
    if (target.kind === "account") return database.accounts.find((account) => account.id === target.id)?.name
    if (target.kind === "payment") return database.payments?.find((payment) => payment.id === target.id)?.orderName
    if (target.kind === "inquiry") return database.inquiries.find((inquiry) => inquiry.id === target.id)?.category
    if (target.kind === "announcement") return database.announcements?.find((item) => item.id === target.id)?.text.slice(0, 40)
    return undefined
  }
  return [...(database.adminLog ?? [])].reverse().map((entry) => ({ ...entry, label: label(entry.target) ?? null }))
}

// Drops what the operators kept about a member that leaves: its note,
// tags, log entries and the handling of questions it asked.
export function forgetAdminRecords(database: Database, accountId: string) {
  if (database.adminNotes) delete database.adminNotes[accountId]
  if (database.adminTags) delete database.adminTags[accountId]
  if (database.inquiryHandling) {
    const asked = new Set(database.inquiries.map((inquiry) => inquiry.id))
    for (const id of Object.keys(database.inquiryHandling)) if (!asked.has(id)) delete database.inquiryHandling[id]
  }
  if (database.adminLog) {
    database.adminLog = database.adminLog.filter((entry) => !(entry.target.kind === "account" && entry.target.id === accountId))
  }
}

export const noteLimit = 1000

// Whether a notice shows today: not taken down, between its first and
// last days.
export const isLive = (item: Announcement, today = todayInKorea()) =>
  !item.endedAt && (!item.from || item.from <= today) && (!item.until || item.until >= today)

// The notices one viewer sees: everyone's, and its side's once logged in.
export function liveAnnouncements(database: Database, account?: Account) {
  return (database.announcements ?? [])
    .filter((item) => isLive(item))
    .filter((item) => item.audience === "all" || item.audience === account?.role)
    .map(({ id, text, tone }) => ({ id, text, tone }))
}

// Which services this copy of the API is set up for, without any of their
// values: what the operators would otherwise check in Vercel's settings.
export function serviceHealth() {
  const on = (value: unknown) => Boolean(value)
  return {
    storage: config.databaseUrl ? ("postgres" as const) : ("file" as const),
    payments: cardReady() ? (testMode() ? ("test" as const) : ("live" as const)) : ("off" as const),
    checks: [
      { key: "mail", on: on(config.resendApiKey && config.mailFrom) },
      { key: "siteUrl", on: on(config.siteUrl) },
      { key: "operatorEmail", on: on(config.operatorEmail) },
      { key: "cron", on: on(config.cronSecret) },
      { key: "kakaoLocal", on: on(config.kakaoRestApiKey) },
      { key: "kakaoLogin", on: on(config.kakaoClientId) },
      { key: "naverLogin", on: on(config.naverClientId && config.naverClientSecret) },
      { key: "geocoder", on: on(config.nominatimUrl) },
      { key: "nts", on: on(config.ntsServiceKey) },
    ],
    vercel: Boolean(process.env.VERCEL),
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  }
}

// A member's tags, cleaned: trimmed, short, no repeats, at most ten.
export function cleanTags(values: unknown) {
  const list = Array.isArray(values) ? values : []
  return [...new Set(list.map((value) => String(value).trim().slice(0, 20)).filter(Boolean))].slice(0, 10)
}

export const tagsOf = (database: Database, accountId: string) => database.adminTags?.[accountId] ?? []

// Gives a member Campus Partners for some days without a charge: a paid
// zero-won order marked as a grant, after any time it already has.
export function grantPartners(database: Database, account: Account, days: number, now = new Date()) {
  const until = proUntil(database, account.id)
  const from = until ? addDays(until, 1) : todayInKorea(now)
  const payment: Payment = {
    id: `grant-${randomUUID()}`,
    accountId: account.id,
    accountName: account.name,
    kind: "pro",
    targetId: "",
    orderName: `캠퍼스 파트너스 ${days}일 (운영자 부여)`,
    amount: 0,
    status: "paid",
    method: "grant",
    requestedAt: now.toISOString(),
    paidAt: now.toISOString(),
    periodEnd: addDays(from, days - 1),
  } as Payment
  ;(database.payments ??= []).push(payment)
  return payment
}

// Puts the example data back as the seed has it: the demo accounts' own
// records and the seed catalog, proposals, conversations, reviews and posts.
// Members' data stays as it is, and the demo accounts keep their sessions.
export async function resetExamples(database: Database) {
  const fresh = await createSeed()
  const demo = new Set(Object.values(fresh.demoAccountIds))
  const exampleListings = new Set([...fresh.brands, ...fresh.groups].map((listing) => listing.id))
  const freshAccounts = new Map(fresh.accounts.map((account) => [account.id, account]))
  database.accounts = database.accounts.filter((account) => !demo.has(account.id)).concat(fresh.accounts.map((account) => {
    const kept = database.accounts.find((item) => item.id === account.id)
    return kept ? { ...freshAccounts.get(account.id)!, passwordHash: kept.passwordHash } : account
  }))
  database.demoAccountIds = fresh.demoAccountIds
  database.brands = database.brands.filter((listing) => !exampleListings.has(listing.id)).concat(fresh.brands)
  database.groups = database.groups.filter((listing) => !exampleListings.has(listing.id)).concat(fresh.groups)
  const example = (item: { fromAccountId?: string }) => !item.fromAccountId || demo.has(item.fromAccountId)
  database.requests = database.requests.filter((item) => !example(item) && !exampleListings.has(item.brandId)).concat(fresh.requests)
  database.offers = database.offers.filter((item) => !example(item) && !exampleListings.has(item.groupId)).concat(fresh.offers)
  const proposals = new Set([...database.requests, ...database.offers].map((item) => item.id))
  database.agreements = database.agreements.filter((item) => proposals.has(item.id))
  database.conversations = database.conversations
    .filter((item) => !exampleListings.has(item.brandId) && !exampleListings.has(item.groupId))
    .concat(fresh.conversations)
  database.reviews = database.reviews.filter((item) => proposals.has(item.proposalId) && !exampleListings.has(item.aboutId)).concat(fresh.reviews)
  database.posts = database.posts.filter((item) => !demo.has(item.accountId)).concat(fresh.posts)
  database.measurements = database.measurements.filter((item) => !demo.has(item.accountId)).concat(fresh.measurements)
  for (const id of demo) {
    database.events[id] = fresh.events[id] ?? []
    database.proposals[id] = fresh.proposals[id] ?? []
    if (fresh.sponsorships[id]) database.sponsorships[id] = fresh.sponsorships[id]
    else delete database.sponsorships[id]
    delete database.saved[id]
    delete database.blocks[id]
  }
  database.inquiries = database.inquiries.filter((item) => !demo.has(item.accountId))
  database.invites = database.invites.filter((item) => !demo.has(item.accountId))
  database.payments = paymentsOf(database).filter((item) => !demo.has(item.accountId))
}

// A search as the console counts it: lower case, one space between words,
// two to thirty characters.
export function searchTerm(value: unknown) {
  const term = String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim()
  return term.length >= 2 && term.length <= 30 ? term : null
}

// Counts a search, keeping the 300 most searched.
export function countSearch(database: Database, term: string) {
  const terms = (database.searchTerms ??= {})
  terms[term] = (terms[term] ?? 0) + 1
  const entries = Object.entries(terms)
  if (entries.length > 300) {
    database.searchTerms = Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, 250))
  }
}

// The site's switches as the public sees them.
export function siteState(database: Database) {
  const maintenance = database.settings?.maintenance
  return {
    maintenance: maintenance?.on ? { message: maintenance.message ?? "" } : null,
    signupsClosed: Boolean(maintenance?.blockSignups),
  }
}

// Notes a run of the date reminders, keeping the latest 30.
export function noteCronRun(database: Database, sent: number, now = new Date()) {
  const runs = (database.cronRuns ??= [])
  runs.push({ at: now.toISOString(), sent })
  if (runs.length > 30) runs.splice(0, runs.length - 30)
}
