import { randomUUID } from "node:crypto"

import { config } from "../config.js"
import { cardReady, testMode } from "./billing.js"
import { todayInKorea } from "./dates.js"
import type { Account, AdminAction, AdminLogEntry, Announcement, Database } from "../types.js"

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

// Drops what the operators kept about a member that leaves.
export function forgetAdminRecords(database: Database, accountId: string) {
  if (database.adminNotes) delete database.adminNotes[accountId]
  if (database.adminLog) {
    database.adminLog = database.adminLog.filter((entry) => !(entry.target.kind === "account" && entry.target.id === accountId))
  }
}

export const noteLimit = 1000

// Whether a notice shows today: not taken down, not past its last day.
export const isLive = (item: Announcement, today = todayInKorea()) => !item.endedAt && (!item.until || item.until >= today)

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
