import { describe, expect, it } from "vitest"

import type { AdminPayment } from "../types"
import { kstMonth, taxLines, taxMonths, taxSummary } from "./taxMonth"

const payment = (over: Partial<AdminPayment>): AdminPayment => ({
  id: "p",
  accountId: "a",
  accountName: "브랜드",
  card: false,
  kind: "pro",
  targetId: "a",
  orderName: "Growth 30일",
  amount: 110_000,
  supply: 100_000,
  status: "paid",
  method: "card",
  requestedAt: "2026-11-01T00:00:00.000Z",
  paidAt: "2026-11-01T00:00:00.000Z",
  ...over,
})

describe("monthly tax figures", () => {
  it("counts months in Korean time", () => {
    expect(kstMonth("2026-11-30T14:59:00.000Z")).toBe("2026-11")
    expect(kstMonth("2026-11-30T15:00:00.000Z")).toBe("2026-12")
  })

  it("splits sales into supply and VAT, and leaves out grants and examples", () => {
    const lines = taxLines(
      [
        payment({ id: "1" }),
        payment({ id: "2", method: "grant", amount: 0, supply: 0 }),
        payment({ id: "3", example: true }),
        payment({ id: "4", supply: undefined, amount: 99_000 }),
        payment({ id: "5", status: "pending", paidAt: undefined }),
      ],
      "2026-11",
    )
    expect(lines.map((line) => line.payment.id)).toEqual(["1", "4"])
    const { sales, refunds, net } = taxSummary(lines)
    expect(sales).toEqual({ count: 2, total: 209_000, supply: 190_000, vat: 19_000 })
    expect(refunds.count).toBe(0)
    expect(net.vat).toBe(19_000)
  })

  it("puts a refund in the month it was paid back, keeping the sale in its own month", () => {
    const payments = [
      payment({ id: "full", status: "cancelled", paidAt: "2026-10-31T16:00:00.000Z", cancelledAt: "2026-11-03T00:00:00.000Z" }),
      payment({ id: "part", refundedAmount: 55_000, refundedAt: "2026-12-02T00:00:00.000Z" }),
      payment({ id: "order", status: "cancelled", paidAt: undefined, cancelledAt: "2026-11-05T00:00:00.000Z" }),
    ]
    expect(taxMonths(payments)).toEqual(["2026-12", "2026-11"])
    const november = taxSummary(taxLines(payments, "2026-11"))
    expect(november.sales).toEqual({ count: 2, total: 220_000, supply: 200_000, vat: 20_000 })
    expect(november.refunds).toEqual({ count: 1, total: 110_000, supply: 100_000, vat: 10_000 })
    expect(november.net).toEqual({ total: 110_000, supply: 100_000, vat: 10_000 })
    const december = taxSummary(taxLines(payments, "2026-12"))
    expect(december.sales.count).toBe(0)
    expect(december.refunds).toEqual({ count: 1, total: 55_000, supply: 50_000, vat: 5_000 })
  })
})
