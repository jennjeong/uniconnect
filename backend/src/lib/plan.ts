import { config } from "../config.js"
import { paymentsOf } from "./billing.js"
import { todayInKorea } from "./dates.js"
import type { Database, PaymentKind } from "../types.js"

// 브랜드가 Pro인지(lib/pro.ts가 판다). 카탈로그가 나머지를 불러오지 않고
// Pro 리스팅을 표시할 수 있도록 판매와 따로 둔다.

// 그 종류가 결제된 마지막 한국 날짜. 오늘이거나 그 뒤일 때만이다.
function paidUntil(database: Database, accountId: string, kind: PaymentKind) {
  const today = todayInKorea()
  const ends = paymentsOf(database)
    .filter((payment) => payment.accountId === accountId && payment.kind === kind && payment.status === "paid" && payment.periodEnd)
    .map((payment) => payment.periodEnd!)
    .filter((end) => end >= today)
    .sort()
  return ends.at(-1) ?? null
}

export const proUntil = (database: Database, accountId: string) => paidUntil(database, accountId, "pro")

export const isPro = (database: Database, accountId: string) => proUntil(database, accountId) !== null

// 계정의 상단 광고(lib/ads.ts가 판다)가 도는 마지막 한국 날짜. 오늘이거나
// 그 뒤일 때만이다. 카탈로그가 광고를 앞에 둘 수 있도록 여기에도 둔다.
export const adUntil = (database: Database, accountId: string) => paidUntil(database, accountId, "ad")

// Campus Local(lib/local.ts가 판다). 체크인이 캠페인이 열려 있는지 볼 수 있도록 여기에 둔다.
export const localUntil = (database: Database, accountId: string) => paidUntil(database, accountId, "local")

// 상시 쿠폰이 Growth에 포함되는지다. 약관과 화면이 함께 나가도록 Local 판매를 열 때 함께 켠다.
export const growthIncludesCampaign = (database: Database, accountId: string) => config.localOnSale && isPro(database, accountId)

// 상시 쿠폰 캠페인이 새 쿠폰을 주는 마지막 한국 날짜다. Local과 Growth 중 늦은 날이다.
export function campaignUntil(database: Database, accountId: string) {
  const local = localUntil(database, accountId)
  const growth = growthIncludesCampaign(database, accountId) ? proUntil(database, accountId) : null
  return local && growth ? (local > growth ? local : growth) : (local ?? growth)
}
