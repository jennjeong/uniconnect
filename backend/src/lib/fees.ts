import type { AcceptedProposal } from "./agreements.js"
import { paymentsOf, prices, supplyOf, testMode } from "./billing.js"
import { HttpError } from "./errors.js"
import { isDemoAccount } from "./reviews.js"
import type { Agreement, Database } from "../types.js"

// 성사 수수료 (the business plan's 표 9): when a sponsorship is confirmed,
// the brand pays 15% of its value, cash and in-kind together, plus VAT
// (lib/billing.ts vatOf); the student group pays nothing. The brand's confirmation of the
// e-contract is that payment (sold in lib/feeSales.ts).

// Proposals accepted before fees began (a Korean date) owe none, nor does a
// brand without an account (an example listing); the shared demo brand owes
// one only in test mode, to show it (lib/billing.ts testMode), whatever
// the date.
// The browser tests move it with FEES_SINCE, the server tests here.
export const feeStart = { since: process.env.FEES_SINCE ?? "2026-11-01" }

const maxValue = 100_000_000
// The least a sponsorship may be worth, so a token value can't round the
// fee away.
export const minValue = 10_000

// A value as written: whole won from 0, cash and in-kind, together at least
// minValue.
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

// The fee for a value, rounded up to 10 won, so a value always owes one.
export const feeOf = (value: { cash: number; inKind: number }) =>
  Math.ceil(((value.cash + value.inKind) * prices.feeRate) / 10) * 10

// Where an agreement's fee stands: owed at all, its amount for the value
// written, what the brand paid for it and what is still due, all before VAT.
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
