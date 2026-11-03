import { randomBytes } from "node:crypto"

import { config } from "../config.js"
import type { Account, Database, Payment, PaymentKind } from "../types.js"
import { HttpError } from "./errors.js"

// The business plan's revenue model (표 9) as prices before VAT, which is
// added on top when an order is made (vatOf): brands pay; student groups pay
// only for their own ads.
export const prices = {
  // Of a sponsorship's value, cash and in-kind, when both sides confirm it.
  feeRate: 0.15,
  // A detailed report of one sponsorship.
  report: 50_000,
  // 캠퍼스 파트너스 (Pro inside), for 30 days.
  pro: 300_000,
  proDays: 30,
  // 상단 광고 (lib/ads.ts) for 30 days: a brand's on the student groups'
  // catalog, a group's on the brands'. Extending before it ends takes 10%
  // off.
  adBrand: 99_000,
  adGroup: 10_000,
  adDays: 30,
  adRenewalDiscount: 0.1,
  // VAT, added to every price at checkout.
  vatRate: 0.1,
} as const

// The VAT on a price, in whole won.
export const vatOf = (supply: number) => Math.round(supply * prices.vatRate)

// What a price comes to with VAT.
export const withVat = (supply: number) => supply + vatOf(supply)

// The part of a paid amount its price covered: payments from before VAT
// was added on top carry no supply and covered their whole amount.
export const supplyOf = (payment: Payment) => payment.supply ?? payment.amount

// Toss Payments' payment window takes the client key; the server confirms
// each payment with the secret key, which never leaves it. Without both,
// brands can still ask to pay by bank transfer, which an operator confirms.
export const cardReady = () => Boolean(config.tossClientKey && config.tossSecretKey)

// Test keys (test_…): no money moves, so the shared demo accounts may pay
// too, to show the whole flow in a demonstration. With live keys they can't.
export const testMode = () => cardReady() && (config.tossSecretKey ?? "").startsWith("test_")

const tossApi = "https://api.tosspayments.com/v1/payments"
const tossAuth = () => `Basic ${Buffer.from(`${config.tossSecretKey ?? ""}:`).toString("base64")}`

type TossPayment = { status?: string; totalAmount?: number; orderId?: string; receipt?: { url?: string } | null; approvedAt?: string }

// Calls to Toss Payments; tests swap them.
export const toss = {
  // Approves a payment the window authorized: within 10 minutes, for the
  // amount the server set.
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
      throw new HttpError(402, body?.message ? `결제를 승인하지 못했어요. ${body.message}` : "결제를 승인하지 못했어요. 다시 시도해 주세요.")
    }
    return body
  },
  // Refunds a card payment in full.
  async cancel(paymentKey: string, reason: string) {
    const response = await fetch(`${tossApi}/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      headers: { Authorization: tossAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ cancelReason: reason.slice(0, 200) }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      throw new HttpError(502, body?.message ? `환불하지 못했어요. ${body.message}` : "환불하지 못했어요. 다시 시도해 주세요.")
    }
  },
}

// What each kind costs before VAT and is called for an account and its target, and
// what paying for it does; registered by the features that sell them
// (lib/fees.ts, lib/premiumReport.ts, lib/pro.ts).
type Product = {
  quote: (database: Database, account: Account, targetId: string) => { amount: number; orderName: string }
  // Bought for the account itself (Pro, an ad), not one of its things: one
  // waiting order at a time, whatever target is sent.
  targetless?: true
  fulfil?: (database: Database, payment: Payment) => void
  // Undoes `fulfil` when a payment is refunded.
  revoke?: (database: Database, payment: Payment) => void
}

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

// The account's paid payment for a target, if any.
export const paidFor = (database: Database, accountId: string, kind: PaymentKind, targetId: string) =>
  paymentsOf(database).find(
    (payment) => payment.accountId === accountId && payment.kind === kind && payment.targetId === targetId && payment.status === "paid",
  )

// An order for the account: its waiting one for the same thing when there
// is one, at today's price with VAT, else a new one.
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

// Marks a payment paid and gives what it bought.
export function markPaid(database: Database, payment: Payment, details: Pick<Payment, "method"> & Partial<Payment>) {
  if (payment.status === "paid") return
  Object.assign(payment, details, { status: "paid", paidAt: details.paidAt ?? new Date().toISOString() })
  productOf(payment.kind).fulfil?.(database, payment)
}

// A refunded month of Pro or an ad takes its days back: later paid months
// of the same kind, which were added after it, move back by its days.
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

// Cancels a waiting order, or takes back a paid one after its refund.
export function markCancelled(database: Database, payment: Payment, reason: string) {
  const wasPaid = payment.status === "paid"
  Object.assign(payment, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelReason: reason })
  if (wasPaid) productOf(payment.kind).revoke?.(database, payment)
}

// A payment as its account sees it: no Toss key.
export const paymentView = ({ paymentKey: _key, accountId: _account, ...payment }: Payment) => payment
