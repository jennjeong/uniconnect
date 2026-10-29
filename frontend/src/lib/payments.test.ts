import { describe, expect, test } from "vitest"

import { readPaymentReturn, withoutPaymentReturn } from "./payments"

describe("the payment window's answer", () => {
  test("a success carries what the server approves", () => {
    expect(readPaymentReturn("?payment=success&paymentKey=pk&orderId=uc_1&amount=50000")).toEqual({
      ok: true,
      orderId: "uc_1",
      paymentKey: "pk",
      amount: 50000,
    })
  })

  test("a failure says whether the payer stopped it", () => {
    expect(readPaymentReturn("?payment=fail&code=PAY_PROCESS_CANCELED&message=x")).toMatchObject({ ok: false, canceled: true })
    expect(readPaymentReturn("?payment=fail&code=REJECT_CARD_COMPANY&message=한도 초과")).toEqual({
      ok: false,
      canceled: false,
      message: "한도 초과",
    })
    expect(readPaymentReturn("?tab=2")).toBeUndefined()
  })

  test("leaves the rest of the address", () => {
    expect(withoutPaymentReturn("?payment=success&paymentKey=pk&orderId=o&amount=1&tab=2")).toBe("?tab=2")
    expect(withoutPaymentReturn("?payment=fail&code=c&message=m")).toBe("")
  })
})
