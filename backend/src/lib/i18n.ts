import type { Request } from "express"

import en from "../i18n/en.js"

export type Lang = "ko" | "en"

// 답할 언어: 요청의 첫 언어가 한국어이면(또는 없으면) 한국어, 그 밖에는
// 영어다. 앱이 보여 주는 언어를 보낸다.
export function langOf(req: Request): Lang {
  const first = String(req.headers["accept-language"] ?? "").split(",")[0].trim().toLowerCase()
  return !first || first === "*" || first.startsWith("ko") ? "ko" : "en"
}

const escape = (text: string) => text.replace(/[.*+?^$()|[\]\\]/g, "\\$&")

// {name} 부분이 있는 키를 그 자리에 어떤 텍스트든 받는 패턴으로 둔다.
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

// 서버가 한국어로 쓴 메시지를 요청의 언어로 바꾼다. 이 파일에 있는 그대로
// 쓰거나, 패턴이 받는 부분을 영어로 바꿔 넣는다(가능하면 각 부분도 번역).
// 영어가 없으면 한국어 그대로다.
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
