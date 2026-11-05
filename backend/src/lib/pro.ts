import { prices, sell, shiftLaterPeriods } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { isPro, proUntil } from "./plan.js"
import { reportAccess } from "./premiumReport.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Database } from "../types.js"

// 캠퍼스 파트너스(사업 계획의 브랜드 구독, 월 300,000원, 프리미엄;
// 데이터의 `pro`): 30일씩 결제하고 이미 낸 일수 뒤에 이어 붙인다. 파트너스는
// 월 한도 없이 제안을 보내고, 모든 상세 리포트와 캠퍼스 포트폴리오
// (lib/portfolio.ts)를 읽고, 한 달에 두 번 운영자에게 파트너를 찾아 달라고
// 부탁하며(1:1 섭외 요청), 리스팅에 PARTNERS 마크가 붙는다. 무료
// 플랜은 달력 달(한국 기준)마다 `freeOffersPerMonth`건까지 제안을 보낸다.
export const freeOffersPerMonth = 5

// 파트너가 한국 달마다 보낼 수 있는 1:1 섭외 요청. 운영자에게 가는 문의로
// 자기 종류 아래 쌓인다.
export const partnerRequestsPerMonth = 2
export const partnerRequestCategory = "파트너스 섭외 요청"

const koreanMonth = (at: string) => new Date(new Date(at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)

// 브랜드가 이번 달에 보낸 제안.
export function offersThisMonth(database: Database, accountId: string) {
  const month = todayInKorea().slice(0, 7)
  return database.offers.filter((offer) => offer.fromAccountId === accountId && koreanMonth(offer.createdAt) === month).length
}

// 이번 달 제안을 다 쓴 무료 브랜드를 막는다(데모 브랜드는 제외).
export function assertCanOffer(database: Database, account: Account) {
  if (account.role !== "브랜드" || isDemoAccount(database, account) || isPro(database, account.id)) return
  if (offersThisMonth(database, account.id) >= freeOffersPerMonth) {
    throw new HttpError(402, `무료 요금제는 한 달에 협찬 제안 ${freeOffersPerMonth}건까지예요. 캠퍼스 파트너스로 바꾸면 제한 없이 보낼 수 있어요.`)
  }
}

// 파트너가 이번 한국 달에 보낸 1:1 섭외 요청.
export const partnerRequestsThisMonth = (database: Database, accountId: string) =>
  database.inquiries.filter(
    (inquiry) =>
      inquiry.accountId === accountId &&
      inquiry.category === partnerRequestCategory &&
      koreanMonth(inquiry.createdAt) === todayInKorea().slice(0, 7),
  ).length

// 페이지가 보여 주는 계정의 플랜.
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
  // 결제됨: 내일부터, 또는 이미 낸 일수 뒤로 30일 더한다.
  fulfil(database, payment) {
    const until = proUntil(database, payment.accountId)
    const from = until ? addDays(until, 1) : todayInKorea()
    payment.periodEnd = addDays(from, prices.proDays - 1)
    payment.periodDays = prices.proDays
  },
  // 환불됨: 그 뒤의 기간이 환불한 기간의 일수만큼 앞당겨진다. 운영자가 준 기간은
  // 30일이 아닐 수 있다.
  revoke(database, payment) {
    shiftLaterPeriods(database, payment, payment.periodDays ?? prices.proDays)
  },
})

reportAccess.push((database, account) => isPro(database, account.id))

