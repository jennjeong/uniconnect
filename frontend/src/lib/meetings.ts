import type { Meeting } from "../types"

// A meeting's start and end as instants: its day and time are Korean (UTC+9,
// with no summer time), so they move nine hours back to UTC.
export function meetingSpan(meeting: Pick<Meeting, "date" | "time" | "minutes">) {
  const [year, month, day] = meeting.date.split("-").map(Number)
  const [hour, minute] = meeting.time.split(":").map(Number)
  const start = new Date(Date.UTC(year, month - 1, day, hour - 9, minute))
  return { start, end: new Date(start.getTime() + meeting.minutes * 60_000) }
}

// "20261112T050000Z", as calendars write an instant.
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

// Google Calendar's page for adding the meeting as a timed entry.
export function googleMeetingLink(meeting: Meeting, title: string) {
  const { start, end } = meetingSpan(meeting)
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    location: meeting.place,
    ctz: "Asia/Seoul",
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")

// The meeting as a calendar file (iCalendar) any calendar app opens, with a
// reminder half an hour before.
export function meetingIcs(meeting: Meeting, title: string, id: string) {
  const { start, end } = meetingSpan(meeting)
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//uniconnect//meeting//KO",
    "BEGIN:VEVENT",
    `UID:meeting-${id}@uniconnect`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(title)}`,
    `LOCATION:${escapeText(meeting.place)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(title)}`,
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n")
}
