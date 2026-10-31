import { t } from "../i18n"
import type { Match } from "../types"

// The group catalog's filters: how big the next event is, when it is, and
// the school ("" for any).
export type GroupFilters = {
  size: "all" | "small" | "medium" | "large" | "unknown"
  when: "all" | "thisMonth" | "nextMonth" | "later" | "unknown"
  school: string
  // The next event's kind (data/eventDetails.ts); empty for any.
  kind: string
}

export const noGroupFilters: GroupFilters = { size: "all", when: "all", school: "", kind: "" }

// Whether a listing has every word typed into the search box, in its name,
// kind (as stored or as shown), offer, tags, school or next event.
export function matchesQuery(match: Match, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = [match.name, match.category, t(match.category), match.offer, match.school, match.eventName, match.eventKind, ...match.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return words.every((word) => text.includes(word))
}

// The month after a YYYY-MM month.
const nextMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number)
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`
}

// Whether a student group passes the filters, its next event's size and
// month measured against today (YYYY-MM-DD).
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
  return !filters.school || group.school === filters.school
}
