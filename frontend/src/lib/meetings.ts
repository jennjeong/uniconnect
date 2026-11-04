import type { Meeting } from "../types"

// 미팅의 시작과 끝을 시점으로: 날짜와 시간은 한국 시각(UTC+9, 서머타임
// 없음)이므로 아홉 시간 되돌려 UTC로 만든다.
export function meetingSpan(meeting: Pick<Meeting, "date" | "time" | "minutes">) {
  const [year, month, day] = meeting.date.split("-").map(Number)
  const [hour, minute] = meeting.time.split(":").map(Number)
  const start = new Date(Date.UTC(year, month - 1, day, hour - 9, minute))
  return { start, end: new Date(start.getTime() + meeting.minutes * 60_000) }
}

// 달력이 시점을 쓰는 방식의 "20261112T050000Z".
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

// 미팅을 시간이 있는 일정으로 추가하는 Google Calendar 페이지.
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

// 달력 파일 안의 텍스트: 역슬래시, 세미콜론, 쉼표를 이스케이프하고 모든
// 줄바꿈(단독 캐리지 리턴 포함)을 \n으로 써서, 값이 혼자 한 줄을 시작하지
// 못하게 한다.
const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n")

// 어느 달력 앱이든 여는 달력 파일(iCalendar)로 만든 미팅. 30분 전 알림이
// 붙는다.
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
