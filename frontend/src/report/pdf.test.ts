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

  test("drop characters that change how the name reads, such as a right-to-left override", () => {
    // 'gpj.exe' 앞의 U+202E는 이름 뒤쪽을 거꾸로 보이게 한다. 폭 없는 문자와 C1 제어 문자도 지운다.
    const name = pdfFileName("성과 리포트", "공연\u202Egpj.exe\u200B\u2066\u0085\uFEFF", "2026-11-09")
    expect(name).toBe("uniconnect-성과 리포트-공연gpj.exe-2026-11-09.pdf")
    expect(name).not.toMatch(/[\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/)
  })

  test("cut a long name by characters, never inside an emoji", () => {
    const name = pdfFileName("성과 분석", `${"가".repeat(59)}🎉🎉`, "2026-11-09")
    expect(name).toBe(`uniconnect-성과 분석-${"가".repeat(59)}🎉-2026-11-09.pdf`)
  })

  test("leave out an empty name instead of a double dash", () => {
    expect(pdfFileName("성과 분석", "  ", "2026-11-09")).toBe("uniconnect-성과 분석-2026-11-09.pdf")
  })
})
