import { useState } from "react"

import { lang, t } from "../i18n"
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

// 하루 또는 기간을 고르는 월 달력. 내 행사 달력과 같은 모양이다. 첫 번째 누름이
// 첫날을 고르고, 이후 더 늦은 날을 누르면 기간이 닫힌다 (더 이른 날을 누르면
// 거기서 다시 시작한다). 그다음 누름은 새로 고르기 시작한다. 하루는 끝이 시작과
// 같은 기간이다.
export function DatePicker({
  start,
  end,
  onChange,
}: {
  // "YYYY-MM-DD"
  start: string
  // 기간의 마지막 날. 하루짜리면 없다.
  end?: string
  onChange: (start: string, end?: string) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(fromIsoDate(start) ?? new Date()))
  // 다음 누름이 직전에 시작한 기간을 닫는지 여부.
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
          aria-label={t("이전 달")}
          className="calendar-nav previous"
          onClick={() => shiftMonth(-1)}
          type="button"
        >
          <Icon name="chevron" size={16} />
        </button>
        <strong>
          {lang === "en"
            ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" })
            : `${month.getFullYear()}년 ${month.getMonth() + 1}월`}
        </strong>
        <button
          aria-label={t("다음 달")}
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
