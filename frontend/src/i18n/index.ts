import { en } from "./en"

export type Lang = "ko" | "en"

const storageKey = "uniconnect-lang"

// The language shown: the one picked with the footer's switch, else Korean
// when the browser's first language is Korean and English for any other.
// Outside a browser (the unit tests) it is Korean, the language the copy is
// written in.
function detect(): Lang {
  if (typeof window === "undefined") return "ko"
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === "ko" || saved === "en") return saved
  } catch {
    // Without storage the browser's language decides.
  }
  const first = navigator.languages?.[0] ?? navigator.language ?? "ko"
  return first.toLowerCase().startsWith("ko") ? "ko" : "en"
}

export const lang: Lang = detect()

// For Intl formatting (numbers, dates).
export const locale = lang === "ko" ? "ko-KR" : "en-US"

// The footer's switch: remembers the choice and reloads in that language.
export function setLang(next: Lang) {
  try {
    localStorage.setItem(storageKey, next)
  } catch {
    // Without storage the choice lasts for this load only.
  }
  window.location.reload()
}

// The copy is written in Korean, which is also its key: in English the
// dictionary's sentence (i18n/en) shows instead, and the Korean where there
// is none. {name} in a sentence is filled from `values`, in either language.
export function t(ko: string, values?: Record<string, string | number>) {
  const text = lang === "en" ? (en[ko] ?? ko) : ko
  if (!values) return text
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole))
}
