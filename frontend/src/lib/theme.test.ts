import { describe, expect, it } from "vitest"

import { resolvedTheme } from "./theme"

describe("member theme", () => {
  it("follows the device only when asked to", () => {
    expect(resolvedTheme("light", true)).toBe("light")
    expect(resolvedTheme("dark", false)).toBe("dark")
    expect(resolvedTheme("system", true)).toBe("dark")
    expect(resolvedTheme("system", false)).toBe("light")
  })
})
