import { prices, sell } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { adUntil } from "./plan.js"
import { findListing } from "./catalog.js"
import type { Account, Database } from "../types.js"

// 상단 광고: 30 days at a time when an account's listing comes first on the
// other side's catalog with an AD mark (lib/catalog.ts browse). A brand pays
// prices.adBrand a month, a student group prices.adGroup. Paying again
// while an ad still runs adds 30 days after it and takes
// prices.adRenewalDiscount off.

// What the next 30 days cost the account: the role's price, less the
// discount while an ad still runs.
export function adPrice(database: Database, account: Account) {
  const base = account.role === "브랜드" ? prices.adBrand : prices.adGroup
  const renewing = adUntil(database, account.id) !== null
  return { base, amount: renewing ? Math.round((base * (1 - prices.adRenewalDiscount)) / 100) * 100 : base, renewing }
}

// The account's ad as its pages show it.
export function adOf(database: Database, account: Account) {
  const { base, amount, renewing } = adPrice(database, account)
  return { until: adUntil(database, account.id), price: base, next: amount, renewing, days: prices.adDays }
}

sell("ad", {
  quote(database, account) {
    if (!findListing(database, account)) throw new HttpError(409, "소개를 먼저 등록해야 광고할 수 있어요.")
    const { amount, renewing } = adPrice(database, account)
    return {
      amount,
      orderName: renewing ? `상단 광고 ${prices.adDays}일 연장 (10% 할인)` : `상단 광고 ${prices.adDays}일`,
    }
  },
  // Paid: 30 more days, from today or after the days already paid.
  fulfil(database, payment) {
    const until = adUntil(database, payment.accountId)
    const from = until ? addDays(until, 1) : todayInKorea()
    payment.periodEnd = addDays(from, prices.adDays - 1)
  },
})
