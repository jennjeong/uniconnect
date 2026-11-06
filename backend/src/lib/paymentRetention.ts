import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { Database, Payment } from "../types.js"
import { paymentsOf } from "./billing.js"

// 전자상거래법 시행령 제6조의 대금결제 기록 보존 기간이다.
const keepYears = 5

// 기록의 마지막 일이 일어난 시각이다. 보존 기간은 여기서 센다.
const settledAt = (payment: Payment) =>
  [payment.requestedAt, payment.transferRequestedAt, payment.paidAt, payment.cancelledAt]
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1)!

// 보존 기간이 지나 지울 결제다. 남아 있는 계정의 결제 완료 기록은 산 리포트와
// 낸 수수료의 근거라서 탈퇴할 때까지 둔다. Toss와 확인 중인 기록은 건드리지 않는다.
export function expiredPayments(database: Database, now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - keepYears)
  const members = new Set(database.accounts.map((account) => account.id))
  return paymentsOf(database).filter((payment) => {
    if (payment.confirmingAt || payment.refundingAt) return false
    if (payment.status === "paid" && members.has(payment.accountId)) return false
    return settledAt(payment) <= cutoff.toISOString()
  })
}

// 보존 기간이 지난 결제를 지우고 지운 건수를 돌려준다. 지울 것이 없으면 저장하지 않는다.
export async function prunePayments(now = new Date()) {
  return retryConflicts(async () => {
    const database = getDatabase()
    const expired = new Set(expiredPayments(database, now))
    if (expired.size === 0) return 0
    database.payments = paymentsOf(database).filter((payment) => !expired.has(payment))
    await saveDatabase()
    return expired.size
  })
}
