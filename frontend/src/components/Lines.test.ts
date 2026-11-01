import { describe, expect, test } from "vitest"

import { splitLines } from "./Lines"

describe("copy lines", () => {
  test("a comma ends a line and goes; a full stop or question ends one and stays", () => {
    expect(splitLines("학교 · 회사 이메일로 가입하고, 소개와 행사를 올려요.")).toEqual(["학교 · 회사 이메일로 가입하고", "소개와 행사를 올려요."])
    expect(splitLines("다른 단체는 어떻게 협찬받았을까요? 행사를 보고 참고해요.")).toEqual(["다른 단체는 어떻게 협찬받았을까요?", "행사를 보고 참고해요."])
    expect(splitLines("참여 1,000명이 왔어요")).toEqual(["참여 1,000명이 왔어요"])
  })

  test("dates, listed words, brackets, abbreviations and short pieces keep the line going", () => {
    expect(splitLines("다음 행사 '2026 뮤즈 종강 공연'은 2026. 11. 27. (금)이에요. 지금은 '매칭 · 제안' 단계예요.")).toEqual([
      "다음 행사 '2026 뮤즈 종강 공연'은 2026. 11. 27. (금)이에요.",
      "지금은 '매칭 · 제안' 단계예요.",
    ])
    expect(splitLines("네, 바로 보낼 수 있어요.")).toEqual(["네, 바로 보낼 수 있어요."])
    expect(splitLines("쿠폰, 방문, 예상 매출을 성과 분석에서 확인해요.")).toEqual(["쿠폰, 방문, 예상 매출을 성과 분석에서 확인해요."])
    expect(splitLines("e.g. Gongneung Stn. Exit 2 · 1.2 km from campus")).toEqual(["e.g. Gongneung Stn. Exit 2 · 1.2 km from campus"])
    expect(splitLines("If it can't go ahead (the event is canceled, say), you can call it off with the other side's agreement.")).toEqual([
      "If it can't go ahead (the event is canceled, say)",
      "you can call it off with the other side's agreement.",
    ])
    expect(splitLines("The next event is on Nov 27, 2026. It is in matching.")).toEqual(["The next event is on Nov 27, 2026.", "It is in matching."])
  })
})
