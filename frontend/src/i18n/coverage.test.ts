import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { en } from "./en"

// Every sentence the code passes to t() as written has English in i18n/en,
// so an English screen shows no Korean by mistake. (Sentences picked from
// lists, such as t(label), are checked by their own tests.)
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
}

describe("English copy", () => {
  test("covers every sentence passed to t()", () => {
    const missing = [...keys].filter(([key]) => !(key in en)).map(([key, file]) => `${file}: ${key}`)
    expect(missing).toEqual([])
  })

  test("keeps each {placeholder} of the Korean", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    const broken = Object.entries(en).filter(([ko, english]) => names(ko).join() !== names(english).join())
    expect(broken.map(([ko]) => ko)).toEqual([])
  })
})
