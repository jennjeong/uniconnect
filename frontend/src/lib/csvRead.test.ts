import { describe, expect, it } from "vitest"

import { importRows, parseCsv } from "./csvRead"

describe("reading a CSV for bulk import", () => {
  it("handles quotes, commas, line breaks, a BOM and blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n,\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ])
  })

  it("maps the template's headers in any order and refuses a file without them", () => {
    const rows = importRows(parseCsv('이름,구분,유형,태그\n가온 밴드,학생단체,공연 동아리,"공연, 음악"\n'))
    expect(rows).toEqual([{ side: "학생단체", name: "가온 밴드", type: "공연 동아리", place: "", intro: "", offer: "", tags: "공연, 음악" }])
    expect(importRows(parseCsv("name,type\na,b\n"))).toBeNull()
  })
})
