import { randomBytes } from "node:crypto"

import { config } from "../config.js"
import type { Account, Database, Payment, PaymentKind } from "../types.js"
import { addDays } from "./dates.js"
import { HttpError } from "./errors.js"

// 사업 계획의 수익 모델(표 9)을 부가세 전 가격으로 둔 것이다. 부가세는
// 주문을 만들 때 위에 더한다(vatOf). 브랜드가 내고 학생 단체는 자기 광고만
// 낸다.
export const prices = {
  // 협찬 가치(현금과 현물)의 일부. 양쪽이 확인할 때 낸다.
  feeRate: 0.15,
  // 협찬 하나의 상세 리포트.
  report: 50_000,
  // Growth (이전 이름 캠퍼스 파트너스, 데이터 이름 `pro`), 30일.
  pro: 249_000,
  proDays: 30,
  // Campus Local (lib/local.ts), 30일.
  local: 79_000,
  localDays: 30,
  // 상단 광고 (lib/ads.ts) 30일. 브랜드는 학생 단체 카탈로그에, 단체는
  // 브랜드 카탈로그에 낸다. 끝나기 전에 연장하면 10% 깎아 준다.
  adBrand: 99_000,
  adGroup: 10_000,
  adDays: 30,
  adRenewalDiscount: 0.1,
  // 부가세. 결제할 때 모든 가격에 더한다.
  vatRate: 0.1,
} as const

// 가격에 붙는 부가세. 원 단위 정수.
export const vatOf = (supply: number) => Math.round(supply * prices.vatRate)

// 부가세를 더한 가격.
export const withVat = (supply: number) => supply + vatOf(supply)

// 결제한 금액 중 가격이 차지한 부분. 부가세를 위에 더하기 전의 결제는
// 공급가액이 없고 결제 금액 전체가 가격이었다.
export const supplyOf = (payment: Payment) => payment.supply ?? payment.amount

// Toss Payments 결제창은 클라이언트 키를 쓰고, 서버는 비밀 키로 결제마다
// 확인한다. 비밀 키는 서버 밖으로 나가지 않는다. 둘 다 없으면 브랜드는
// 계좌이체로 결제를 요청할 수 있고 운영자가 확인한다.
export const cardReady = () => Boolean(config.tossClientKey && config.tossSecretKey)

// 테스트 키(test_…)는 돈이 오가지 않으므로 공용 데모 계정도 결제해서
// 데모에서 전체 흐름을 보여 줄 수 있다. 실제 키에서는 그럴 수 없다.
export const testMode = () => cardReady() && (config.tossSecretKey ?? "").startsWith("test_")

const tossApi = "https://api.tosspayments.com/v1/payments"
// Toss가 승인에 실패했거나 답하지 않았을 때의 응답.
export const tossUnsure ="결제 확인이 늦어지고 있어요. 결제됐다면 잠시 후 결제 내역에 반영돼요."
// 환불 요청에 Toss가 실패했거나 답하지 않았을 때의 답.
export const refundUnsure = "환불 확인이 늦어지고 있어요. 몇 분 뒤에 결제 내역을 확인해 주세요."
// Toss가 이미 환불했다고 답하는 코드. 앞선 요청이 처리된 것이므로 성공과 같다.
const alreadyRefunded = new Set(["ALREADY_CANCELED_PAYMENT", "ALREADY_REFUND_PAYMENT"])
const tossAuth = () => `Basic ${Buffer.from(`${config.tossSecretKey ?? ""}:`).toString("base64")}`

export type TossPayment = { status?: string; totalAmount?: number; balanceAmount?: number; orderId?: string; receipt?: { url?: string } | null; approvedAt?: string }

// Toss Payments 호출. 테스트에서 바꿔 쓴다.
export const toss = {
  // 결제창이 승인한 결제를 확정한다. 10분 안에, 서버가 정한 금액으로 한다.
  // 주문 id가 Idempotency-Key이므로 같은 주문을 다시 요청하면 첫 승인 결과가
  // 돌아오고 두 번 청구되지 않는다. Toss가 거절하면 402, Toss가 실패하면(5xx)
  // 502이며, 502 뒤에는 카드가 청구됐을 수도 아닐 수도 있다.
  async confirm(paymentKey: string, orderId: string, amount: number): Promise<TossPayment> {
    const response = await fetch(`${tossApi}/confirm`, {
      method: "POST",
      headers: { Authorization: tossAuth(), "Content-Type": "application/json", "Idempotency-Key": orderId },
      body: JSON.stringify({ paymentKey, orderId, amount }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await response.json().catch(() => null)) as (TossPayment & { message?: string }) | null
    if (!response.ok || !body) {
      console.error(`[billing] confirm ${response.status}: ${body?.message ?? ""}`)
      if (response.status >= 500 || (response.ok && !body)) throw new HttpError(502, tossUnsure)
      throw new HttpError(402, body?.message ? `결제를 승인하지 못했어요. ${body.message}` : "결제를 승인하지 못했어요. 다시 시도해 주세요.")
    }
    return body
  },
  // Toss Payments에 지금 있는 결제. 그 키의 결제가 없으면 undefined다.
  async lookup(paymentKey: string): Promise<TossPayment | undefined> {
    const response = await fetch(`${tossApi}/${encodeURIComponent(paymentKey)}`, {
      headers: { Authorization: tossAuth() },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 404) return undefined
    const body = (await response.json().catch(() => null)) as (TossPayment & { message?: string }) | null
    if (!response.ok || !body) throw new Error(`Toss lookup ${response.status}: ${body?.message ?? ""}`)
    return body
  },
  // 카드 결제를 환불한다. 금액이 없으면 전액이다. 멱등키가 같으면 같은 요청으로
  // 처리되고, 이미 환불된 결제는 성공으로 본다. 다만 일부만 돌려주려던 결제가 이미
  // 환불돼 있으면 얼마가 나갔는지 모르니 502로 두고 `lookup`으로 정리한다. Toss가
  // 거절하면 409(환불되지 않았다), Toss가 실패하거나 앞선 요청을 처리 중이면
  // 502(환불됐는지 아직 모른다)다.
  async cancel(paymentKey: string, reason: string, idempotencyKey: string, cancelAmount?: number) {
    const response = await fetch(`${tossApi}/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      headers: { Authorization: tossAuth(), "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ cancelReason: reason.slice(0, 200), ...(cancelAmount === undefined ? {} : { cancelAmount }) }),
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) return
    const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null
    if (alreadyRefunded.has(body?.code ?? "")) {
      if (cancelAmount === undefined) return
      throw new HttpError(502, refundUnsure)
    }
    console.error(`[billing] cancel ${response.status}: ${body?.code ?? ""} ${body?.message ?? ""}`)
    if (response.status >= 500 || response.status === 409 || response.status === 429) throw new HttpError(502, refundUnsure)
    throw new HttpError(409, body?.message ? `환불하지 못했어요. ${body.message}` : "환불하지 못했어요. 다시 시도해 주세요.")
  },
}

// 종류마다 부가세 전 가격과 계정 및 대상에 붙는 이름, 그리고 결제하면
// 일어나는 일을 둔다. 이를 파는 기능이 등록한다
// (lib/fees.ts, lib/premiumReport.ts, lib/pro.ts).
type Product = {
  quote: (database: Database, account: Account, targetId: string) => { amount: number; orderName: string }
  // 계정 자체(Pro, 광고)를 위해 사며 계정이 가진 무엇을 위한 것이 아니다.
  // 보낸 대상이 무엇이든 대기 중인 주문은 하나만 둔다.
  targetless?: true
  fulfil?: (database: Database, payment: Payment) => void
  // 결제가 환불되면 `fulfil`을 되돌린다.
  revoke?: (database: Database, payment: Payment) => void
  // 지금 환불하면 일부만 돌려주는 상품의 금액과 돌려받는 일수다. null이면 전액이다.
  partialRefund?: (payment: Payment, now: Date) => PartialRefund | null
  // 회원이 결제 내역에서 직접 환불할 수 있다(routes/billing.ts).
  memberRefund?: true
}

export type PartialRefund = { amount: number; days: number }

const products = new Map<PaymentKind, Product>()

export function sell(kind: PaymentKind, product: Product) {
  products.set(kind, product)
}

export function productOf(kind: string) {
  const product = products.get(kind as PaymentKind)
  if (!product) throw new HttpError(404, "판매하지 않는 상품이에요.")
  return product
}

export const paymentsOf = (database: Database) => (database.payments ??= [])

// 대상에 대한 계정의 결제 완료된 결제. 있으면 돌려준다.
export const paidFor = (database: Database, accountId: string, kind: PaymentKind, targetId: string) =>
  paymentsOf(database).find(
    (payment) => payment.accountId === accountId && payment.kind === kind && payment.targetId === targetId && payment.status === "paid",
  )

// 계정의 주문. 같은 건의 대기 중인 주문이 있으면 그것을 오늘 가격과
// 부가세로 맞추고 없으면 새로 만든다.
export function orderFor(database: Database, account: Account, kind: string, requested: string) {
  const product = productOf(kind)
  const targetId = product.targetless ? "" : requested
  const { amount, orderName } = product.quote(database, account, targetId)
  if (amount <= 0) throw new HttpError(409, "결제할 금액이 없어요.")
  const priced = { supply: amount, amount: withVat(amount) }
  account.customerKey ??= `uc_${randomBytes(18).toString("base64url")}`
  const payments = paymentsOf(database)
  const waiting = payments.find(
    (payment) => payment.accountId === account.id && payment.kind === kind && payment.targetId === targetId && payment.status === "pending",
  )
  if (waiting) {
    // 카드 승인이 이미 옛 금액을 청구했을 수 있으며, lib/cardRecovery.ts가
    // 이를 주문과 대조한다.
    if (waiting.paymentKey) return waiting
    Object.assign(waiting, priced, { orderName })
    return waiting
  }
  const payment: Payment = {
    id: `uc_${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "")}${Date.now().toString(36)}`,
    accountId: account.id,
    accountName: account.name,
    kind: kind as PaymentKind,
    targetId,
    orderName,
    ...priced,
    status: "pending",
    requestedAt: new Date().toISOString(),
  }
  payments.push(payment)
  return payment
}

// 결제를 완료로 표시하고 산 것을 준다.
export function markPaid(database: Database, payment: Payment, details: Pick<Payment, "method"> & Partial<Payment>) {
  if (payment.status === "paid") return
  Object.assign(payment, details, { status: "paid", paidAt: details.paidAt ?? new Date().toISOString() })
  productOf(payment.kind).fulfil?.(database, payment)
}

// 환불된 Pro나 광고 한 달은 그 일수를 돌려받는다. 같은 종류에서 그 뒤에
// 더해진 결제된 달은 그 일수만큼 앞당겨진다.
export function shiftLaterPeriods(database: Database, payment: Payment, days: number) {
  const end = payment.periodEnd
  if (!end) return
  for (const later of paymentsOf(database)) {
    if (later === payment || later.accountId !== payment.accountId || later.kind !== payment.kind) continue
    if (later.status !== "paid" || !later.periodEnd || later.periodEnd <= end) continue
    const date = new Date(`${later.periodEnd}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - days)
    later.periodEnd = date.toISOString().slice(0, 10)
  }
}

// 대기 중인 주문을 취소하거나 환불된 결제를 거둔다.
export function markCancelled(database: Database, payment: Payment, reason: string) {
  const wasPaid = payment.status === "paid"
  Object.assign(payment, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelReason: reason })
  if (wasPaid) productOf(payment.kind).revoke?.(database, payment)
}

// 회원이 직접 환불한 결제의 사유. 운영자가 환불한 것과 가른다.
export const memberRefundReason = "회원 요청"

// 결제에서 지금 돌려줄 일부. 전액을 돌려줄 결제면 null이다.
export const partialRefundOf = (payment: Payment, now = new Date()) => productOf(payment.kind).partialRefund?.(payment, now) ?? null

// 결제의 일부를 돌려준 것을 기록한다. 결제는 남고 돌려준 일수만큼 기간이 줄며, 뒤에
// 더해진 기간도 그만큼 앞당겨진다.
export function markPartlyRefunded(database: Database, payment: Payment, { amount, days }: PartialRefund, reason: string) {
  shiftLaterPeriods(database, payment, days)
  Object.assign(payment, {
    refundedAmount: amount,
    refundedAt: new Date().toISOString(),
    cancelReason: reason,
    periodEnd: addDays(payment.periodEnd!, -days),
    periodDays: (payment.periodDays ?? days) - days,
  })
}

// 결제에서 플랫폼에 남은 금액. 매출은 이것을 더한다.
export const keptAmount = (payment: Payment) => payment.amount - (payment.refundedAmount ?? 0)

// 계정이 보는 결제. Toss 키는 없다.
export const paymentView = ({
  paymentKey: _key,
  confirmingAt: _confirming,
  refundingAt: _refunding,
  refundReason: _reason,
  refundingAmount: _amount,
  refundingDays: _days,
  accountId: _account,
  ...payment
}: Payment) => payment
