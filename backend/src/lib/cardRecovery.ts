import { getDatabase, saveDatabase } from "../store.js"
import type { Payment } from "../types.js"
import { markPaid, paymentsOf, toss, type TossPayment } from "./billing.js"
import { HttpError } from "./errors.js"

// 카드 결제는 여기에 기록되기 전에 Toss Payments가 승인하므로, 그 사이에
// 저장이 실패하면 카드는 청구됐는데 주문은 대기로 남는다. 이를 복구하려고
// `POST /api/billing/confirm`은 Toss에 묻기 전에 주문에 paymentKey와
// `confirmingAt`을 저장하고, 승인을 기록할 때 저장을 다시 시도하며, 키를 가진
// 채 대기 중인 주문은 나중에 Toss의 답을 기준으로 정리한다(`reconcileCards`,
// cron 경로와 index.ts의 한 시간 타이머가 돌리고, 계정이 결제 내역을 열 때
// 그 계정의 주문에도 돌린다).

export const cardRecovery = {
  // 승인을 기록할 때 시도하는 저장 횟수.
  saveAttempts: 3,
  // 키를 가진 대기 주문을 멈춘 것으로 보기 전에 승인이 진행 중일 수 있는
  // 시간(Toss 확인은 15초 뒤 시간 초과된다).
  settleAfterMs: 2 * 60 * 1000,
}

const approvedNotSaved = "결제는 승인됐지만 기록을 저장하지 못했어요. 잠시 후 결제 내역에 반영돼요."

// 결제가 청구되지 않았거나 더는 청구될 수 없는 Toss 상태.
const neverCharged = new Set(["CANCELED", "ABORTED", "EXPIRED"])

function cardDetails(paymentKey: string, approved: TossPayment): Pick<Payment, "method"> & Partial<Payment> {
  return {
    method: "card",
    paymentKey,
    ...(approved.receipt?.url ? { receiptUrl: approved.receipt.url } : {}),
    ...(approved.approvedAt ? { paidAt: new Date(approved.approvedAt).toISOString() } : {}),
  }
}

// Toss가 승인한 결제를 기록하고 저장이 실패하면 다시 시도한다(저장 실패는
// 데이터를 마지막으로 쓴 상태로 되돌리거나 다른 사본의 새 데이터를 읽으므로
// 시도마다 저장된 주문에서 시작한다). 그래도 실패하면 키가 저장된 채로 503을
// 답하고 `reconcileCards`에 맡긴다.
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

// Toss가 청구하지 않은 키를 지워 주문을 다시 결제할 수 있게 한다.
async function releaseKey(orderId: string) {
  const payment = paymentsOf(getDatabase()).find((item) => item.id === orderId)
  if (!payment?.paymentKey || payment.status === "paid") return
  delete payment.paymentKey
  delete payment.confirmingAt
  await saveDatabase()
}

export type Settled = "paid" | "unpaid" | "open"

// 키를 가진 대기 주문을 Toss의 기록으로 정리한다. Toss가 주문 금액으로
// 승인했으면 결제 완료, 청구하지 않았으면 미결제(키를 지운다), 아직 알 수
// 없거나 둘이 다르면 미정이며 다른 경우는 운영자를 위해 로그에 남긴다.
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

// 키를 가졌고 승인이 지금쯤 끝났어야 할 대기 주문.
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

// 멈춘 주문 전체(또는 한 계정의 주문)를 하나씩 정리해 하나가 실패해도
// 나머지는 계속한다.
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
