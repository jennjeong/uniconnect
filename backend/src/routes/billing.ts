import { Router } from "express"

import { config } from "../config.js"
import { cardReady, markPaid, orderFor, paymentsOf, paymentView, prices, toss } from "../lib/billing.js"
import { HttpError } from "../lib/errors.js"
// What brands can buy, each registered with lib/billing.ts.
import "../lib/feeSales.js"
import "../lib/reportSales.js"
import { planOf } from "../lib/pro.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"

// What a brand pays (lib/billing.ts): an order for what it buys, paid in
// Toss Payments' window by card and approved here, or by bank transfer
// that an operator confirms on /admin.
export const billingRouter = Router()

// Prices, whether card payment is on (and the client key for its window),
// and the account's payments, newest first.
billingRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  res.json({
    prices,
    card: cardReady() ? { clientKey: config.tossClientKey } : null,
    plan: planOf(database, account),
    payments: paymentsOf(database)
      .filter((payment) => payment.accountId === account.id)
      .reverse()
      .map(paymentView),
  })
})

// An order to pay for: what and how much, with the account's customer key
// for the payment window. The shared demo accounts can't pay.
billingRouter.post("/orders", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 결제할 수 없어요.")
  if (account.role !== "브랜드") throw new HttpError(403, "결제는 브랜드 계정만 해요.")
  const payment = orderFor(database, account, text(req.body?.kind), text(req.body?.targetId))
  await saveDatabase()
  res.json({ order: paymentView(payment), customerKey: account.customerKey, email: account.email })
})

function ownWaiting(accountId: string, id: string) {
  const payment = paymentsOf(getDatabase()).find((item) => item.id === id && item.accountId === accountId)
  if (!payment) throw new HttpError(404, "주문을 찾을 수 없어요.")
  if (payment.status !== "pending") throw new HttpError(409, payment.status === "paid" ? "이미 결제한 주문이에요." : "취소된 주문이에요.")
  return payment
}

// Paying by bank transfer instead: the operators see the order and
// confirm it once the money arrives.
billingRouter.post("/orders/:id/transfer", async (req, res) => {
  const account = requireAccount(req)
  const payment = ownWaiting(account.id, String(req.params.id))
  payment.transferRequestedAt ??= new Date().toISOString()
  await saveDatabase()
  res.json({ order: paymentView(payment) })
})

billingRouter.delete("/orders/:id", async (req, res) => {
  const account = requireAccount(req)
  const payment = ownWaiting(account.id, String(req.params.id))
  Object.assign(payment, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelReason: "주문 취소" })
  await saveDatabase()
  res.json({ order: paymentView(payment) })
})

// Back from the payment window: the amount must be the order's, as the
// address could have been changed, and Toss Payments approves it.
billingRouter.post("/confirm", async (req, res) => {
  const account = requireAccount(req)
  const orderId = text(req.body?.orderId)
  const paymentKey = text(req.body?.paymentKey)
  const amount = Number(req.body?.amount)
  if (!cardReady()) throw new HttpError(409, "카드 결제가 아직 준비되지 않았어요.")
  const existing = paymentsOf(getDatabase()).find((item) => item.id === orderId && item.accountId === account.id)
  // A page opened twice: the first already approved it.
  if (existing?.status === "paid") {
    res.json({ order: paymentView(existing) })
    return
  }
  const payment = ownWaiting(account.id, orderId)
  if (!paymentKey || amount !== payment.amount) throw new HttpError(400, "결제 금액이 주문과 달라요. 다시 결제해 주세요.")
  const approved = await toss.confirm(paymentKey, orderId, amount)
  if (approved.status !== "DONE" || approved.totalAmount !== payment.amount) {
    throw new HttpError(402, "결제가 끝나지 않았어요. 다시 시도해 주세요.")
  }
  const database = getDatabase()
  const current = paymentsOf(database).find((item) => item.id === orderId)!
  markPaid(database, current, {
    method: "card",
    paymentKey,
    ...(approved.receipt?.url ? { receiptUrl: approved.receipt.url } : {}),
    ...(approved.approvedAt ? { paidAt: new Date(approved.approvedAt).toISOString() } : {}),
  })
  await saveDatabase()
  res.json({ order: paymentView(current) })
})
