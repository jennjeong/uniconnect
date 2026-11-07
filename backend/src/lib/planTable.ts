import { config } from "../config.js"
import { prices, withVat } from "./billing.js"
import { freeOffersPerMonth, partnerRequestsPerMonth } from "./pro.js"

// 공개 요금제 표(`GET /api/billing/plans`). 로그인 전에도 읽으므로 계정 값은
// 없고, 표시 이름과 설명은 화면이 번역해 쓴다. 판매 중인 값만 싣는다. Local은
// 판매를 열기 전까지(`config.localOnSale`) 가격 없이 준비 중으로 둔다(docs/LEGAL.md).
type PlanRow = {
  id: "free" | "local" | "growth"
  // open: 쓸 수 있다. soon: 준비 중이다.
  status: "open" | "soon"
  price: number | null
  priceWithVat: number | null
  days: number | null
  // 결제할 때 `POST /api/billing/orders`에 보내는 kind. 결제가 없으면 null이다.
  orderKind: "pro" | "local" | null
  // 값이 null이면 그 항목의 제한이 없다. limits가 null이면 아직 정하지 않았다.
  limits: { offersPerMonth: number | null; partnerRequestsPerMonth: number; reportsIncluded: boolean; alwaysOnCoupons: boolean } | null
}

const unpriced = { price: null, priceWithVat: null, days: null, orderKind: null, limits: null }

export const planTable = () => ({
  vatRate: prices.vatRate,
  feeRate: prices.feeRate,
  reportPrice: prices.report,
  plans: [
    {
      id: "free",
      status: "open",
      price: 0,
      priceWithVat: 0,
      days: null,
      orderKind: null,
      limits: { offersPerMonth: freeOffersPerMonth, partnerRequestsPerMonth: 0, reportsIncluded: false, alwaysOnCoupons: false },
    },
    config.localOnSale
      ? {
          id: "local",
          status: "open",
          price: prices.local,
          priceWithVat: withVat(prices.local),
          days: prices.localDays,
          orderKind: "local",
          limits: { offersPerMonth: freeOffersPerMonth, partnerRequestsPerMonth: 0, reportsIncluded: false, alwaysOnCoupons: true },
        }
      : { id: "local", status: "soon", ...unpriced },
    {
      // 데이터 이름은 `pro` 그대로다.
      id: "growth",
      status: "open",
      price: prices.pro,
      priceWithVat: withVat(prices.pro),
      days: prices.proDays,
      orderKind: "pro",
      limits: { offersPerMonth: null, partnerRequestsPerMonth, reportsIncluded: true, alwaysOnCoupons: config.localOnSale },
    },
  ] satisfies PlanRow[],
})
