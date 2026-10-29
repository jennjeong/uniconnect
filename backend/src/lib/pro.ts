import { prices, sell } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { isPro, proUntil } from "./plan.js"
import { reportAccess } from "./premiumReport.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Database } from "../types.js"

// 프로 (the business plan's brand subscription, 200,000 KRW a month,
// freemium): 30 days paid at a time, added on after the days already paid.
// Pro brands send proposals without a monthly limit, read every detailed
// report, and show a PRO mark on their listing. The free plan sends up to
// `freeOffersPerMonth` proposals a calendar month (Korean).
export const freeOffersPerMonth = 5

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
    throw new HttpError(402, `무료 요금제는 한 달에 협찬 제안 ${freeOffersPerMonth}건까지예요. 프로로 바꾸면 제한 없이 보낼 수 있어요.`)
  }
}

// The account's plan as its pages show it.
export function planOf(database: Database, account: Account) {
  const until = proUntil(database, account.id)
  return {
    pro: until !== null,
    until,
    offersThisMonth: offersThisMonth(database, account.id),
    freeOffers: freeOffersPerMonth,
  }
}

sell("pro", {
  quote(database, account) {
    if (account.role !== "브랜드") throw new HttpError(403, "프로는 브랜드 계정만 쓸 수 있어요.")
    const until = proUntil(database, account.id)
    return {
      amount: prices.pro,
      orderName: until ? `uniconnect 프로 ${prices.proDays}일 연장` : `uniconnect 프로 ${prices.proDays}일`,
    }
  },
  // Paid: 30 more days, from tomorrow or after the days already paid.
  fulfil(database, payment) {
    const until = proUntil(database, payment.accountId)
    const from = until ? addDays(until, 1) : todayInKorea()
    payment.periodEnd = addDays(from, prices.proDays - 1)
  },
})

reportAccess.push((database, account) => isPro(database, account.id))
