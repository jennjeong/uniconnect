import { describe, expect, test } from "vitest"

import { franchiseOf } from "./franchises"

describe("chains", () => {
  test("are found by how a branch's name starts", () => {
    expect(franchiseOf("CU 삼육대생활관점")).toBe("cu")
    expect(franchiseOf("GS25 공릉점")).toBe("gs25")
    expect(franchiseOf("세븐일레븐 태릉입구역점")).toBe("seven-eleven")
    expect(franchiseOf("이마트24 노원점")).toBe("emart24")
    expect(franchiseOf("매머드익스프레스 삼육대바울관점")).toBe("mammoth")
    expect(franchiseOf("메가MGC커피 공릉역점")).toBe("mega-mgc")
    expect(franchiseOf("이디야커피 삼육대점")).toBe("ediya")
    expect(franchiseOf("컴포즈커피 광운대점")).toBe("compose")
  })

  test("leave other shops, even ones that start alike, without a logo", () => {
    expect(franchiseOf("스마일하우스")).toBeUndefined()
    expect(franchiseOf("CUBE 스터디카페")).toBeUndefined()
    expect(franchiseOf("매머드 정육점")).toBeUndefined()
    expect(franchiseOf("빽다방 공릉점")).toBeUndefined()
  })
})
