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
// is none. {name} in a sentence is filled from `values`, in either language;
// {count:proposal|proposals} also picks the word for one or more ("1
// proposal", "3 proposals").
export function t(ko: string, values?: Record<string, string | number>) {
  const text = lang === "en" ? (en[ko] ?? ko) : ko
  return fill(text, values)
}

// The same, for one of the few sentences whose English depends on where it
// shows: its English for that place is keyed "korean@place" ("목표@marker"),
// and the sentence's plain English stands in where there is none.
export function tc(place: string, ko: string, values?: Record<string, string | number>) {
  const text = lang === "en" ? (en[`${ko}@${place}`] ?? en[ko] ?? ko) : ko
  return fill(text, values)
}

function fill(text: string, values?: Record<string, string | number>) {
  if (!values) return text
  return text.replace(/\{(\w+)(?::([^|{}]*)\|([^{}]*))?\}/g, (whole, key: string, one?: string, many?: string) => {
    if (!(key in values)) return whole
    const value = String(values[key])
    if (one === undefined || many === undefined) return value
    return `${value} ${Number(value.replace(/,/g, "")) === 1 ? one : many}`
  })
}
