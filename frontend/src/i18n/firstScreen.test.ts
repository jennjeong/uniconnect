import path from "node:path"

import { describe, expect, test } from "vitest"

import { en } from "./en"
import common from "./en/common"
import { firstScreenEnglish, firstScreenModules } from "./firstScreen"

// 빌드가 첫 화면 전에 받는 영어(vite.config.ts의 englishFirst)는 첫 다운로드의
// 소스를 따라가 고른다. 지연 화면은 빠지고, 첫 화면의 문장은 들어가야 한다.
const entry = path.resolve(__dirname, "../main.tsx")
const modules = firstScreenModules(entry).map((file) => path.relative(path.resolve(__dirname, ".."), file))

describe("English for the first screen", () => {
  test("follows static imports and skips lazy screens and type-only imports", () => {
    expect(modules).toContain("App.tsx")
    expect(modules).toContain("components/LandingHero.tsx")
    expect(modules).toContain("modals/LoginModal.tsx")
    expect(modules).not.toContain("pages/AgreementPage.tsx")
    expect(modules).not.toContain("pages/ProfilePage.tsx")
  })

  test("keeps the first screen's sentences and leaves out the rest", () => {
    const first = firstScreenEnglish(entry, en, common)
    expect(first["캠퍼스 행사 협찬을"]).toBe(en["캠퍼스 행사 협찬을"])
    for (const key of Object.keys(common)) expect(first[key]).toBe(common[key])
    expect(Object.keys(first).length).toBeLessThan(Object.keys(en).length / 2)
  })
})
