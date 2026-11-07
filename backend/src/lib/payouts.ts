import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import type { Agreement } from "../types.js"

// 현금 협찬금은 플랫폼 밖에서 오간다. 플랫폼은 돈을 다루지 않고, 지급 예정일과
// 브랜드의 지급 표시, 단체의 수령 표시만 기록해 양쪽이 같은 내용을 본다.

// "YYYY-MM-DD"이고 달력에 있는 날짜만 받는다. null은 예정일을 지운다.
export function parseDueDate(input: unknown) {
  if (input === null) return undefined
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input) || addDays(input, 0) !== input) {
    throw new HttpError(400, "지급 예정일을 날짜로 적어 주세요.")
  }
  return input
}

// 예정일이 지났는데 지급도 수령도 표시되지 않았다.
export function payoutLate(agreement: Agreement, today = todayInKorea()) {
  const payout = agreement.payout
  return Boolean(payout?.dueDate && payout.dueDate < today && !payout.paidAt && !payout.receivedAt)
}

// 양쪽이 보는 지급 기록. 메일을 보낸 기록은 뺀다.
export function payoutView(agreement: Agreement) {
  if (!agreement.payout) return undefined
  const { lateNotified: _notified, ...payout } = agreement.payout
  return { ...payout, late: payoutLate(agreement) }
}

// 현금 협찬액이 바뀌면 앞선 표시는 다른 금액에 대한 것이므로 지운다. 현금이 없어지면
// 예정일도 필요 없다.
export function cashChanged(agreement: Agreement, cash: number) {
  if (!agreement.payout) return
  if (cash <= 0) {
    delete agreement.payout
    return
  }
  for (const key of ["paidAt", "paidAmount", "receivedAt", "lateNotified"] as const) delete agreement.payout[key]
}
