import { en } from "./en"

export type Lang = "ko" | "en"

const storageKey = "uniconnect-lang"

// 보여줄 언어: 푸터의 스위치로 고른 것, 아니면 브라우저의 첫 언어가 한국어일
// 때는 한국어, 그 밖에는 영어. 브라우저 밖(단위 테스트)에서는 한국어로, 카피를
// 쓴 언어다.
function detect(): Lang {
  if (typeof window === "undefined") return "ko"
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === "ko" || saved === "en") return saved
  } catch {
    // 저장소가 없으면 브라우저의 언어가 정한다.
  }
  const first = navigator.languages?.[0] ?? navigator.language ?? "ko"
  return first.toLowerCase().startsWith("ko") ? "ko" : "en"
}

export const lang: Lang = detect()

// Intl 서식(숫자, 날짜)용.
export const locale = lang === "ko" ? "ko-KR" : "en-US"

// 푸터의 스위치: 선택을 기억하고 그 언어로 다시 불러온다.
export function setLang(next: Lang) {
  try {
    localStorage.setItem(storageKey, next)
  } catch {
    // 저장소가 없으면 선택은 이번 로드에서만 유지된다.
  }
  window.location.reload()
}

// 카피는 한국어로 쓰며 그것이 곧 키다. 영어에서는 사전(i18n/en)의 문장이 대신
// 나오고, 없으면 한국어가 나온다. 문장 안의 {name}은 어느 언어에서나 `values`로
// 채운다. {count:proposal|proposals}는 하나인지 여럿인지에 맞는 단어도 고른다
// ("1 proposal", "3 proposals").
export function t(ko: string, values?: Record<string, string | number>) {
  const text = lang === "en" ? (en[ko] ?? ko) : ko
  return fill(text, values)
}

// 영어가 어디에 나오느냐에 따라 달라지는 몇 안 되는 문장에 대한 같은 함수: 그
// 자리의 영어는 "korean@place"("목표@marker")를 키로 하고, 없는 자리에는 문장의
// 기본 영어가 쓰인다.
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
