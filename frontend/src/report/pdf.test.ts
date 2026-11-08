import { describe, expect, test } from "vitest"

import { pdfFileName } from "./pdf"

describe("PDF file names", () => {
  test("carry what it is, the event or campaign and the day it was made", () => {
    expect(pdfFileName("성과 리포트", "2026 뮤즈 종강 공연", "2026-11-09")).toBe("uniconnect-성과 리포트-2026 뮤즈 종강 공연-2026-11-09.pdf")
  })

  test("drop characters a file name can't hold and keep long names short", () => {
    const name = pdfFileName("협찬 제안서", 'A/B: "축제"?\n<본선>|*', "2026-11-09")
    expect(name).toBe("uniconnect-협찬 제안서-A B 축제 본선-2026-11-09.pdf")
    const long = pdfFileName("성과 분석", "가".repeat(100), "2026-11-09")
    expect(long).toBe(`uniconnect-성과 분석-${"가".repeat(60)}-2026-11-09.pdf`)
  })

  test("leave out an empty name instead of a double dash", () => {
    expect(pdfFileName("성과 분석", "  ", "2026-11-09")).toBe("uniconnect-성과 분석-2026-11-09.pdf")
  })
})
