import { randomUUID } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { cardReady, markPaid, orderFor, paymentsOf, paymentView, prices, productOf, testMode, toss, withVat } from "../lib/billing.js"
import { HttpError } from "../lib/errors.js"
// 브랜드가 살 수 있는 것으로, 각각 lib/billing.ts에 등록된다.
import "../lib/feeSales.js"
import "../lib/reportSales.js"
import { adOf } from "../lib/ads.js"
import { isPro } from "../lib/plan.js"
import { partnerRequestCategory, partnerRequestsPerMonth, partnerRequestsThisMonth, planOf } from "../lib/pro.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"

// 계정이 내는 돈이다(lib/billing.ts). 산 것에 대한 주문을 Toss Payments의
// 창에서 카드로 결제해 여기서 승인하거나, 운영자가 /admin에서 확인하는 계좌
// 이체로 낸다. 브랜드는 모든 것을 살 수 있고, 학생단체는 자기 광고만 살 수 있다.
export const billingRouter = Router()

// 가격, 카드 결제가 켜져 있는지(그 창에 쓰는 클라이언트 키), 계정의 결제를
// 최신순으로 보여 준다.
billingRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  res.json({
    prices,
    card: cardReady() ? { clientKey: config.tossClientKey } : null,
    // 테스트 결제는 돈이 오가지 않으며, 데모 계정은 그때만 결제한다.
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
  const payment = ownWaiting(account.id, String(req.params.id))
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
  if (!cardReady()) throw new HttpError(409, "카드 결제가 아직 준비되지 않았어요.")
  const existing = paymentsOf(getDatabase()).find((item) => item.id === orderId && item.accountId === account.id)
  // 페이지를 두 번 열었으며 처음 연 쪽이 이미 승인했다.
  if (existing?.status === "paid") {
    res.json({ order: paymentView(existing) })
    return
  }
  const payment = ownWaiting(account.id, orderId)
  if (!paymentKey || amount !== payment.amount) throw new HttpError(400, "결제 금액이 주문과 달라요. 다시 결제해 주세요.")
  // 지금 가격을 다시 매긴다. 앞서 만든 주문(그 뒤 끝난 재가입 할인, 옛 가격)은
  // 낡은 금액으로 승인하지 않는다.
  const quoted = productOf(payment.kind).quote(getDatabase(), account, payment.targetId).amount
  if (withVat(quoted) !== payment.amount) {
    Object.assign(payment, { supply: quoted, amount: withVat(quoted) })
    await saveDatabase()
    throw new HttpError(409, "금액이 바뀌었어요. 바뀐 금액으로 다시 결제해 주세요.")
  }
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
