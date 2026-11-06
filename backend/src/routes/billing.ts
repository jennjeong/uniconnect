import { randomUUID } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { cardReady, orderFor, paymentsOf, paymentView, prices, productOf, testMode, toss, tossUnsure, withVat } from "../lib/billing.js"
import { reconcileCards, recordApproval, settleCard, stuckCards } from "../lib/cardRecovery.js"
import { HttpError } from "../lib/errors.js"
// 브랜드가 살 수 있는 것으로, 각각 lib/billing.ts에 등록된다.
import "../lib/feeSales.js"
import "../lib/reportSales.js"
import { adOf } from "../lib/ads.js"
import { isPro } from "../lib/plan.js"
import { planTable } from "../lib/planTable.js"
import { partnerRequestCategory, partnerRequestsPerMonth, partnerRequestsThisMonth, planOf } from "../lib/pro.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

// 계정이 내는 돈이다(lib/billing.ts). 산 것에 대한 주문을 Toss Payments의
// 창에서 카드로 결제해 여기서 승인하거나, 운영자가 /admin에서 확인하는 계좌
// 이체로 낸다. 브랜드는 모든 것을 살 수 있고, 학생단체는 자기 광고만 살 수 있다.
export const billingRouter = Router()

// 테스트 키에서는 돈이 오가지 않으므로 카드 결제는 공유 데모 계정의 시연에만
// 연다. 실제 회원이 돈을 내지 않고 결제 완료가 되는 일을 막으며, 실제 회원은
// 그동안 계좌 이체로 낸다.
const cardOpenTo = (database: Database, account: Account) => cardReady() && (!testMode() || isDemoAccount(database, account))

// 공개 요금제 표. 로그인하지 않아도 읽는다.
billingRouter.get("/plans", (_req, res) => {
  res.json(planTable())
})

// 가격, 카드 결제가 켜져 있는지(그 창에 쓰는 클라이언트 키), 계정의 결제를
// 최신순으로 보여 준다.
billingRouter.get("/", async (req, res) => {
  const account = requireAccount(req)
  // 이 계정의 카드 승인 중 기록되지 못한 것을 Toss 기준으로 먼저 정리해
  // 목록에 결제 완료로 보이게 한다(lib/cardRecovery.ts).
  if (cardReady() && stuckCards(account.id).length > 0) await reconcileCards(account.id)
  const database = getDatabase()
  res.json({
    prices,
    card: cardOpenTo(database, account) ? { clientKey: config.tossClientKey } : null,
    // 테스트 결제는 돈이 오가지 않으며, 데모 계정은 그때만 결제한다. 실제 회원의
    // 계좌 이체에는 진짜 돈이 오가므로 테스트라고 알리지 않는다.
    testMode: testMode() && isDemoAccount(database, account),
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

// 결제할 주문이다. 무엇을 얼마에 사는지와, 결제 창에 쓰는 계정의 고객 키를
// 담는다. 공유 데모 계정은 결제할 수 없다.
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

// 대신 계좌 이체로 결제한다. 운영자가 주문을 보고 돈이 들어오면
// 확인한다.
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
  // 카드 승인을 보낸 주문은 청구됐을 수 있다. Toss에 먼저 묻고, 청구된
  // 주문은 취소하지 않고 기록한다.
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

// 결제 창에서 돌아온다. 주소가 바뀌었을 수 있으므로 금액은 주문의 것이어야
// 하고, Toss Payments가 승인한다.
billingRouter.post("/confirm", async (req, res) => {
  const account = requireAccount(req)
  const orderId = text(req.body?.orderId)
  const paymentKey = text(req.body?.paymentKey)
  const amount = Number(req.body?.amount)
  if (!cardOpenTo(getDatabase(), account)) throw new HttpError(409, "카드 결제가 아직 준비되지 않았어요.")
  const existing = paymentsOf(getDatabase()).find((item) => item.id === orderId && item.accountId === account.id)
  // 페이지를 두 번 열었으며 처음 연 쪽이 이미 승인했다.
  if (existing?.status === "paid") {
    res.json({ order: paymentView(existing) })
    return
  }
  const payment = ownWaiting(account.id, orderId)
  if (!paymentKey || amount !== payment.amount) throw new HttpError(400, "결제 금액이 주문과 달라요. 다시 결제해 주세요.")
  // 앞선 시도가 다른 키를 남겼다. 그 키가 카드를 청구했을 수 있으므로 Toss
  // 기준으로 먼저 정리한다(lib/cardRecovery.ts).
  if (payment.paymentKey && payment.paymentKey !== paymentKey) {
    const settled = await settleCard(orderId)
    if (settled === "paid") {
      res.json({ order: paymentView(paymentsOf(getDatabase()).find((item) => item.id === orderId)!) })
      return
    }
    if (settled === "open") throw new HttpError(409, "앞서 진행한 결제를 확인하고 있어요. 몇 분 뒤에 결제 내역을 확인해 주세요.")
  }
  const current = ownWaiting(account.id, orderId)
  // 지금 가격을 다시 매긴다. 앞서 만든 주문(그 뒤 끝난 재가입 할인, 옛 가격)은
  // 낡은 금액으로 승인하지 않는다. 키를 저장한 뒤에는 하지 않는다. 같은 승인을
  // 다시 시도한 것이면 이미 청구됐을 수 있다.
  if (!current.paymentKey) {
    const quoted = productOf(current.kind).quote(getDatabase(), account, current.targetId).amount
    // supply가 없는 주문은 부가세 전에 만든 것이다. 총액이 우연히 같아도 낡은
    // 주문이다.
    if (withVat(quoted) !== current.amount || current.supply !== quoted) {
      Object.assign(current, { supply: quoted, amount: withVat(quoted) })
      await saveDatabase()
      throw new HttpError(409, "금액이 바뀌었어요. 바뀐 금액으로 다시 결제해 주세요.")
    }
  }
  // 돈이 움직이기 전에 키를 저장한다. 이 저장이 실패하면 청구된 것이 없다.
  Object.assign(current, { paymentKey, confirmingAt: new Date().toISOString() })
  await saveDatabase()
  let approved
  try {
    approved = await toss.confirm(paymentKey, orderId, amount)
  } catch (error) {
    // Toss가 거절했으므로 카드는 청구되지 않았고 키를 지운다. 그 밖의 경우
    // (시간 초과, Toss 실패)에는 reconcileCards를 위해 키를 남긴다.
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

// Toss가 거절한 키를 되도록 거둬들인다. 남더라도 reconcileCards가 나중에
// 청구되지 않은 것을 찾아낸다.
async function forget(orderId: string, paymentKey: string) {
  const payment = paymentsOf(getDatabase()).find((item) => item.id === orderId)
  if (payment?.status !== "pending" || payment.paymentKey !== paymentKey) return
  delete payment.paymentKey
  delete payment.confirmingAt
  await saveDatabase().catch(() => {})
}

// 파트너의 1:1 섭외 요청이다. 어떤 행사를 찾는지 적으면 운영자가 질문처럼
// 답한다(한국 시간 기준 한 달에 두 번).
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
