import { paymentsOf } from "./billing.js"
import { todayInKorea } from "./dates.js"
import type { Database } from "../types.js"

// Whether a brand has Pro (lib/pro.ts sells it), apart from its sale so the
// catalog can mark Pro listings without loading the rest.

// The last Korean day Pro is paid for, while it is today or later.
export function proUntil(database: Database, accountId: string) {
  const today = todayInKorea()
  const ends = paymentsOf(database)
    .filter((payment) => payment.accountId === accountId && payment.kind === "pro" && payment.status === "paid" && payment.periodEnd)
    .map((payment) => payment.periodEnd!)
    .filter((end) => end >= today)
    .sort()
  return ends.at(-1) ?? null
}

export const isPro = (database: Database, accountId: string) => proUntil(database, accountId) !== null

// The last Korean day an account's 상단 광고 (lib/ads.ts sells it) runs,
// while it is today or later; here too so the catalog can put ads first.
export function adUntil(database: Database, accountId: string) {
  const today = todayInKorea()
  const ends = paymentsOf(database)
    .filter((payment) => payment.accountId === accountId && payment.kind === "ad" && payment.status === "paid" && payment.periodEnd)
    .map((payment) => payment.periodEnd!)
    .filter((end) => end >= today)
    .sort()
  return ends.at(-1) ?? null
}
