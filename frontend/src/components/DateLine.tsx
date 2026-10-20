import { dDayLabel, formatDay } from "../lib/date"

// An event day on its own line: D-day, then the date, never split.
export function DateLine({ date }: { date: string }) {
  return (
    <span className="date-line">
      <em>{dDayLabel(date)}</em>
      {formatDay(date)}
    </span>
  )
}
