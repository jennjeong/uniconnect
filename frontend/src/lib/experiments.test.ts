import { describe, expect, it, vi } from "vitest"

import { api } from "../api"
import { convertExperiments, hashOf, pickVariant } from "./experiments"

describe("A/B test variants", () => {
  it("gives one browser the same variant every time and splits browsers between both", () => {
    expect(pickVariant("landing-entry", "same-id")).toBe(pickVariant("landing-entry", "same-id"))
    const picked = Array.from({ length: 400 }, (_, index) => pickVariant("landing-entry", `id-${index}`))
    const b = picked.filter((variant) => variant === "B").length
    expect(b).toBeGreaterThan(150)
    expect(b).toBeLessThan(250)
    expect(hashOf("a")).not.toBe(hashOf("b"))
  })

  it("reports a sign-up once per run, only for a browser that saw the wording", () => {
    const saved = new Map<string, string>()
    vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => void saved.set(key, value) })
    const sent = vi.spyOn(api, "countExperiment").mockResolvedValue(undefined)
    convertExperiments("sign_up")
    expect(sent).not.toHaveBeenCalled()
    saved.set("uniconnect-ab-seen-landing-entry", "run-1 B")
    convertExperiments("sign_up")
    convertExperiments("sign_up")
    expect(sent.mock.calls).toEqual([["landing-entry", "B", "converted", "run-1"]])
    saved.set("uniconnect-ab-seen-landing-entry", "run-2 B")
    convertExperiments("sign_up")
    expect(sent).toHaveBeenCalledTimes(2)
    sent.mockRestore()
    vi.unstubAllGlobals()
  })
})
