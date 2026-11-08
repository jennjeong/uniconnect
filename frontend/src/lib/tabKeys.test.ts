import { describe, expect, it } from "vitest"

import { nextTabIndex } from "./tabKeys"

describe("nextTabIndex", () => {
  it("moves to the neighbouring tab and wraps at the ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1)
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0)
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2)
    expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1)
  })

  it("jumps to the first and last tab", () => {
    expect(nextTabIndex("Home", 2, 4)).toBe(0)
    expect(nextTabIndex("End", 0, 4)).toBe(3)
  })

  it("ignores other keys and empty rows", () => {
    expect(nextTabIndex("Enter", 1, 3)).toBeNull()
    expect(nextTabIndex("ArrowDown", 1, 3)).toBeNull()
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull()
  })
})
