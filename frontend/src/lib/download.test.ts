import { describe, expect, test } from "vitest"

import { safeFileName } from "./download"

describe("download file names", () => {
  test("an uploaded name keeps its words but loses direction overrides and reserved characters", () => {
    // '기획안' 뒤에 오른쪽에서 왼쪽으로 바꾸는 문자(U+202E)를 넣으면 저장 창에서 이름 끝이
    // 거꾸로 보여 다른 종류의 파일처럼 보일 수 있다. 소스에는 이스케이프로만 쓴다.
    expect(safeFileName("기획안\u202Efdp.exe")).toBe("기획안fdp.exe")
    expect(safeFileName("자료\u200B\u2066\u0085\uFEFF.pdf")).toBe("자료.pdf")
    expect(safeFileName("종강공연 기획안.pdf")).toBe("종강공연 기획안.pdf")
    expect(safeFileName('a/b:c*?"<>|.pdf')).toBe("a b c .pdf")
  })
})
