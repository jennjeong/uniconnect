import { compact, nextDay, type CalendarEntry } from "./ics"

export type CalendarApp = "google" | "apple" | "outlook" | "other"

// The calendar apps 캘린더에 추가 offers, in order: Google Calendar and
// Outlook open each entry's own add page (in their app where it takes the
// link), Apple Calendar and the rest (Samsung's, Naver's) open the calendar
// file (lib/ics.ts) with the picked entries at once.
export const calendarApps: { id: CalendarApp; label: string }[] = [
  { id: "google", label: "Google 캘린더" },
  { id: "apple", label: "Apple 캘린더" },
  { id: "outlook", label: "Outlook" },
  { id: "other", label: "다른 앱" },
]

export const opensEach = (app: CalendarApp) => app === "google" || app === "outlook"

// Google Calendar's page for adding one all-day entry.
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

// Outlook's page for adding one all-day entry.
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

// The app picked last time, kept in this browser only.
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
    // Without storage the list just starts unpicked next time.
  }
}
