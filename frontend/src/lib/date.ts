// Calendar helpers. Days travel as "YYYY-MM-DD" strings (the API's format)
// and become local Dates only for display, so time zones never shift a day.

export const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"]

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

// "10월 12일 (월)"
export function formatDay(iso: string) {
  const date = fromIsoDate(iso)
  if (!date) return iso
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdayNames[date.getDay()]})`
}

// "2026. 10. 12. (월)"
export function formatFullDate(iso: string) {
  const date = fromIsoDate(iso)
  if (!date) return iso
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. (${weekdayNames[date.getDay()]})`
}

// Whole days from today (or `from`) until an "YYYY-MM-DD" day.
export function daysUntil(iso: string, from = todayIso()) {
  const start = fromIsoDate(from)
  const end = fromIsoDate(iso)
  if (!start || !end) return 0
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

// The earliest event from today on.
export function nextEvent<T extends { date: string }>(events: T[]) {
  const today = todayIso()
  return events
    .filter((event) => fromIsoDate(event.date) && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
}

// "10.12 19:41" in local time, for an ISO timestamp.
export function formatDateTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return `${date.getMonth() + 1}.${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
