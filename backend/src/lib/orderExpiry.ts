import { orderExpiry, paymentsOf } from "./billing.js"
import { notify } from "./notices.js"
import { isDemoId } from "./reviews.js"
import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { Database, Payment } from "../types.js"

// 결제를 기다리는 주문은 마지막으로 손댄 때(주문, 다시 결제 창 열기, 계좌 이체 신청)부터
// 7일 뒤 스스로 취소된다(2026-11-22 운영 결정, 기한은 lib/billing.ts의 renewExpiry가 센다).
// 계좌 이체를 신청한 주문은 그 하루 전에 메일로 알린다. 카드 승인이나 환불이 오가는 주문(paymentKey, confirmingAt, refundingAt)은
// lib/cardRecovery.ts가 정리하므로 건드리지 않는다.
const dayMs = 86_400_000
export const expiredReason = "입금 기한 지남"

// 기한이 없던 옛 주문은 주문하거나 이체를 신청한 때부터 센다.
export const expiresAtOf = (payment: Payment) =>
  payment.expiresAt ?? new Date(Date.parse(payment.transferRequestedAt ?? payment.requestedAt) + orderExpiry.days * dayMs).toISOString()

const moneyMoving = (payment: Payment) => Boolean(payment.paymentKey || payment.confirmingAt || payment.refundingAt)

// 기한이 지난 주문을 취소로 바꾼다. 바꾼 수를 돌려준다(저장은 부르는 쪽이 한다).
export function expireOrders(database: Database, now = new Date()) {
  let expired = 0
  for (const payment of paymentsOf(database)) {
    if (payment.status !== "pending" || moneyMoving(payment)) continue
    if (Date.parse(expiresAtOf(payment)) > now.getTime()) continue
    Object.assign(payment, { status: "cancelled", cancelledAt: now.toISOString(), cancelReason: expiredReason, expiredAt: now.toISOString() })
    expired += 1
  }
  return expired
}

// 계좌 이체를 신청했고 하루 안에 기한이 끝나는, 아직 알리지 않은 실제 회원의 주문.
export const ordersToWarn = (database: Database, now = new Date()) =>
  paymentsOf(database).filter((payment) => {
    if (payment.status !== "pending" || moneyMoving(payment) || !payment.transferRequestedAt || payment.expiryWarnedAt) return false
    if (isDemoId(database, payment.accountId)) return false
    const left = Date.parse(expiresAtOf(payment)) - now.getTime()
    return left > 0 && left <= orderExpiry.warnHours * 3_600_000
  })

// 크론이 부른다. 하루 전 알림을 보내고 기한이 지난 주문을 취소한다.
export async function runOrderExpiry(now = new Date()) {
  const due = ordersToWarn(getDatabase(), now)
  let warned = 0
  for (const payment of due) {
    const account = getDatabase().accounts.find((item) => item.id === payment.accountId)
    notify(
      account,
      "account",
      `'${payment.orderName}' 주문이 내일 취소돼요`,
      [
        `'${payment.orderName}' 주문의 입금 기한이 내일까지예요.`,
        "아직 입금하지 않았다면 내일까지 입금해 주세요. 기한이 지나면 주문이 취소되고, 다시 주문하면 돼요.",
        "이미 입금했다면 그대로 기다려 주세요. 운영자가 확인하면 결제가 끝나요.",
      ],
      "/me",
    )
    warned += 1
  }
  const expired = await retryConflicts(async () => {
    const database = getDatabase()
    const stamp = now.toISOString()
    for (const { id } of due) {
      const payment = paymentsOf(database).find((item) => item.id === id)
      if (payment) payment.expiryWarnedAt = stamp
    }
    const count = expireOrders(database, now)
    if (count > 0 || due.length > 0) await saveDatabase()
    return count
  })
  return { warned, expired }
}

// 운영자가 기한 뒤에 들어온 입금을 확인할 때: 같은 건의 다른 대기·완료 주문이 없으면 다시 연다.
export function reopenExpired(database: Database, payment: Payment) {
  if (payment.status !== "cancelled" || !payment.expiredAt) return false
  const other = paymentsOf(database).some(
    (item) =>
      item.id !== payment.id &&
      item.accountId === payment.accountId &&
      item.kind === payment.kind &&
      item.targetId === payment.targetId &&
      (item.status === "pending" || item.status === "paid"),
  )
  if (other) return false
  payment.status = "pending"
  delete payment.cancelledAt
  delete payment.cancelReason
  delete payment.expiredAt
  return true
}
