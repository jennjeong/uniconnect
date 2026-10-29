import type { AcceptedProposal } from "./agreements.js"
import { paymentsOf, prices, testMode } from "./billing.js"
import { HttpError } from "./errors.js"
import { isDemoAccount } from "./reviews.js"
import type { Agreement, Database } from "../types.js"

// 성사 수수료 (the business plan's 표 9): when a sponsorship is confirmed,
// the brand pays 15% of its value, cash and in-kind together, VAT
// included; the student group pays nothing. The brand's confirmation of the
// e-contract is that payment (sold in lib/feeSales.ts).

// Proposals accepted before fees began (a Korean date) owe none, nor does a
// brand without an account (an example listing); the shared demo brand owes
// one only in test mode, to show it (lib/billing.ts testMode), whatever
// the date.
// The browser tests move it with FEES_SINCE, the server tests here.
export const feeStart = { since: process.env.FEES_SINCE ?? "2026-11-01" }

const maxValue = 100_000_000

// A value as written: whole won from 0, cash and in-kind, not both 0.
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
  return value
}

// The fee for a value, to 10 won.
export const feeOf = (value: { cash: number; inKind: number }) =>
  Math.round(((value.cash + value.inKind) * prices.feeRate) / 10) * 10

// Where an agreement's fee stands: owed at all, its amount for the value
// written, what the brand paid for it and what is still due.
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
    .reduce((sum, payment) => sum + payment.amount, 0)
  return {
    rate: prices.feeRate,
    exempt,
    amount: exempt ? 0 : amount,
    paid,
    due: exempt ? 0 : Math.max(0, amount - paid),
    needsValue: !exempt && !agreement.value,
  }
}
