import { lang, t } from "../i18n"

// Calendar helpers. Days travel as "YYYY-MM-DD" strings (the API's format)
// and become local Dates only for display, so time zones never shift a day.
// Displayed dates join their parts with no-break spaces, so a long line
// moves a date to the next line whole instead of splitting it. In English
// they read "Oct 12 (Mon)" and "Oct 12, 2026 (Mon)".

const nbsp = "\u00a0"

export const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"].map((day) => t(day))

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const pad = (value: number) => String(value).padStart(2, "0")

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Local midnight of an "YYYY-MM-DD" day, or undefined for anything else.
export function fromIsoDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export const todayIso = () => toIsoDate(new Date())

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

// "10월 12일 (월)", "Oct 12 (Mon)"
export function formatDay(iso: string) {
  const date = fromIsoDate(iso)
  if (!date) return iso
  const weekday = `(${weekdayNames[date.getDay()]})`
  if (lang === "en") return [monthNames[date.getMonth()], date.getDate(), weekday].join(nbsp)
  return `${date.getMonth() + 1}월${nbsp}${date.getDate()}일${nbsp}${weekday}`
}

// "2026. 10. 12. (월)", "Oct 12, 2026 (Mon)"
export function formatFullDate(iso: string) {
  const date = fromIsoDate(iso)
  if (!date) return iso
  const weekday = `(${weekdayNames[date.getDay()]})`
  if (lang === "en") return [monthNames[date.getMonth()], `${date.getDate()},`, date.getFullYear(), weekday].join(nbsp)
  const parts = [`${date.getFullYear()}.`, `${date.getMonth() + 1}.`, `${date.getDate()}.`]
  return `${parts.join(nbsp)}${nbsp}${weekday}`
}

// Whole days from today (or `from`) until an "YYYY-MM-DD" day.
export function daysUntil(iso: string, from = todayIso()) {
  const start = fromIsoDate(from)
  const end = fromIsoDate(iso)
  if (!start || !end) return 0
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

// "11.15", "Nov 15"
export function shortDay(iso: string) {
  const date = fromIsoDate(iso)
  if (!date) return iso
  return lang === "en" ? `${monthNames[date.getMonth()]}${nbsp}${date.getDate()}` : `${date.getMonth() + 1}.${date.getDate()}`
}

// "D-25", "D-DAY", or "종료" once the day has passed.
export function dDayLabel(iso: string) {
  const days = daysUntil(iso)
  return days > 0 ? `D-${days}` : days === 0 ? "D-DAY" : t("종료")
}

// The earliest event from today on; one over several days counts until
// its last day.
export function nextEvent<T extends { date: string; endDate?: string }>(events: T[]) {
  const today = todayIso()
  return events
    .filter((event) => fromIsoDate(event.date) && (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
}

// Every "YYYY-MM-DD" day from `start` to `end`, both included.
export function daysOf(start: string, end = start) {
  const first = fromIsoDate(start)
  const last = fromIsoDate(end)
  if (!first || !last) return [start]
  const days: string[] = []
  for (const day = first; day <= last; day.setDate(day.getDate() + 1)) days.push(toIsoDate(day))
  return days
}

// "11월 27일 (금) ~ 11월 29일 (일) · 3일", or one day as formatDay.
export function formatPeriod(start: string, end?: string) {
  if (!end || end === start) return formatDay(start)
  return `${formatDay(start)} ~ ${formatDay(end)} · ${t("{days}일", { days: daysOf(start, end).length })}`
}

// "10.12 19:41" ("Oct 12 19:41") in local time, for an ISO timestamp.
export function formatDateTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (lang === "en") return [monthNames[date.getMonth()], date.getDate(), time].join(nbsp)
  return `${date.getMonth() + 1}.${date.getDate()}${nbsp}${time}`
}

// Whole weeks (Sunday first) covering the month of `month`.
export function calendarDays(month: Date) {
  const first = startOfMonth(month)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7)
  return Array.from(
    { length: weeks * 7 },
    (_, index) =>
      new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + index),
  )
}

// "2026 FALL SEMESTER" for today (or `date`).
export function semesterLabel(date = new Date()) {
  const month = date.getMonth() + 1
  const season = month >= 9 ? "FALL" : month >= 7 ? "SUMMER" : month >= 3 ? "SPRING" : "WINTER"
  return `${date.getFullYear()} ${season} SEMESTER`
}
