import { useState } from "react"

import { Icon } from "../components/Icon"
import { sponsorTypeLabels } from "../lib/format"
import {
  calendarDays,
  formatDay,
  fromIsoDate,
  startOfMonth,
  toIsoDate,
  todayIso,
  weekdayNames,
} from "../lib/date"
import type { EventItem, Role } from "../types"

const statusClass = (event: EventItem) => `status-${event.status.replace(" ", "")}`

function EventRow({
  event,
  onShowDetail,
  onDelete,
}: {
  event: EventItem
  onShowDetail: (event: EventItem) => void
  onDelete: (event: EventItem) => void
}) {
  return (
    <article className="day-event-card">
      <div className="day-event-copy">
        <span className={`status-chip ${statusClass(event)}`}>{event.status}</span>
        <strong>{event.name}</strong>
        <p>
          예상 참여 {event.people || "미정"}
          {event.types.length > 0 && ` · ${sponsorTypeLabels(event).join(" · ")} 협찬`}
        </p>
      </div>
      <div className="event-card-actions">
        <button className="cancel-button" onClick={() => onShowDetail(event)} type="button">
          상세 보기
        </button>
        <button
          className="delete-button"
          aria-label={`${event.name} 삭제`}
          onClick={() => onDelete(event)}
          type="button"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </article>
  )
}

export function EventsPage({
  role,
  events,
  initialDate,
  onCreate,
  onShowDetail,
  onDelete,
}: {
  role: Role
  events: EventItem[]
  // Day to open on, such as the date of a just-registered event.
  initialDate?: string
  onCreate: (date: string) => void
  onShowDetail: (event: EventItem) => void
  onDelete: (event: EventItem) => void
}) {
  const noun = role === "학생단체" ? "행사" : "캠페인"
  const today = todayIso()
  const [selected, setSelected] = useState(() =>
    initialDate && fromIsoDate(initialDate) ? initialDate : today,
  )
  const [month, setMonth] = useState(() => startOfMonth(fromIsoDate(selected) ?? new Date()))

  const byDate = new Map<string, EventItem[]>()
  for (const event of events) {
    if (!fromIsoDate(event.date)) continue
    byDate.set(event.date, [...(byDate.get(event.date) ?? []), event])
  }
  const selectedEvents = byDate.get(selected) ?? []
  const upcoming = events
    .filter((event) => fromIsoDate(event.date) && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  const shiftMonth = (months: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + months, 1))

  const jumpTo = (iso: string) => {
    const date = fromIsoDate(iso)
    if (!date) return
    setSelected(iso)
    setMonth(startOfMonth(date))
  }

  return (
    <section className="page-view">
      <div className="section-heading-row view-heading">
        <div>
          <span className="section-kicker dark">EVENTS & CAMPAIGNS</span>
          <p className="section-title">{noun} 일정</p>
        </div>
        <button className="primary-button" onClick={() => onCreate(selected)} type="button">
          <Icon name="plus" size={17} /> 새로 등록
        </button>
      </div>

      <div className="calendar-layout">
        <div className="calendar-card">
          <div className="calendar-head">
            <button
              aria-label="이전 달"
              className="calendar-nav previous"
              onClick={() => shiftMonth(-1)}
              type="button"
            >
              <Icon name="chevron" size={18} />
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
              <Icon name="chevron" size={18} />
            </button>
            <button className="calendar-today" onClick={() => jumpTo(today)} type="button">
              오늘
            </button>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {weekdayNames.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays(month).map((day) => {
              const iso = toIsoDate(day)
              const dayEvents = byDate.get(iso) ?? []
              const className = [
                "calendar-day",
                day.getMonth() !== month.getMonth() && "outside",
                day.getDay() === 0 && "sunday",
                day.getDay() === 6 && "saturday",
                iso === today && "today",
                iso === selected && "selected",
              ]
                .filter(Boolean)
                .join(" ")
              return (
                <button
                  aria-label={`${formatDay(iso)}${dayEvents.length ? `, 일정 ${dayEvents.length}개` : ""}`}
                  aria-pressed={iso === selected}
                  className={className}
                  key={iso}
                  onClick={() => setSelected(iso)}
                  onDoubleClick={() => onCreate(iso)}
                  type="button"
                >
                  <span className="day-number">{day.getDate()}</span>
                  <span className="day-events">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span className={`day-event ${statusClass(event)}`} key={event.id}>
                        {event.name}
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="day-more">+{dayEvents.length - 2}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="calendar-legend">
            <span className="legend-matching">매칭 중</span>
            <span className="legend-scheduled">집행 예정</span>
            <span className="legend-done">측정 완료</span>
            <small>날짜를 고르고 아래 ‘이 날짜에 {noun} 등록’을 누르면 바로 입력할 수 있어요.</small>
          </div>
        </div>

        <aside className="day-panel">
          <div className="day-panel-head">
            <span className="section-kicker dark">SELECTED DAY</span>
            <p className="section-title">{formatDay(selected)}</p>
          </div>

          <div className="day-event-list">
            {selectedEvents.length === 0 ? (
              <p className="day-empty">
                {role === "학생단체" ? "등록된 행사가 없어요." : "등록된 캠페인이 없어요."}
              </p>
            ) : (
              selectedEvents.map((event) => (
                <EventRow
                  event={event}
                  key={event.id}
                  onDelete={onDelete}
                  onShowDetail={onShowDetail}
                />
              ))
            )}
          </div>

          <button className="primary-button wide" onClick={() => onCreate(selected)} type="button">
            <Icon name="plus" size={17} /> 이 날짜에 {noun} 등록
          </button>

          <div className="upcoming">
            <span className="upcoming-title">다가오는 일정</span>
            {upcoming.length === 0 ? (
              <p className="day-empty">예정된 일정이 없어요.</p>
            ) : (
              upcoming.map((event) => (
                <button
                  className="upcoming-item"
                  key={event.id}
                  onClick={() => jumpTo(event.date)}
                  type="button"
                >
                  <span className="upcoming-date">{formatDay(event.date)}</span>
                  <strong>{event.name}</strong>
                  <span className={`status-chip ${statusClass(event)}`}>{event.status}</span>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
