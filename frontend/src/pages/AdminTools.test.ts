import { describe, expect, test } from "vitest"

import { csvOf } from "./AdminTools"

describe("the operators' CSV files", () => {
  test("a cell starting like a formula stays text", () => {
    const file = csvOf([["이름"], ['=HYPERLINK("https://evil.example","x")'], ["+1"], ["@SUM(A1)"], [-3], ["보통 이름"]])
    expect(file.split("\r\n")).toEqual(["이름", `"'=HYPERLINK(""https://evil.example"",""x"")"`, "'+1", "'@SUM(A1)", "-3", "보통 이름"])
  })
})
