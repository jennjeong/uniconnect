import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// 빌드할 때(vite.config.ts) 첫 화면에 쓰는 영어만 골라 낸다. main.tsx에서 정적
// import로 닿는 모든 소스(첫 다운로드)를 따라가며, 그 안의 문자열 중 사전에
// 있는 것을 모은다. t("…")뿐 아니라 목록 값(t(label))처럼 문자열로 적힌 것도
// 잡도록 넉넉히 모으고, 날짜 · 역할 · 상태 같은 공통 문장(common)은 모두 넣는다.
// 동적 import(lazyPage의 화면과 팝업)는 따라가지 않는다. 그것들은 열릴 때
// 사전 전체를 기다린다.
export function firstScreenModules(entry: string) {
  const seen = new Set<string>()
  const resolve = (from: string, spec: string) => {
    const base = path.resolve(path.dirname(from), spec)
    return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")].find(
      (candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate),
    )
  }
  const walk = (file: string) => {
    if (seen.has(file) || file.includes(`${path.sep}i18n${path.sep}en${path.sep}`)) return
    seen.add(file)
    const source = readFileSync(file, "utf8")
    // 문장마다: import · export로 시작하는 줄부터 다음 그런 줄 앞까지. 타입만
    // 가져오는 것(import type)은 번들에 들어가지 않으므로 따라가지 않는다.
    for (const statement of source.split(/^(?=(?:import|export)\s)/m)) {
      if (/^(?:import|export)\s+type\s/.test(statement)) continue
      const match = /^(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']|^import\s+["'](\.[^"']+)["']/.exec(statement)
      const next = match && resolve(file, match[1] ?? match[2])
      if (next) walk(next)
    }
  }
  walk(entry)
  return [...seen]
}

export function firstScreenEnglish(entry: string, en: Record<string, string>, common: Record<string, string>) {
  const first: Record<string, string> = { ...common }
  const places = new Map<string, string[]>()
  for (const key of Object.keys(en)) {
    const at = key.lastIndexOf("@")
    if (at > 0) places.set(key.slice(0, at), [...(places.get(key.slice(0, at)) ?? []), key])
  }
  for (const file of firstScreenModules(entry)) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(/(["'`])((?:\\.|(?!\1).)*?)\1/gs)) {
      const text = match[2].replace(/\\(["'`\\])/g, "$1")
      if (Object.prototype.hasOwnProperty.call(en, text)) first[text] = en[text]
      for (const key of places.get(text) ?? []) first[key] = en[key]
    }
  }
  return first
}
