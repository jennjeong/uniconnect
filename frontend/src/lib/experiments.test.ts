import { describe, expect, it } from "vitest"

import { hashOf, pickVariant } from "./experiments"

describe("A/B test variants", () => {
  it("gives one browser the same variant every time and splits browsers between both", () => {
    expect(pickVariant("landing-entry", "same-id")).toBe(pickVariant("landing-entry", "same-id"))
    const picked = Array.from({ length: 400 }, (_, index) => pickVariant("landing-entry", `id-${index}`))
    const b = picked.filter((variant) => variant === "B").length
    expect(b).toBeGreaterThan(150)
    expect(b).toBeLessThan(250)
    expect(hashOf("a")).not.toBe(hashOf("b"))
  })
})
