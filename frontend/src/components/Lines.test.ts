import { describe, expect, test } from "vitest"

import { splitLines } from "./Lines"

describe("copy lines", () => {
  test("a comma ends a line and goes; a full stop or question ends one and stays", () => {
    expect(splitLines("학교 · 회사 이메일로 가입하고, 소개와 행사를 올려요.")).toEqual(["학교 · 회사 이메일로 가입하고", "소개와 행사를 올려요."])
    expect(splitLines("다른 단체는 어떻게 협찬받았을까요? 행사를 보고 참고해요.")).toEqual(["다른 단체는 어떻게 협찬받았을까요?", "행사를 보고 참고해요."])
    expect(splitLines("참여 1,000명이 왔어요")).toEqual(["참여 1,000명이 왔어요"])
  })
})
