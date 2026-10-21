import { useState } from "react"

import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { sponsorTypeLabels } from "../lib/format"
import { formatWon } from "../lib/kpis"
import {
  calendarDays,
  formatDay,
  fromIsoDate,
  startOfMonth,
  toIsoDate,
  todayIso,
  weekdayNames,
} from "../lib/date"
import type { EventItem, Role, SponsorRequest } from "../types"

// A day on the calendar holds the account's own events or campaigns and,
// for brands, the student events whose proposal they accepted.
type Entry =
  | { kind: "event"; id: string; date: string; name: string; event: EventItem }
  | { kind: "sponsorship"; id: string; date: string; name: string; request: SponsorRequest }

const statusClass = (entry: Entry) =>
  entry.kind === "event" ? `status-${entry.event.status.replace(" ", "")}` : "status-협찬확정"

const statusLabel = (entry: Entry) => (entry.kind === "event" ? entry.event.status : "협찬 확정")

function EventRow({
  role,
  event,
  onShowDetail,
  onDelete,
}: {
  role: Role
  event: EventItem
  onShowDetail: (event: EventItem) => void
  onDelete: (event: EventItem) => void
}) {
  const types = event.types.length > 0 ? ` · ${sponsorTypeLabels(event).join(" · ")} 협찬` : ""
  return (
    <article className="day-event-card">
      <div className="day-event-copy">
        <span className={`status-chip status-${event.status.replace(" ", "")}`}>{event.status}</span>
        <strong>{event.name}</strong>
        <p>
          {role === "학생단체"
            ? `예상 참여 ${event.people || "미정"}${types}`
            : `목표 도달 ${event.people || "미정"} · 예산 ${
                event.budget === undefined ? "미정" : formatWon(event.budget)
              }${types}`}
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

// A student event a brand agreed to sponsor.
function SponsorshipRow({
  request,
  onOpen,
}: {
  request: SponsorRequest
  onOpen: () => void
}) {
  return (
    <article className="day-event-card">
      <div className="day-event-copy">
        <span className="status-chip status-협찬확정">협찬 확정</span>
        <strong>{request.eventName}</strong>
        <p>
          {request.groupName} · {request.people} · {request.ask}
        </p>
      </div>
      <div className="event-card-actions">
        <button className="cancel-button" onClick={onOpen} type="button">
          제안 보기
        </button>
      </div>
    </article>
  )
}

export function EventsPage({
  role,
  events,
  sponsorships = [],
  initialDate,
  onCreate,
  onShowDetail,
  onDelete,
  onOpenSponsorship,
}: {
  role: Role
  events: EventItem[]
  // Brands only: accepted proposals, shown on their event days.
  sponsorships?: SponsorRequest[]
  // Day to open on, such as the date of a just-registered event.
  initialDate?: string
  onCreate: (date: string) => void
  onShowDetail: (event: EventItem) => void
  onDelete: (event: EventItem) => void
  onOpenSponsorship?: () => void
}) {
  const noun = role === "학생단체" ? "행사" : "캠페인"
  const today = todayIso()
  const [selected, setSelected] = useState(() =>
    initialDate && fromIsoDate(initialDate) ? initialDate : today,
  )
  const [month, setMonth] = useState(() => startOfMonth(fromIsoDate(selected) ?? new Date()))

  const entries: Entry[] = [
    ...events.map((event) => ({
      kind: "event" as const,
      id: event.id,
      date: event.date,
      name: event.name,
      event,
    })),
    ...sponsorships.map((request) => ({
      kind: "sponsorship" as const,
      id: request.id,
      date: request.eventDate,
      name: request.eventName,
      request,
    })),
  ].filter((entry) => fromIsoDate(entry.date))
  const byDate = new Map<string, Entry[]>()
  for (const entry of entries) byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry])
  const selectedEntries = byDate.get(selected) ?? []
  const upcoming = entries
    .filter((entry) => entry.date >= today)
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
      <PageIntro
        eyebrow={role === "학생단체" ? "My events" : "Campaign calendar"}
        title={`${noun} 일정`}
        description="날짜를 고르면 그날의 일정이 함께 보여요. 두 번 누르면 그 날짜로 바로 등록해요."
        actions={
          <Pill arrow="right" onClick={() => onCreate(selected)}>
            새로 등록
          </Pill>
        }
      />

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

          <div className="calendar-grid" key={toIsoDate(month)}>
            {calendarDays(month).map((day) => {
              const iso = toIsoDate(day)
              const dayEntries = byDate.get(iso) ?? []
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
                  aria-label={`${formatDay(iso)}${dayEntries.length ? `, 일정 ${dayEntries.length}개` : ""}`}
                  aria-pressed={iso === selected}
                  className={className}
                  key={iso}
                  onClick={() => setSelected(iso)}
                  onDoubleClick={() => onCreate(iso)}
                  type="button"
                >
                  <span className="day-number">{day.getDate()}</span>
                  <span className="day-events">
                    {dayEntries.slice(0, 2).map((entry) => (
                      <span className={`day-event ${statusClass(entry)}`} key={entry.id}>
                        {entry.name}
                      </span>
                    ))}
                    {dayEntries.length > 2 && (
                      <span className="day-more">+{dayEntries.length - 2}</span>
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
            {role === "브랜드" && <span className="legend-confirmed">협찬 확정</span>}
            <small>날짜를 고르고 아래 ‘이 날짜에 {noun} 등록’을 누르면 바로 입력할 수 있어요.</small>
          </div>
        </div>

        <aside className="day-panel">
          <div className="day-panel-head">
            <span className="eyebrow">Selected day</span>
            <p className="day-title" key={selected}>
              {formatDay(selected)}
            </p>
          </div>

          <div className="day-event-list stagger" key={selected}>
            {selectedEntries.length === 0 ? (
              <p className="day-empty">
                {role === "학생단체" ? "등록된 행사가 없어요." : "등록된 캠페인이 없어요."}
              </p>
            ) : (
              selectedEntries.map((entry) =>
                entry.kind === "event" ? (
                  <EventRow
                    event={entry.event}
                    key={entry.id}
                    onDelete={onDelete}
                    onShowDetail={onShowDetail}
                    role={role}
                  />
                ) : (
                  <SponsorshipRow
                    key={entry.id}
                    onOpen={() => onOpenSponsorship?.()}
                    request={entry.request}
                  />
                ),
              )
            )}
          </div>

          <button className="primary-button wide" onClick={() => onCreate(selected)} type="button">
            <Icon name="plus" size={17} /> 이 날짜에 {noun} 등록
          </button>

          <div className="upcoming stagger">
            <span className="upcoming-title">다가오는 일정</span>
            {upcoming.length === 0 ? (
              <p className="day-empty">예정된 일정이 없어요.</p>
            ) : (
              upcoming.map((entry) => (
                <button
                  className="upcoming-item"
                  key={entry.id}
                  onClick={() => jumpTo(entry.date)}
                  type="button"
                >
                  <span className="upcoming-date">{formatDay(entry.date)}</span>
                  <strong>{entry.name}</strong>
                  <span className={`status-chip ${statusClass(entry)}`}>{statusLabel(entry)}</span>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
