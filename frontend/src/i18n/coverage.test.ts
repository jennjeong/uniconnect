import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { en } from "./en"
import analytics from "./en/analytics"
import catalog from "./en/catalog"
import common from "./en/common"
import dashboard from "./en/dashboard"
import forms from "./en/forms"
import landing from "./en/landing"
import layout from "./en/layout"
import legal from "./en/legal"
import measurement from "./en/measurement"

const areas = { common, layout, dashboard, catalog, measurement, analytics, forms, landing, legal }

// 코드가 t()에 쓰인 그대로 넘기는 모든 문장에는 i18n/en에 영어가 있어서, 영어
// 화면에 실수로 한국어가 나오지 않는다. (t(label)처럼 목록에서 고른 문장은 자체
// 테스트가 검사한다.)
const root = path.resolve(__dirname, "..")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === "i18n" ? [] : sourceFiles(full)
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : []
  })
}

const keys = new Map<string, string>()
for (const file of sourceFiles(root)) {
  const source = readFileSync(file, "utf8")
  for (const match of source.matchAll(/\bt\(\s*(["'`])((?:\\.|(?!\1).)*?)\1/gs)) {
    if (match[1] === "`" && match[2].includes("${")) continue
    keys.set(match[2].replace(/\\(["'`\\])/g, "$1"), path.relative(root, file))
  }
  // tc("place", "…")는 그 place의 영어가 필요하다.
  for (const match of source.matchAll(/\btc\(\s*"(\w+)"\s*,\s*"((?:\\.|[^"\\])*)"/g)) {
    keys.set(`${match[2]}@${match[1]}`, path.relative(root, file))
  }
}

describe("English copy", () => {
  test("covers every sentence passed to t()", () => {
    const missing = [...keys].filter(([key]) => !(key in en)).map(([key, file]) => `${file}: ${key}`)
    expect(missing).toEqual([])
  })

  test("gives each Korean sentence one English across the area files", () => {
    const seen = new Map<string, string>()
    const differ: string[] = []
    for (const [area, dictionary] of Object.entries(areas)) {
      for (const [ko, english] of Object.entries(dictionary)) {
        const before = seen.get(ko)
        if (before !== undefined && before !== english) differ.push(`${area}: ${ko} (${before} / ${english})`)
        seen.set(ko, english)
      }
    }
    expect(differ).toEqual([])
  })

  test("keeps each {placeholder} of the Korean", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)(?::[^{}]*)?\}/g)].map((match) => match[1]).sort()
    const broken = Object.entries(en).filter(([ko, english]) => names(ko).join() !== names(english).join())
    expect(broken.map(([ko]) => ko)).toEqual([])
  })
})
