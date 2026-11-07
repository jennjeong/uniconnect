import { describe, expect, test } from "vitest"

import { checklistSteps } from "./checklist"
import type { Match } from "../types"

describe("the new member's checklist", () => {
  const listing: Match = { id: "brand-1", name: "첫 카페", category: "카페 · 식음료", industry: "cafe", offer: "", score: 70, tags: [] }

  test("a member with nothing written has every step left, a brand its store too", () => {
    expect(checklistSteps("학생단체", null, false).map((step) => [step.key, step.done])).toEqual([
      ["intro", false],
      ["logo", false],
      ["tags", false],
      ["sns", false],
      ["portfolio", false],
      ["event", false],
    ])
    expect(checklistSteps("브랜드", null, false).map((step) => step.key)).toContain("address")
  })

  test("each step is done once its part is filled in", () => {
    const filled: Match = {
      ...listing,
      intro: "대학가에서 학생 행사를 돕는 카페예요.",
      logo: "data:image/webp;base64,AAAA",
      location: { address: "서울 노원구 화랑로 815" },
      tags: ["커피"],
      sns: [{ platform: "Instagram", handle: "@first_cafe" }],
      portfolio: [{ title: "축제 부스", detail: "쿠폰 100장" }],
    }
    expect(checklistSteps("브랜드", filled, true).every((step) => step.done)).toBe(true)
    expect(checklistSteps("브랜드", { ...filled, sns: [] }, true).filter((step) => !step.done).map((step) => step.key)).toEqual(["sns"])
  })

  test("adds a first proposal step only when it's asked for", () => {
    expect(checklistSteps("브랜드", null, false).some((step) => step.key === "proposal")).toBe(false)
    expect(checklistSteps("브랜드", null, false, false).at(-1)).toEqual({ key: "proposal", done: false })
    expect(checklistSteps("학생단체", null, true, true).at(-1)).toEqual({ key: "proposal", done: true })
  })
})
