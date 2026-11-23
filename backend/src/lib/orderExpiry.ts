import { orderExpiry, paymentsOf, priceOrder } from "./billing.js"
import { HttpError } from "./errors.js"
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
// 알렸다는 표시를 먼저 저장하고 메일은 그 뒤에 보낸다. 저장이 충돌하면 다른 복사본이 남긴
// 표시를 다시 읽고 고르므로, 크론과 타이머가 함께 돌아도 같은 메일을 두 번 보내지 않는다.
export async function runOrderExpiry(now = new Date()) {
  const { due, expired } = await retryConflicts(async () => {
    const database = getDatabase()
    const due = ordersToWarn(database, now)
    for (const payment of due) payment.expiryWarnedAt = now.toISOString()
    const expired = expireOrders(database, now)
    if (expired > 0 || due.length > 0) await saveDatabase()
    return { due: due.map(({ accountId, orderName }) => ({ accountId, orderName })), expired }
  })
  for (const { accountId, orderName } of due) {
    notify(
      getDatabase().accounts.find((item) => item.id === accountId),
      "account",
      `'${orderName}' 주문이 내일 취소돼요`,
      [
        `'${orderName}' 주문의 입금 기한이 내일까지예요.`,
        "아직 입금하지 않았다면 내일까지 입금해 주세요. 기한이 지나면 주문이 취소되고, 다시 주문하면 돼요.",
        "이미 입금했다면 그대로 기다려 주세요. 운영자가 확인하면 결제가 끝나요.",
      ],
      "/me",
    )
  }
  return { warned: due.length, expired }
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
  // 기한이 지난 뒤에는 대상이 바뀌었을 수 있다(캠페인의 견적을 다시 쓰거나 캠페인을 취소하는 잠금이
  // 이때 풀린다). 지금 같은 금액으로 살 수 있을 때만 연다. 아니면 옛 금액으로 산 것을 주거나,
  // 취소된 대상에 돈만 남는다.
  if (!quotedSame(database, payment)) {
    throw new HttpError(409, "기한이 지난 뒤 주문 내용이 바뀌어 다시 열 수 없어요. 입금한 돈은 돌려 드리고 새로 주문하도록 안내해 주세요.")
  }
  payment.status = "pending"
  delete payment.cancelledAt
  delete payment.cancelReason
  delete payment.expiredAt
  return true
}

// 주문한 계정이 지금 같은 대상을 같은 금액(부가세 포함)으로 살 수 있는지.
function quotedSame(database: Database, payment: Payment) {
  const account = database.accounts.find((item) => item.id === payment.accountId)
  if (!account) return false
  try {
    return priceOrder(database, account, payment.kind, payment.targetId, payment.promo?.code, payment.id).amount === payment.amount
  } catch {
    return false
  }
}
