// 종일 일정으로 된 캘린더(iCalendar, RFC 5545)이며 일정마다 하루 전
// 오전 9시 알림이 있다. 앱이 브라우저에서 만드는 파일과 같은 형식
// (frontend/src/lib/ics.ts)이고, 계정의 링크를 구독하는 캘린더 앱을 위해
// 여기에도 둔다(routes/calendar.ts).

export type CalendarEntry = {
  // 일정마다 고유하며 @uniconnect를 붙여 전역으로 만든다.
  id: string
  title: string
  // "YYYY-MM-DD". 여러 날에 걸치면 마지막 날도 담는다.
  date: string
  endDate?: string
  description?: string
}

// 캘린더 파일의 텍스트: 역슬래시, 세미콜론, 쉼표를 이스케이프하고 모든
// 줄바꿈(단독 캐리지 리턴 포함)을 \n으로 써서 값이 제 줄을 시작하지 못하게
// 한다.
const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n")

const compact = (date: string) => date.replace(/-/g, "")

// "YYYY-MM-DD" 다음 날. 종일 일정이 끝나는 날이다.
function nextDay(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}

// 75옥텟을 넘는 줄은 앞에 공백을 두고 다음 줄로 잇는다. 한글은 한 글자에
// 3옥텟이라 바이트로 재며 글자 한가운데서 자르지 않는다.
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
      // 종일 일정은 마지막 날 자정에 끝나므로 마지막 날의 다음 날.
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
