import { randomUUID } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { cardReady, orderFor, paymentsOf, paymentView, prices, productOf, testMode, toss, tossUnsure, withVat } from "../lib/billing.js"
import { reconcileCards, recordApproval, settleCard, stuckCards } from "../lib/cardRecovery.js"
import { HttpError } from "../lib/errors.js"
// What brands can buy, each registered with lib/billing.ts.
import "../lib/feeSales.js"
import "../lib/reportSales.js"
import { adOf } from "../lib/ads.js"
import { isPro } from "../lib/plan.js"
import { partnerRequestCategory, partnerRequestsPerMonth, partnerRequestsThisMonth, planOf } from "../lib/pro.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"

// What an account pays (lib/billing.ts): an order for what it buys, paid in
// Toss Payments' window by card and approved here, or by bank transfer
// that an operator confirms on /admin. Brands buy everything; student
// groups only their own ads.
export const billingRouter = Router()

// Prices, whether card payment is on (and the client key for its window),
// and the account's payments, newest first.
billingRouter.get("/", async (req, res) => {
  const account = requireAccount(req)
  // A card approval of this account's that didn't get recorded is settled
  // from Toss first, so the list shows it paid (lib/cardRecovery.ts).
  if (cardReady() && stuckCards(account.id).length > 0) await reconcileCards(account.id)
  const database = getDatabase()
  res.json({
    prices,
    card: cardReady() ? { clientKey: config.tossClientKey } : null,
    // Test payments move no money; the demo accounts pay only then.
    testMode: testMode(),
    canPay: account.role === "브랜드" && (!isDemoAccount(database, account) || testMode()),
    plan: planOf(database, account),
    ad: adOf(database, account),
    canPayAd: !isDemoAccount(database, account) || testMode(),
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
  if (isDemoAccount(database, account) && !testMode()) throw new HttpError(403, "데모 계정은 테스트 결제로만 시연할 수 있어요.")
  const kind = text(req.body?.kind)
  if (account.role !== "브랜드" && kind !== "ad") throw new HttpError(403, "결제는 브랜드 계정만 해요.")
  const payment = orderFor(database, account, kind, text(req.body?.targetId))
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
  const id = String(req.params.id)
  // An order whose card approval was sent may have been charged: Toss says
  // first, and a charged one is recorded instead of cancelled.
  if (ownWaiting(account.id, id).paymentKey) {
    const settled = await settleCard(id)
    if (settled === "paid") throw new HttpError(409, "이미 결제한 주문이에요.")
    if (settled === "open") throw new HttpError(409, "앞서 진행한 결제를 확인하고 있어요. 몇 분 뒤에 결제 내역을 확인해 주세요.")
  }
  const payment = ownWaiting(account.id, id)
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
  // An earlier try left another key: settled from Toss first, as that one
  // may have charged the card (lib/cardRecovery.ts).
  if (payment.paymentKey && payment.paymentKey !== paymentKey) {
    const settled = await settleCard(orderId)
    if (settled === "paid") {
      res.json({ order: paymentView(paymentsOf(getDatabase()).find((item) => item.id === orderId)!) })
      return
    }
    if (settled === "open") throw new HttpError(409, "앞서 진행한 결제를 확인하고 있어요. 몇 분 뒤에 결제 내역을 확인해 주세요.")
  }
  const current = ownWaiting(account.id, orderId)
  // Priced again now: an order made earlier (a renewal discount since run
  // out, an old price) isn't approved at its stale amount. Not once its
  // key is saved: the same approval tried again may already have charged it.
  if (!current.paymentKey) {
    const quoted = productOf(current.kind).quote(getDatabase(), account, current.targetId).amount
    if (withVat(quoted) !== current.amount) {
      Object.assign(current, { supply: quoted, amount: withVat(quoted) })
      await saveDatabase()
      throw new HttpError(409, "금액이 바뀌었어요. 바뀐 금액으로 다시 결제해 주세요.")
    }
  }
  // The key is stored before any money moves; if this save fails, nothing
  // was charged.
  Object.assign(current, { paymentKey, confirmingAt: new Date().toISOString() })
  await saveDatabase()
  let approved
  try {
    approved = await toss.confirm(paymentKey, orderId, amount)
  } catch (error) {
    // Toss refused it, so the card wasn't charged: the key goes. Anything
    // else (a timeout, Toss failing) keeps it for reconcileCards.
    if (error instanceof HttpError && error.status === 402) await forget(orderId, paymentKey)
    if (error instanceof HttpError) throw error
    console.error(`[billing] confirm ${orderId}: ${(error as Error).message}`)
    throw new HttpError(502, tossUnsure)
  }
  if (approved.status !== "DONE" || approved.totalAmount !== amount) {
    console.error(`[billing] ${orderId}: Toss answered ${approved.status} for ${approved.totalAmount}`)
    throw new HttpError(402, "결제가 끝나지 않았어요. 다시 시도해 주세요.")
  }
  const paid = await recordApproval(orderId, paymentKey, approved)
  res.json({ order: paymentView(paid) })
})

// Takes back a key Toss refused, best effort: left behind, reconcileCards
// finds it uncharged later.
async function forget(orderId: string, paymentKey: string) {
  const payment = paymentsOf(getDatabase()).find((item) => item.id === orderId)
  if (payment?.status !== "pending" || payment.paymentKey !== paymentKey) return
  delete payment.paymentKey
  delete payment.confirmingAt
  await saveDatabase().catch(() => {})
}

// A partner's 1:1 섭외 요청: what events it looks for, which the operators
// answer like a question (twice a Korean month).
billingRouter.post("/partner-requests", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (!isPro(database, account.id)) throw new HttpError(403, "캠퍼스 파트너스만 쓸 수 있어요.")
  const request = text(req.body?.request)
  if (request.length < 10) throw new HttpError(400, "찾고 싶은 행사와 조건을 10자 이상 적어 주세요.")
  if (request.length > 1000) throw new HttpError(400, "질문은 1,000자 이하로 적어 주세요.")
  if (partnerRequestsThisMonth(database, account.id) >= partnerRequestsPerMonth) {
    throw new HttpError(409, `섭외 요청은 한 달에 ${partnerRequestsPerMonth}건까지예요.`)
  }
  database.inquiries.push({
    id: randomUUID(),
    accountId: account.id,
    category: partnerRequestCategory,
    question: request,
    createdAt: new Date().toISOString(),
  })
  await saveDatabase()
  res.status(201).json({ plan: planOf(database, account) })
})
