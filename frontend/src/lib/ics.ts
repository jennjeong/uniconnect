// 행사를 종일 일정으로 담은 달력 파일(iCalendar, RFC 5545). Google Calendar,
// Apple Calendar, Outlook이 가져갈 수 있으며, 각 일정에 전날 오전 9시 알림이
// 붙는다.

export type CalendarEntry = {
  // 일정들 사이에서 고유하다. @uniconnect를 붙여 전역 고유로 만든다.
  id: string
  title: string
  // "YYYY-MM-DD"이며, 여러 날에 걸치면 마지막 날이다.
  date: string
  endDate?: string
  description?: string
}

// 달력 파일 안의 텍스트: 역슬래시, 세미콜론, 쉼표를 이스케이프하고 모든
// 줄바꿈(단독 캐리지 리턴 포함)을 \n으로 써서, 값이 혼자 한 줄을 시작하지
// 못하게 한다.
const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n")

export const compact = (date: string) => date.replace(/-/g, "")

// "YYYY-MM-DD" 날짜의 다음 날: 종일 일정이 끝나는 날.
export function nextDay(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}

// 75옥텟을 넘는 줄은 앞에 공백을 붙여 다음 줄로 잇는다. 한글은 한 글자에
// 3옥텟이므로 바이트로 재며, 글자 중간에서 자르지 않는다.
function fold(line: string) {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ""
  for (const letter of line) {
    const limit = parts.length === 0 ? 75 : 74
    if (encoder.encode(current + letter).length > limit) {
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
      // 마지막 날의 다음 날. 종일 일정은 그날 자정에 끝나기 때문이다.
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
