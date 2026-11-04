import { inRegion, type Region } from "../data/universities"
import { t } from "../i18n"
import type { Match } from "../types"

// 단체 카탈로그의 필터: 다음 행사의 규모, 시기, 종류, 지역과 학교(""는 전체).
export type GroupFilters = {
  size: "all" | "small" | "medium" | "large" | "unknown"
  when: "all" | "thisMonth" | "nextMonth" | "later" | "unknown"
  // 광역시·도나 시(data/universities.ts)와 그 안의 학교. 비워 두면 전체.
  region: Region | ""
  school: string
  // 다음 행사의 종류 (data/eventDetails.ts). 비워 두면 전체.
  kind: string
}

export const noGroupFilters: GroupFilters = { size: "all", when: "all", region: "", school: "", kind: "" }

// 리스팅이 검색창에 입력한 모든 단어를 가졌는지 여부: 이름, 종류(저장된 대로
// 또는 보이는 대로), 제공 내용, 태그, 학교, 다음 행사에서 찾는다.
export function matchesQuery(match: Match, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = [match.name, match.category, t(match.category), match.offer, match.school, match.eventName, match.eventKind, ...match.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return words.every((word) => text.includes(word))
}

// YYYY-MM 달의 다음 달.
const nextMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number)
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`
}

// 학생단체가 필터를 통과하는지 여부. 다음 행사의 규모와 월을 오늘(YYYY-MM-DD)에
// 비춰 잰다.
export function matchesGroupFilters(group: Match, filters: GroupFilters, today: string) {
  const audience = group.audience
  const size =
    audience === undefined ? "unknown" : audience < 100 ? "small" : audience < 300 ? "medium" : "large"
  if (filters.size !== "all" && filters.size !== size) return false

  const month = group.eventDate?.slice(0, 7)
  const thisMonth = today.slice(0, 7)
  const when =
    month === undefined
      ? "unknown"
      : month <= thisMonth
        ? "thisMonth"
        : month === nextMonth(thisMonth)
          ? "nextMonth"
          : "later"
  if (filters.when !== "all" && filters.when !== when) return false

  if (filters.kind && group.eventKind !== filters.kind) return false
  if (filters.region && !inRegion(group.school, filters.region)) return false
  return !filters.school || group.school === filters.school
}
