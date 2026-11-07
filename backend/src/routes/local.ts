import { Router } from "express"
import type { Request } from "express"

import { config } from "../config.js"
import { prices, withVat } from "../lib/billing.js"
import { todayInKorea } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { campaignOf, localActive, monthlyReport, openCampaign } from "../lib/local.js"
import { couponDays, parseCoupon, pinMissesToday, rotatePin } from "../lib/measurements.js"
import { campaignUntil, growthIncludesCampaign } from "../lib/plan.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database, Measurement } from "../types.js"

// 브랜드의 Campus Local이다(lib/local.ts). 결제는 다른 상품처럼 `POST /api/billing/orders`로 한다.
export const localRouter = Router()

function brandOnly(req: Request) {
  const account = requireAccount(req)
  if (account.role !== "브랜드") throw new HttpError(403, "Campus Local은 브랜드 계정만 쓸 수 있어요.")
  return account
}

function ownCampaign(database: Database, account: Account) {
  const campaign = campaignOf(database, account.id)
  if (!campaign) throw new HttpError(404, "상시 쿠폰 캠페인이 없어요.")
  return campaign
}

const campaignView = (database: Database, account: Account, measurement: Measurement) => ({
  code: measurement.code,
  ...measurement.goals.coupon,
  staffPin: measurement.staffPin,
  pinMissesToday: pinMissesToday(measurement),
  // 새 쿠폰을 주고 있는지다. 이용 기간이 끝나면 false이고, 나간 쿠폰은 사용 기간까지 쓴다.
  open: localActive(database, account),
  couponDays,
  totals: { scans: measurement.metrics.scans, coupons: measurement.metrics.coupons, visits: measurement.metrics.visits },
})

localRouter.get("/", (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  const campaign = campaignOf(database, account.id)
  res.json({
    onSale: config.localOnSale,
    price: prices.local,
    priceWithVat: withVat(prices.local),
    days: prices.localDays,
    until: campaignUntil(database, account.id),
    includedInGrowth: growthIncludesCampaign(database, account.id),
    campaign: campaign ? campaignView(database, account, campaign.measurement) : null,
  })
})

localRouter.post("/campaign", async (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  if (!localActive(database, account)) throw new HttpError(402, "Campus Local을 결제하면 상시 쿠폰 캠페인을 열 수 있어요.")
  const measurement = openCampaign(database, account, req.body)
  await saveDatabase()
  res.status(201).json({ campaign: campaignView(database, account, measurement) })
})

// 매장과 혜택을 고친다. 참여자에게는 다음에 열 때부터 보인다.
localRouter.put("/campaign", async (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  const { event, measurement } = ownCampaign(database, account)
  measurement.goals.coupon = parseCoupon(req.body)
  event.name = measurement.goals.coupon.store
  await saveDatabase()
  res.json({ campaign: campaignView(database, account, measurement) })
})

// 유출이 의심될 때 직원 PIN을 바꾼다. 지금 PIN은 바로 막힌다.
localRouter.post("/campaign/pin", async (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  const { measurement } = ownCampaign(database, account)
  rotatePin(measurement, undefined, "brand")
  await saveDatabase()
  res.json({ campaign: campaignView(database, account, measurement) })
})

// 이용 기간이 끝나도 지난 숫자는 자기 것이라 읽을 수 있다.
localRouter.get("/report", (req, res) => {
  const account = brandOnly(req)
  const { measurement } = ownCampaign(getDatabase(), account)
  res.json(monthlyReport(measurement, text(req.query.month) || todayInKorea().slice(0, 7)))
})
