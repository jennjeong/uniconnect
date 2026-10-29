// A calendar (iCalendar, RFC 5545) of all-day entries, each with a reminder
// at 9 a.m. the day before, in the same form as the file the app makes in
// the browser (frontend/src/lib/ics.ts): here for the calendar apps that
// subscribe to an account's link (routes/calendar.ts).

export type CalendarEntry = {
  // Unique among the entries; made global with @uniconnect.
  id: string
  title: string
  // "YYYY-MM-DD", and the last day when it runs over several.
  date: string
  endDate?: string
  description?: string
}

const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")

const compact = (date: string) => date.replace(/-/g, "")

// The day after a "YYYY-MM-DD" date: where an all-day entry ends.
function nextDay(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}

// Lines over 75 octets go on, a space ahead, on the next line; Korean takes
// three octets a letter, so it is measured in bytes, never split mid-letter.
function fold(line: string) {
  const parts: string[] = []
  let current = ""
  for (const letter of line) {
    const limit = parts.length === 0 ? 75 : 74
    if (Buffer.byteLength(current + letter) > limit) {
      parts.push(current)
      current = letter
    } else current += letter
  }
  parts.push(current)
  return parts.join("\r\n ")
}

export function calendarFile(entries: CalendarEntry[], name: string, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//uniconnect//Events//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
  ]
  for (const entry of entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${entry.id}@uniconnect`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(entry.date)}`,
      // The day after the last, as all-day entries end at its midnight.
      `DTEND;VALUE=DATE:${compact(nextDay(entry.endDate ?? entry.date))}`,
      `SUMMARY:${escapeText(entry.title)}`,
      ...(entry.description ? [`DESCRIPTION:${escapeText(entry.description)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(entry.title)}`,
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return `${lines.map(fold).join("\r\n")}\r\n`
}
