import { prices, sell, shiftLaterPeriods } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { adUntil } from "./plan.js"
import { findListing } from "./catalog.js"
import type { Account, Database } from "../types.js"

// 상단 광고: 계정의 리스팅이 상대편 카탈로그 맨 앞에 AD 마크와 함께 오르는
// 30일 단위 상품(lib/catalog.ts browse). 브랜드는 한 달에 prices.adBrand,
// 학생 단체는 prices.adGroup을 낸다. 광고가 도는 중에 다시 결제하면 그
// 뒤로 30일을 더하고 prices.adRenewalDiscount를 깎는다.

// 다음 30일의 비용: 역할별 가격에서, 광고가 도는 중이면 할인을 뺀 값.
export function adPrice(database: Database, account: Account) {
  const base = account.role === "브랜드" ? prices.adBrand : prices.adGroup
  const renewing = adUntil(database, account.id) !== null
  return { base, amount: renewing ? Math.round((base * (1 - prices.adRenewalDiscount)) / 100) * 100 : base, renewing }
}

// 페이지가 보여 주는 계정의 광고.
export function adOf(database: Database, account: Account) {
  const { base, amount, renewing } = adPrice(database, account)
  return { until: adUntil(database, account.id), price: base, next: amount, renewing, days: prices.adDays }
}

sell("ad", {
  targetless: true,
  quote(database, account) {
    if (!findListing(database, account)) throw new HttpError(409, "소개를 먼저 등록해야 광고할 수 있어요.")
    const { amount, renewing } = adPrice(database, account)
    return {
      amount,
      orderName: renewing ? `상단 광고 ${prices.adDays}일 연장 (10% 할인)` : `상단 광고 ${prices.adDays}일`,
    }
  },
  // 결제됨: 오늘부터, 또는 이미 낸 일수 뒤로 30일 더한다.
  fulfil(database, payment) {
    const until = adUntil(database, payment.accountId)
    const from = until ? addDays(until, 1) : todayInKorea()
    payment.periodEnd = addDays(from, prices.adDays - 1)
  },
  // 환불됨: 그 뒤에 결제한 달이 그 일수만큼 앞당겨진다.
  revoke(database, payment) {
    shiftLaterPeriods(database, payment, prices.adDays)
  },
})
