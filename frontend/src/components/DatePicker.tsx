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

// Month calendar for picking a day or a period, styled like the 내 행사
// calendar. The first press picks the first day; the next press on a later
// day closes the period (or, on an earlier day, starts over from there),
// and the one after starts a new pick. One day is a period that ends where
// it starts.
export function DatePicker({
  start,
  end,
  onChange,
}: {
  // "YYYY-MM-DD"
  start: string
  // Last day of the period; absent for one day.
  end?: string
  onChange: (start: string, end?: string) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(fromIsoDate(start) ?? new Date()))
  // Whether the next press closes the period started by the last one.
  const [closing, setClosing] = useState(false)
  const today = todayIso()
  const last = end ?? start

  const shiftMonth = (months: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + months, 1))

  const pick = (iso: string) => {
    if (closing && iso > start) {
      onChange(start, iso)
      setClosing(false)
    } else if (closing && iso === start) {
      setClosing(false)
    } else {
      onChange(iso)
      setClosing(true)
    }
  }

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

      <div className="date-picker-grid" key={toIsoDate(month)}>
        {calendarDays(month).map((day) => {
          const iso = toIsoDate(day)
          const outside = day.getMonth() !== month.getMonth()
          const edge = iso === start || iso === last
          const className = [
            "date-cell",
            outside && "outside",
            day.getDay() === 0 && "sunday",
            day.getDay() === 6 && "saturday",
            iso === today && "today",
            edge && "selected",
            iso > start && iso < last && "in-range",
            last !== start && iso === start && "range-start",
            last !== start && iso === last && "range-end",
          ]
            .filter(Boolean)
            .join(" ")
          return (
            <button
              aria-label={formatDay(iso)}
              aria-pressed={iso >= start && iso <= last}
              className={className}
              key={iso}
              onClick={() => {
                pick(iso)
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
