import { describe, expect, test } from "vitest"

import { progressSteps } from "./RequestProgress"

const base = { createdAt: "2026-10-01T03:00:00Z", respondedAt: "2026-10-02T03:00:00Z", day: "2026-10-20" }
const states = (steps: ReturnType<typeof progressSteps>) => steps.map((step) => step.state)

describe("sponsorship progress", () => {
  test("accepted but not confirmed waits on the contract, whatever the date", () => {
    expect(states(progressSteps(base, "2026-10-10"))).toEqual(["step-done", "step-done", "step-current", "step-next", "step-next"])
  })

  test("a passed event day with nothing recorded is a check, not done", () => {
    const steps = progressSteps({ ...base, contractAt: "2026-10-05T03:00:00Z" }, "2026-10-25")
    expect(states(steps)).toEqual(["step-done", "step-done", "step-done", "step-late", "step-next"])
    expect(steps[3].done).toBe(false)
  })

  test("the report is done only once results settled, not a week after the day", () => {
    const held = { ...base, contractAt: "2026-10-05T03:00:00Z", executedAt: "2026-10-20" }
    expect(states(progressSteps(held, "2026-10-24"))).toEqual(["step-done", "step-done", "step-done", "step-done", "step-current"])
    expect(progressSteps(held, "2026-11-10")[4].state).toBe("step-late")
    expect(states(progressSteps({ ...held, reportedAt: "2026-10-28" }, "2026-11-10"))).toEqual(Array(5).fill("step-done"))
  })
})
