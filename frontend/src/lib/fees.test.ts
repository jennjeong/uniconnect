import { describe, expect, test } from "vitest"

import { prices, withVat } from "../../../backend/src/lib/billing"
import { feeOf } from "../../../backend/src/lib/fees"
import { feeEstimate, feeRate, maxValue, minValue, vatRate } from "./fees"

// 제안 폼의 예상 수수료는 결제창이 받는 금액과 같다.
describe("the fee estimate", () => {
  test("uses the server's rates", () => {
    expect(feeRate).toBe(prices.feeRate)
    expect(vatRate).toBe(prices.vatRate)
  })

  test.each([10_000, 33_333, 300_000, 680_000, 1_234_567, 100_000_000])("matches what checkout charges for %i won", (value) => {
    const fee = feeOf({ cash: value, inKind: 0 })
    expect(feeEstimate(value)).toEqual({ fee, total: withVat(fee) })
  })

  test("is left out below the least value or above the most", () => {
    expect(feeEstimate(minValue - 1)).toBeNull()
    expect(feeEstimate(maxValue + 1)).toBeNull()
  })
})
