import { useState } from "react"

import {
  calendarDays,
  formatDay,
  fromIsoDate,
  startOfMonth,
  toIsoDate,
  todayIso,
  weekdayNames,
} from "../lib/date"
import { Icon } from "./Icon"

// Month calendar for picking one day, styled like the 내 행사 calendar.
export function DatePicker({
  value,
  onChange,
}: {
  // "YYYY-MM-DD"
  value: string
  onChange: (iso: string) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(fromIsoDate(value) ?? new Date()))
  const today = todayIso()

  const shiftMonth = (months: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + months, 1))

  return (
    <div className="date-picker">
      <div className="date-picker-head">
        <button
          aria-label="이전 달"
          className="calendar-nav previous"
          onClick={() => shiftMonth(-1)}
          type="button"
        >
          <Icon name="chevron" size={16} />
        </button>
        <strong>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </strong>
        <button
          aria-label="다음 달"
          className="calendar-nav"
          onClick={() => shiftMonth(1)}
          type="button"
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {weekdayNames.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>

      <div className="date-picker-grid">
        {calendarDays(month).map((day) => {
          const iso = toIsoDate(day)
          const outside = day.getMonth() !== month.getMonth()
          const className = [
            "date-cell",
            outside && "outside",
            day.getDay() === 0 && "sunday",
            day.getDay() === 6 && "saturday",
            iso === today && "today",
            iso === value && "selected",
          ]
            .filter(Boolean)
            .join(" ")
          return (
            <button
              aria-label={formatDay(iso)}
              aria-pressed={iso === value}
              className={className}
              key={iso}
              onClick={() => {
                onChange(iso)
                if (outside) setMonth(startOfMonth(day))
              }}
              type="button"
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
