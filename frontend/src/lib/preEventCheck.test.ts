import { describe, expect, test } from "vitest"

import { preEventCheck } from "./preEventCheck"
import type { Agreement } from "../types"

const today = "2026-11-10"
const base = (extra: Partial<Agreement> = {}): Agreement =>
  ({
    id: "a", kind: "request", side: "brand", eventName: "가을 공연", eventDate: "2026-11-14",
    group: { name: "동아리", member: true }, brand: { name: "카페", member: true },
    confirmed: { group: "2026-11-01T00:00:00Z", brand: "2026-11-02T00:00:00Z" },
    event: { id: "e", owner: "group", started: false }, items: [], gives: "", createdAt: "", updatedAt: "",
    review: { open: false, canWrite: true, canReply: false }, cancelable: true,
    fee: { rate: 0.15, exempt: false, amount: 0, paid: 0, due: 0, needsValue: false },
    measure: {
      code: "c1", counts: {} as Agreement["measure"] extends infer M ? (M extends { counts: infer C } ? C : never) : never,
      methods: [{ kind: "qr", side: "group" }, { kind: "visit", side: "brand" }],
      confirmedMethods: [{ kind: "qr", side: "group" }, { kind: "visit", side: "brand" }],
      venue: { page: "staff", pin: "1234" },
    },
    ...extra,
  }) as Agreement

describe("the pre-event check", () => {
  test("is ready once both confirmed, the methods are settled and the PIN shows", () => {
    const check = preEventCheck(base(), today)!
    expect(check.days).toBe(4)
    expect(check.items.map((item) => [item.key, item.state])).toEqual([
      ["contract", "ok"],
      ["methods", "ok"],
      ["qr", "ok"],
      ["pin", "ok"],
    ])
  })

  test("asks for the contract, a changed method and waits for the PIN", () => {
    const check = preEventCheck(
      base({
        confirmed: { group: "2026-11-01T00:00:00Z" },
        measure: { ...base().measure!, methods: [{ kind: "qr", side: "group" }], venue: { page: "staff", pinsFrom: "2026-11-13" } },
      }),
      today,
    )!
    expect(check.items.map((item) => item.state)).toEqual(["todo", "todo", "ok", "pending"])
  })

  test("is left out once the event began, for a canceled one or without a measurement", () => {
    expect(preEventCheck(base({ event: { id: "e", owner: "group", started: true } }), today)).toBeNull()
    expect(preEventCheck(base({ eventDate: "2026-11-09" }), today)).toBeNull()
    expect(preEventCheck(base({ cancel: { by: "brand", reason: "", requestedAt: "", canceledAt: "x" } }), today)).toBeNull()
    expect(preEventCheck(base({ measure: undefined }), today)).toBeNull()
  })
})
