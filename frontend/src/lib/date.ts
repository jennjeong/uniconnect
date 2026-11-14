import { lang, t } from "../i18n"

// 달력 도우미. 날짜는 "YYYY-MM-DD" 문자열(API의 형식)로 오가고, 표시할 때만
// 로컬 Date가 되므로 시간대 때문에 하루가 밀리는 일이 없다.\n|표시하는 날짜는
// 부분들을 줄바꿈 없는 공백으로 이어서, 긴 줄에서 날짜가 쪼개지지 않고 통째로
// 다음 줄로 넘어가게 한다. 영어로는 "Oct 12 (Mon)"과 "Oct 12, 2026 (Mon)"처럼
// 읽힌다.

const nbsp = "\u00a0"

export const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"].map((day) => t(day))

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const pad = (value: number) => String(value).padStart(2, "0")

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// "YYYY-MM-DD" 날짜의 로컬 자정. 그 외 값이면 undefined.
export function fromIsoDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export const todayIso = () => toIsoDate(new Date())

// "YYYY-MM"의 짧은 이름: "5월" · "May", withYear면 "2026년 5월" · "May 2026".
export function monthLabel(month: string, withYear = false) {
  const [year, value] = month.split("-").map(Number)
  if (lang === "en") return withYear ? `${monthNames[value - 1]}${nbsp}${year}` : monthNames[value - 1]
  return withYear ? `${year}년${nbsp}${value}월` : `${value}월`
}

// "YYYY-MM-DD" 날짜에서 며칠 뒤의 "YYYY-MM-DD".
export function addDaysIso(iso: string, days: number) {
  const day = fromIsoDate(iso) ?? new Date()
  day.setDate(day.getDate() + days)
  return toIsoDate(day)
}

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

// "10월 12일 (월)", "Oct 12 (Mon)"
export function formatDay(iso: string) {
  const date = fromIsoDate(iso)
  if (!date) return iso
  const weekday = `(${weekdayNames[date.getDay()]})`
  if (lang === "en") return [monthNames[date.getMonth()], date.getDate(), weekday].join(nbsp)
  return `${date.getMonth() + 1}월${nbsp}${date.getDate()}일${nbsp}${weekday}`
}

// 달력에서 뜯어낸 한 장처럼 보이는 날짜: 월("11월", "Nov"), 일, 요일("금",
// "Fri").
export function calendarPage(iso: string) {
  const date = fromIsoDate(iso) ?? new Date()
  return {
    month: lang === "en" ? monthNames[date.getMonth()] : `${date.getMonth() + 1}월`,
    day: date.getDate(),
    weekday: weekdayNames[date.getDay()],
  }
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

// 오늘(또는 `from`)부터 "YYYY-MM-DD" 날짜까지 남은 일수.
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

// "D-25", "D-DAY", 날짜가 지났다면 "종료".
export function dDayLabel(iso: string) {
  const days = daysUntil(iso)
  return days > 0 ? `D-${days}` : days === 0 ? "D-DAY" : t("종료")
}

// 오늘부터 가장 가까운 행사. 여러 날에 걸친 행사는 마지막 날까지 센다.
export function nextEvent<T extends { date: string; endDate?: string }>(events: T[]) {
  return upcomingEvents(events)[0]
}

// 아직 끝나지 않은(오늘이 마지막 날 이전이거나 그날인) 일정, 가까운 순. 날짜는
// 한국 날짜(todayIso)로 비교하고 기간 일정은 마지막 날까지 다가오는 일정이다.
export function upcomingEvents<T extends { date: string; endDate?: string }>(events: T[], today = todayIso()) {
  return events
    .filter((event) => fromIsoDate(event.date) && (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// `start`부터 `end`까지 양 끝을 포함한 모든 "YYYY-MM-DD" 날짜.
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

// ISO 타임스탬프를 로컬 시간으로 나타낸 "10.12 19:41" ("Oct 12 19:41").
export function formatDateTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (lang === "en") return [monthNames[date.getMonth()], date.getDate(), time].join(nbsp)
  return `${date.getMonth() + 1}.${date.getDate()}${nbsp}${time}`
}

// `month`가 속한 달을 채우는 주(일요일 시작)들.
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

// 오늘(또는 `date`)의 "2026 FALL SEMESTER".
export function semesterLabel(date = new Date()) {
  const month = date.getMonth() + 1
  const season = month >= 9 ? "FALL" : month >= 7 ? "SUMMER" : month >= 3 ? "SPRING" : "WINTER"
  return `${date.getFullYear()} ${season} SEMESTER`
}
