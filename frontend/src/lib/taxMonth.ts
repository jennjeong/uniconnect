import type { AdminPayment, PaymentKind } from "../types"

// 세무용 월별 자료(#345): 한 달(한국 시간)의 매출과 환불을 공급가액 · 부가세로 나눠 센다.
// 매출은 결제된 달에, 환불은 돌려준 달에 잡는다. 환불된 결제도 결제된 달의 매출에는
// 그대로 남고, 돌려준 달에 빼는 줄이 따로 생긴다(신고는 달마다 하므로 지난달을 고치지 않는다).
// 운영자가 내준 0원 결제(grant)와 데모 계정의 예시 결제는 뺀다.

export type TaxLine = {
  type: "sale" | "refund"
  at: string
  payment: AdminPayment
  total: number
  supply: number
  vat: number
}

export type TaxSum = { count: number; total: number; supply: number; vat: number }

const kstOffsetMs = 9 * 3_600_000

// ISO 시각이 속한 한국 달 "YYYY-MM".
export const kstMonth = (iso: string) => new Date(Date.parse(iso) + kstOffsetMs).toISOString().slice(0, 7)

// 한국 시각 "YYYY-MM-DD HH:mm".
export const kstStamp = (iso: string) => new Date(Date.parse(iso) + kstOffsetMs).toISOString().slice(0, 16).replace("T", " ")

// 결제의 공급가액. 부가세를 얹기 전의 결제는 부가세를 가격 안에 품고 있었다.
export const supplyOf = (payment: Pick<AdminPayment, "amount" | "supply">) => payment.supply ?? payment.amount - Math.round(payment.amount / 11)

const counted = (payment: AdminPayment) => Boolean(payment.paidAt) && payment.method !== "grant" && !payment.example

// 결제에서 돌려준 금액과 그때. 전액 환불은 결제가 취소로 바뀌고, 일부 환불은 결제로 남는다.
function refundOf(payment: AdminPayment) {
  if (payment.refundedAmount && payment.refundedAt) return { amount: payment.refundedAmount, at: payment.refundedAt }
  if (payment.status === "cancelled" && payment.cancelledAt) return { amount: payment.amount, at: payment.cancelledAt }
  return null
}

const split = (payment: AdminPayment, total: number) => {
  // 일부 환불은 결제의 공급가액 비율대로 나눈다. 전액이면 결제의 값과 같다.
  const supply = total === payment.amount ? supplyOf(payment) : Math.round((total * supplyOf(payment)) / payment.amount)
  return { total, supply, vat: total - supply }
}

export function taxLines(payments: AdminPayment[], month: string): TaxLine[] {
  const lines: TaxLine[] = []
  for (const payment of payments) {
    if (!counted(payment)) continue
    if (kstMonth(payment.paidAt!) === month) lines.push({ type: "sale", at: payment.paidAt!, payment, ...split(payment, payment.amount) })
    const refund = refundOf(payment)
    if (refund && kstMonth(refund.at) === month) lines.push({ type: "refund", at: refund.at, payment, ...split(payment, refund.amount) })
  }
  return lines.sort((a, b) => a.at.localeCompare(b.at))
}

// 매출이나 환불이 있는 달, 최근 달부터.
export function taxMonths(payments: AdminPayment[]) {
  const months = new Set<string>()
  for (const payment of payments) {
    if (!counted(payment)) continue
    months.add(kstMonth(payment.paidAt!))
    const refund = refundOf(payment)
    if (refund) months.add(kstMonth(refund.at))
  }
  return [...months].sort().reverse()
}

const sum = (lines: TaxLine[]): TaxSum =>
  lines.reduce((all, line) => ({ count: all.count + 1, total: all.total + line.total, supply: all.supply + line.supply, vat: all.vat + line.vat }), {
    count: 0,
    total: 0,
    supply: 0,
    vat: 0,
  })

export function taxSummary(lines: TaxLine[]) {
  const sales = sum(lines.filter((line) => line.type === "sale"))
  const refunds = sum(lines.filter((line) => line.type === "refund"))
  const kinds = [...new Set(lines.map((line) => line.payment.kind))] as PaymentKind[]
  return {
    sales,
    refunds,
    net: { total: sales.total - refunds.total, supply: sales.supply - refunds.supply, vat: sales.vat - refunds.vat },
    byKind: kinds.map((kind) => {
      const own = lines.filter((line) => line.payment.kind === kind)
      return { kind, sales: sum(own.filter((line) => line.type === "sale")), refunds: sum(own.filter((line) => line.type === "refund")) }
    }),
  }
}
