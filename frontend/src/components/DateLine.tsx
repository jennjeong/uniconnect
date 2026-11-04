import { dDayLabel, formatDay } from "../lib/date"

// 행사 날짜를 한 줄로 보여 준다. D-day 다음에 날짜가 오고 줄바꿈으로 나뉘지
// 않는다.
export function DateLine({ date }: { date: string }) {
  return (
    <span className="date-line">
      <em>{dDayLabel(date)}</em>
      {formatDay(date)}
    </span>
  )
}
