import { randomUUID } from "node:crypto"

import { config } from "../config.js"
import type { Account, Database } from "../types.js"
import { prices, sell, shiftLaterPeriods } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { ensureMeasurement, parseCoupon } from "./measurements.js"
import { campaignUntil, growthIncludesCampaign, localUntil } from "./plan.js"
import { isDemoAccount } from "./reviews.js"

// Campus Local(사업 계획의 Local 요금제, 30일 79,000원): 30일씩 결제하고 이미 낸 일수
// 뒤에 이어 붙이며 자동으로 결제되지 않는다. 이용 기간에 상시 쿠폰 캠페인 하나를 행사
// 일정과 별개로 운영하고 월간 리포트를 본다. 끝나면 새 쿠폰만 멈추고, 이미 나간 쿠폰은
// 7일의 사용 기간까지 쓴다(lib/measurements.ts assertOpen). 판매는 `config.localOnSale`로
// 연다. 판매가 열리면 Growth에도 포함된다(`growthIncludesCampaign`).
//
// 환불은 약관대로 결제하고 7일 안이거나 아직 시작하지 않은 기간이면 전액이고, 그 뒤에는
// 내일부터 남은 날만큼 나눠 돌려주고 이용을 오늘로 끝낸다(`partialRefund`).
const refundWholeWithinMs = 7 * 24 * 60 * 60 * 1000

sell("local", {
  targetless: true,
  quote(database, account) {
    if (!config.localOnSale) throw new HttpError(404, "판매하지 않는 상품이에요.")
    if (account.role !== "브랜드") throw new HttpError(403, "Campus Local은 브랜드 계정만 쓸 수 있어요.")
    if (growthIncludesCampaign(database, account.id)) throw new HttpError(409, "Growth에 상시 쿠폰이 포함돼 있어 따로 결제하지 않아도 돼요.")
    return {
      amount: prices.local,
      orderName: localUntil(database, account.id) ? `Campus Local ${prices.localDays}일 연장` : `Campus Local ${prices.localDays}일`,
    }
  },
  fulfil(database, payment) {
    const until = localUntil(database, payment.accountId)
    const from = until ? addDays(until, 1) : todayInKorea()
    payment.periodEnd = addDays(from, prices.localDays - 1)
    payment.periodDays = prices.localDays
  },
  revoke(database, payment) {
    shiftLaterPeriods(database, payment, payment.periodDays ?? prices.localDays)
  },
  partialRefund(payment, now) {
    if (now.getTime() - Date.parse(payment.paidAt ?? payment.requestedAt) <= refundWholeWithinMs) return null
    const paidDays = payment.periodDays ?? prices.localDays
    const days = Math.round((Date.parse(payment.periodEnd!) - Date.parse(todayInKorea(now))) / (24 * 60 * 60 * 1000))
    if (days >= paidDays) return null
    if (days <= 0) throw new HttpError(409, "이용 기간이 끝나 돌려드릴 금액이 없어요.")
    return { amount: Math.round((payment.amount * days) / paidDays), days }
  },
})

// 캠페인을 열고 쿠폰을 새로 줄 수 있는지다. 데모 브랜드는 판매가 열리면 결제 없이 써 본다.
export const localActive = (database: Database, account: Account) =>
  campaignUntil(database, account.id) !== null || (config.localOnSale && isDemoAccount(database, account))

export function campaignOf(database: Database, accountId: string) {
  const event = database.localCampaigns?.[accountId]
  const measurement = event && database.measurements.find((item) => item.accountId === accountId && item.eventId === event.id)
  return event && measurement ? { event, measurement } : undefined
}

// 캠페인은 `events`에 없어 일정, 카탈로그, 제안, 알림에 나오지 않는다. 체크인과 직원
// 화면은 행사와 같은 코드를 탄다(eventOf가 여기서도 찾는다).
export function openCampaign(database: Database, account: Account, body: unknown) {
  if (database.localCampaigns?.[account.id]) throw new HttpError(409, "상시 쿠폰 캠페인은 계정마다 하나예요.")
  const coupon = parseCoupon(body)
  const event = {
    id: `local-${randomUUID()}`,
    name: coupon.store,
    date: todayInKorea(),
    people: "",
    types: [],
    status: "집행 예정" as const,
    createdAt: new Date().toISOString(),
  }
  ;(database.localCampaigns ??= {})[account.id] = event
  const { measurement } = ensureMeasurement(database, account.id, event)
  measurement.alwaysOn = true
  measurement.goals.coupon = coupon
  return measurement
}

const koreanMonth = /^\d{4}-(0[1-9]|1[0-2])$/
const percent = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0)

// 월간 기본 리포트다. 달에 일어난 스캔, 쿠폰 발급, 직원이 확인한 쿠폰 사용(방문과 같은
// 기록이다)만 센다. 패스는 7일 뒤에 지워지므로 월간 순 방문자는 알 수 없어 싣지 않고,
// 달을 넘어 쓴 쿠폰은 쓴 달에 세므로 비율은 100%에서 멈춘다.
export function monthlyReport(measurement: { monthly?: Record<string, { scans: number; coupons: number; visits: number }> }, month: string) {
  if (!koreanMonth.test(month)) throw new HttpError(400, "달을 YYYY-MM 형식으로 적어 주세요.")
  const counts = measurement.monthly?.[month] ?? { scans: 0, coupons: 0, visits: 0 }
  return {
    month,
    months: Object.keys(measurement.monthly ?? {}).sort().reverse(),
    ...counts,
    couponRate: percent(counts.coupons, counts.scans),
    visitRate: percent(counts.visits, counts.coupons),
  }
}
