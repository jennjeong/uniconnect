import { describe, expect, it } from "vitest"

import { dataUrlBytes, fileSize } from "./documents"

describe("documents", () => {
  it("counts the bytes a data URL carries", () => {
    expect(dataUrlBytes(`data:application/pdf;base64,${btoa("abc")}`)).toBe(3)
    expect(dataUrlBytes(`data:application/pdf;base64,${btoa("abcd")}`)).toBe(4)
    expect(dataUrlBytes(`data:application/pdf;base64,${btoa("abcde")}`)).toBe(5)
  })

  it("writes a file size in KB or MB", () => {
    expect(fileSize(300)).toBe("1KB")
    expect(fileSize(200 * 1024)).toBe("200KB")
    expect(fileSize(1.5 * 1024 * 1024)).toBe("1.5MB")
  })
})
