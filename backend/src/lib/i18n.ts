import type { Request } from "express"

import en from "../i18n/en.js"

export type Lang = "ko" | "en"

// The language to answer in: Korean when the request's first language is
// Korean (or none is given), English for any other. The app sends the one
// it shows.
export function langOf(req: Request): Lang {
  const first = String(req.headers["accept-language"] ?? "").split(",")[0].trim().toLowerCase()
  return !first || first === "*" || first.startsWith("ko") ? "ko" : "en"
}

const escape = (text: string) => text.replace(/[.*+?^$()|[\]\\]/g, "\\$&")

// Keys with {name} parts, as patterns that take any text in their place.
const patterns = Object.entries(en)
  .filter(([ko]) => /\{\w+\}/.test(ko))
  .map(([ko, english]) => {
    const names: string[] = []
    const source = escape(ko).replace(/\\?\{(\w+)\\?\}/g, (_whole, name: string) => {
      names.push(name)
      return "(.+?)"
    })
    return { pattern: new RegExp(`^${source}$`), names, english }
  })

// A message the server wrote in Korean, in the request's language: as this
// file has it, or with the parts a pattern takes put into its English (each
// translated too where it can be); Korean when there is no English.
export function translate(message: string, lang: Lang): string {
  if (lang === "ko") return message
  if (Object.hasOwn(en, message)) return en[message]
  for (const { pattern, names, english } of patterns) {
    const match = pattern.exec(message)
    if (!match) continue
    return names.reduce(
      (text, name, index) => text.replace(`{${name}}`, translate(match[index + 1], lang)),
      english,
    )
  }
  return message
}
