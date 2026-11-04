import { getDatabase, saveDatabase } from "../store.js"
import type { Payment } from "../types.js"
import { markPaid, paymentsOf, toss, type TossPayment } from "./billing.js"
import { HttpError } from "./errors.js"

// A card payment is approved by Toss Payments before it is recorded here,
// so a save that fails in between would leave a charged card and a waiting
// order. To recover it, `POST /api/billing/confirm` saves the paymentKey
// and `confirmingAt` on the order before asking Toss; recording the
// approval tries the save again; and an order still waiting with a key is
// settled later from what Toss says (`reconcileCards`, run by the cron
// route and the hourly timer in index.ts, and for an account's own orders
// when it opens its payments).

export const cardRecovery = {
  // Saves tried when recording an approval.
  saveAttempts: 3,
  // How long an approval may still be under way before a waiting order with
  // a key counts as stuck (Toss's confirm times out after 15 seconds).
  settleAfterMs: 2 * 60 * 1000,
}

const approvedNotSaved = "결제는 승인됐지만 기록을 저장하지 못했어요. 잠시 후 결제 내역에 반영돼요."

// Toss statuses after which the payment was never charged, or no longer can be.
const neverCharged = new Set(["CANCELED", "ABORTED", "EXPIRED"])

function cardDetails(paymentKey: string, approved: TossPayment): Pick<Payment, "method"> & Partial<Payment> {
  return {
    method: "card",
    paymentKey,
    ...(approved.receipt?.url ? { receiptUrl: approved.receipt.url } : {}),
    ...(approved.approvedAt ? { paidAt: new Date(approved.approvedAt).toISOString() } : {}),
  }
}

// Records a payment Toss approved, trying the save again when it fails (a
// failed save puts the data back as last written, or reads another copy's
// newer data, so each try starts from the stored order). Still failing, it
// answers 503 with the key already stored, for `reconcileCards`.
export async function recordApproval(orderId: string, paymentKey: string, approved: TossPayment) {
  for (let attempt = 1; ; attempt += 1) {
    const database = getDatabase()
    const payment = paymentsOf(database).find((item) => item.id === orderId)
    if (!payment) throw new HttpError(404, "주문을 찾을 수 없어요.")
    if (payment.status === "paid") return payment
    markPaid(database, payment, cardDetails(paymentKey, approved))
    delete payment.confirmingAt
    try {
      await saveDatabase()
      return payment
    } catch (error) {
      console.error(`[billing] recording ${orderId} failed (try ${attempt}): ${(error as Error).message}`)
      if (attempt >= cardRecovery.saveAttempts) throw new HttpError(503, approvedNotSaved)
    }
  }
}

// Forgets a key Toss never charged, so the order can be paid again.
async function releaseKey(orderId: string) {
  const payment = paymentsOf(getDatabase()).find((item) => item.id === orderId)
  if (!payment?.paymentKey || payment.status === "paid") return
  delete payment.paymentKey
  delete payment.confirmingAt
  await saveDatabase()
}

export type Settled = "paid" | "unpaid" | "open"

// Settles a waiting order that holds a key from what Toss has for it: paid
// when Toss approved it for the order's amount, unpaid (the key forgotten)
// when Toss never charged it, open when it can't tell yet or the two
// disagree, which is logged for the operators.
export async function settleCard(orderId: string): Promise<Settled> {
  const payment = paymentsOf(getDatabase()).find((item) => item.id === orderId)
  if (!payment || payment.status === "paid") return "paid"
  const paymentKey = payment.paymentKey
  if (!paymentKey) return "unpaid"
  const found = await toss.lookup(paymentKey)
  if (!found || found.orderId !== orderId || neverCharged.has(found.status ?? "")) {
    await releaseKey(orderId)
    return "unpaid"
  }
  if (found.status !== "DONE") return "open"
  if (found.totalAmount !== payment.amount) {
    console.error(`[billing] ${orderId}: Toss approved ${found.totalAmount}, the order is ${payment.amount}`)
    return "open"
  }
  await recordApproval(orderId, paymentKey, found)
  return "paid"
}

// Waiting orders with a key whose approval should have finished by now.
export const stuckCards = (accountId?: string) => {
  const before = Date.now() - cardRecovery.settleAfterMs
  return paymentsOf(getDatabase()).filter(
    (payment) =>
      payment.status === "pending" &&
      payment.paymentKey &&
      (!accountId || payment.accountId === accountId) &&
      (!payment.confirmingAt || Date.parse(payment.confirmingAt) <= before),
  )
}

// Settles every stuck order (or one account's), each on its own so one
// failure leaves the rest to go on.
export async function reconcileCards(accountId?: string) {
  const counts = { paid: 0, unpaid: 0, open: 0, failed: 0 }
  for (const { id } of stuckCards(accountId)) {
    try {
      counts[await settleCard(id)] += 1
    } catch (error) {
      counts.failed += 1
      console.error(`[billing] settling ${id} failed: ${(error as Error).message}`)
    }
  }
  return counts
}
