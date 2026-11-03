import { prices, sell, shiftLaterPeriods } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { isPro, proUntil } from "./plan.js"
import { reportAccess } from "./premiumReport.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Database } from "../types.js"

// 캠퍼스 파트너스 (the business plan's brand subscription, 300,000 KRW a
// month, freemium; `pro` in the data): 30 days paid at a time, added on
// after the days already paid. Partners send proposals without a monthly
// limit, read every detailed report and their 캠퍼스 포트폴리오
// (lib/portfolio.ts), ask the operators to find partners for them twice a
// month (1:1 섭외 요청), and show a PARTNERS mark on their listing. The free plan sends up to
// `freeOffersPerMonth` proposals a calendar month (Korean).
export const freeOffersPerMonth = 5

// 1:1 섭외 요청s a partner may send a Korean month, kept as questions to
// the operators under their own kind.
export const partnerRequestsPerMonth = 2
export const partnerRequestCategory = "파트너스 섭외 요청"

const koreanMonth = (at: string) => new Date(new Date(at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)

// Proposals the brand sent this month.
export function offersThisMonth(database: Database, accountId: string) {
  const month = todayInKorea().slice(0, 7)
  return database.offers.filter((offer) => offer.fromAccountId === accountId && koreanMonth(offer.createdAt) === month).length
}

// Stops a free brand past this month's proposals (never the demo brand).
export function assertCanOffer(database: Database, account: Account) {
  if (account.role !== "브랜드" || isDemoAccount(database, account) || isPro(database, account.id)) return
  if (offersThisMonth(database, account.id) >= freeOffersPerMonth) {
    throw new HttpError(402, `무료 요금제는 한 달에 협찬 제안 ${freeOffersPerMonth}건까지예요. 캠퍼스 파트너스로 바꾸면 제한 없이 보낼 수 있어요.`)
  }
}

// The partner's 1:1 섭외 요청s this Korean month.
export const partnerRequestsThisMonth = (database: Database, accountId: string) =>
  database.inquiries.filter(
    (inquiry) =>
      inquiry.accountId === accountId &&
      inquiry.category === partnerRequestCategory &&
      koreanMonth(inquiry.createdAt) === todayInKorea().slice(0, 7),
  ).length

// The account's plan as its pages show it.
export function planOf(database: Database, account: Account) {
  const until = proUntil(database, account.id)
  return {
    pro: until !== null,
    until,
    offersThisMonth: offersThisMonth(database, account.id),
    freeOffers: freeOffersPerMonth,
    partnerRequestsLeft: until ? Math.max(0, partnerRequestsPerMonth - partnerRequestsThisMonth(database, account.id)) : 0,
  }
}

sell("pro", {
  targetless: true,
  quote(database, account) {
    if (account.role !== "브랜드") throw new HttpError(403, "캠퍼스 파트너스는 브랜드 계정만 쓸 수 있어요.")
    const until = proUntil(database, account.id)
    return {
      amount: prices.pro,
      orderName: until ? `캠퍼스 파트너스 ${prices.proDays}일 연장` : `캠퍼스 파트너스 ${prices.proDays}일`,
    }
  },
  // Paid: 30 more days, from tomorrow or after the days already paid.
  fulfil(database, payment) {
    const until = proUntil(database, payment.accountId)
    const from = until ? addDays(until, 1) : todayInKorea()
    payment.periodEnd = addDays(from, prices.proDays - 1)
  },
  // Refunded: the months paid after it move back by its days.
  revoke(database, payment) {
    shiftLaterPeriods(database, payment, prices.proDays)
  },
})

reportAccess.push((database, account) => isPro(database, account.id))

