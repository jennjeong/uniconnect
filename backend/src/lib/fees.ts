import type { AcceptedProposal } from "./agreements.js"
import { paymentsOf, prices, supplyOf, testMode } from "./billing.js"
import { HttpError } from "./errors.js"
import { isDemoAccount } from "./reviews.js"
import type { Agreement, Database } from "../types.js"

// 성사 수수료(사업 계획의 표 9): 협찬이 확정되면 브랜드가 그 가치(현금과
// 현물 합계)의 15%에 부가세(lib/billing.ts vatOf)를 더해 낸다. 학생 단체는
// 내지 않는다. 브랜드가 전자계약서를 확인하는 것이 이 결제다(판매는
// lib/feeSales.ts).

// 수수료가 시작되기 전(한국 날짜)에 수락된 제안과 계정이 없는 브랜드(예시
// 리스팅)는 내지 않는다. 공용 데모 브랜드는 보여 주기 위해 테스트 모드
// (lib/billing.ts testMode)에서만 내며 날짜는 상관없다. 브라우저 테스트는
// FEES_SINCE로, 서버 테스트는 여기서 옮긴다.
export const feeStart = { since: process.env.FEES_SINCE ?? "2026-11-01" }

export const maxValue = 100_000_000
// 협찬이 가질 수 있는 가장 작은 값. 형식적인 값이 수수료를 반올림으로
// 없애지 못하게 한다.
export const minValue = 10_000

// 적힌 그대로의 값: 0 이상의 정수 원, 현금과 현물을 합쳐 최소
// minValue 이상.
export function parseValue(input: unknown) {
  const raw = (input ?? {}) as { cash?: unknown; inKind?: unknown }
  const won = (value: unknown) => {
    const number = typeof value === "string" ? Number(value.replace(/[,\s원]/g, "")) : Number(value ?? 0)
    if (!Number.isInteger(number) || number < 0 || number > maxValue) {
      throw new HttpError(400, "협찬액은 0원부터 1억 원까지 원 단위로 적어 주세요.")
    }
    return number
  }
  const value = { cash: won(raw.cash), inKind: won(raw.inKind) }
  if (value.cash + value.inKind === 0) throw new HttpError(400, "현금이나 현물 환산 금액을 적어 주세요.")
  if (value.cash + value.inKind < minValue) throw new HttpError(400, "협찬액은 현금과 현물을 더해 1만 원 이상으로 적어 주세요.")
  return value
}

// 값에 대한 수수료. 10원 단위로 올림하므로 값이 있으면 늘 수수료가 있다.
export const feeOf = (value: { cash: number; inKind: number }) =>
  Math.ceil(((value.cash + value.inKind) * prices.feeRate) / 10) * 10

// 계약서의 수수료 상태: 내야 하는지, 적힌 값에 대한 금액, 브랜드가 낸
// 것과 아직 낼 것. 모두 부가세 전이다.
export function feeState(database: Database, agreement: Agreement, proposal: AcceptedProposal) {
  const brand = proposal.brand.account
  const exempt = !brand
    ? true
    : isDemoAccount(database, brand)
      ? !testMode()
      : proposal.respondedAt !== undefined && proposal.respondedAt.slice(0, 10) < feeStart.since
  const amount = agreement.value ? feeOf(agreement.value) : 0
  const paid = paymentsOf(database)
    .filter((payment) => payment.kind === "fee" && payment.targetId === agreement.id && payment.status === "paid")
    .reduce((sum, payment) => sum + supplyOf(payment), 0)
  return {
    rate: prices.feeRate,
    exempt,
    amount: exempt ? 0 : amount,
    paid,
    due: exempt ? 0 : Math.max(0, amount - paid),
    needsValue: !exempt && !agreement.value,
  }
}
