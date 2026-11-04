import { compact, nextDay, type CalendarEntry } from "./ics"

export type CalendarApp = "google" | "apple" | "outlook" | "other"

// 캘린더에 추가가 제안하는 캘린더 앱을 순서대로: Google Calendar와 Outlook은 각
// 일정의 추가 페이지를 연다(링크를 받는 앱이면 그 앱에서). Apple Calendar와
// 나머지(Samsung, Naver)는 고른 일정을 한꺼번에 담은 캘린더 파일(lib/ics.ts)을
// 연다.
export const calendarApps: { id: CalendarApp; label: string }[] = [
  { id: "google", label: "Google 캘린더" },
  { id: "apple", label: "Apple 캘린더" },
  { id: "outlook", label: "Outlook" },
  { id: "other", label: "다른 앱" },
]

export const opensEach = (app: CalendarApp) => app === "google" || app === "outlook"

// Google Calendar의 종일 일정 하나 추가 페이지.
export function googleCalendarLink(entry: CalendarEntry) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    dates: `${compact(entry.date)}/${compact(nextDay(entry.endDate ?? entry.date))}`,
    ctz: "Asia/Seoul",
  })
  if (entry.description) params.set("details", entry.description)
  return `https://calendar.google.com/calendar/render?${params}`
}

// Outlook의 종일 일정 하나 추가 페이지.
export function outlookCalendarLink(entry: CalendarEntry) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    allday: "true",
    subject: entry.title,
    startdt: entry.date,
    enddt: nextDay(entry.endDate ?? entry.date),
  })
  if (entry.description) params.set("body", entry.description)
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`
}

// 지난번에 고른 앱. 이 브라우저에만 보관한다.
const storageKey = "uniconnect-calendar-app"

export function lastCalendarApp(): CalendarApp | null {
  try {
    const saved = localStorage.getItem(storageKey)
    return calendarApps.find((app) => app.id === saved)?.id ?? null
  } catch {
    return null
  }
}

export function rememberCalendarApp(app: CalendarApp) {
  try {
    localStorage.setItem(storageKey, app)
  } catch {
    // 저장소가 없으면 목록은 다음에도 고르지 않은 상태로 시작한다.
  }
}
