import { useState } from "react"

import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { locale, t } from "../i18n"
import { formatWon } from "../lib/kpis"
import {
  calendarDays,
  daysOf,
  formatDay,
  formatPeriod,
  fromIsoDate,
  shortDay,
  startOfMonth,
  toIsoDate,
  todayIso,
  weekdayNames,
} from "../lib/date"
import { saveFile } from "../lib/download"
import { calendarFile, type CalendarEntry } from "../lib/ics"
import type { EventItem, Role, SponsorRequest } from "../types"

// A day on the calendar holds the account's own events or campaigns and,
// for brands, the student events whose proposal they accepted. An event
// over several days shows on each of them.
type Entry =
  | { kind: "event"; id: string; date: string; end?: string; name: string; event: EventItem }
  | { kind: "sponsorship"; id: string; date: string; end?: string; name: string; request: SponsorRequest }

const statusClass = (entry: Entry) =>
  entry.kind === "event" ? `status-${entry.event.status.replace(" ", "")}` : "status-협찬확정"

const statusLabel = (entry: Entry) => (entry.kind === "event" ? t(entry.event.status) : t("협찬 확정"))

// Head counts are stored as written, such as "120명"; in English they read
// "120 people".
const peopleLabel = (people: string) => {
  const match = /^([\d,]+)명$/.exec(people)
  return match ? t("{count}명", { count: match[1] }) : people
}

// "현금 · 기타(음향 장비)" in the language shown.
const typeLabels = (event: EventItem) =>
  event.types
    .map((type) => (type === "기타" && event.typeNote ? `${t("기타")}(${event.typeNote})` : t(type)))
    .join(" · ")

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
  const types = event.types.length > 0 ? ` · ${t("{types} 협찬", { types: typeLabels(event) })}` : ""
  const people = event.people ? peopleLabel(event.people) : t("미정")
  return (
    <article className="day-event-card">
      <div className="day-event-copy">
        <span className={`status-chip status-${event.status.replace(" ", "")}`}>{t(event.status)}</span>
        <strong>{event.name}</strong>
        {event.endDate && (
          <span className="day-event-period">{formatPeriod(event.date, event.endDate)}</span>
        )}
        <p>
          {role === "학생단체"
            ? `${t("예상 참여 {people}", { people })}${types}`
            : `${t("목표 도달 {people} · 예산 {budget}", {
                people,
                budget: event.budget === undefined ? t("미정") : formatWon(event.budget),
              })}${types}`}
        </p>
      </div>
      <div className="event-card-actions">
        <button className="cancel-button" onClick={() => onShowDetail(event)} type="button">
          {t("상세 보기")}
        </button>
        <button
          className="delete-button"
          aria-label={t("{name} 삭제", { name: event.name })}
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
        <span className="status-chip status-협찬확정">{t("협찬 확정")}</span>
        <strong>{request.eventName}</strong>
        <p>
          {request.groupName} · {peopleLabel(request.people)} · {request.ask}
        </p>
      </div>
      <div className="event-card-actions">
        <button className="cancel-button" onClick={onOpen} type="button">
          {t("제안 보기")}
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
  onNotice,
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
  onNotice?: (message: string) => void
}) {
  const today = todayIso()

  // The events from today on, and for brands the days they sponsor, as a
  // calendar file for Google, Apple or Outlook calendars.
  const exportCalendar = () => {
    const entries: CalendarEntry[] = [
      ...events
        .filter((event) => (event.endDate ?? event.date) >= today)
        .map((event) => ({
          id: event.id,
          title: event.name,
          date: event.date,
          endDate: event.endDate,
          description: [event.people, event.types.map((type) => t(type)).join(", ")].filter(Boolean).join(" · "),
        })),
      ...sponsorships
        .filter((request) => request.eventDate >= today)
        .map((request) => ({
          id: request.id,
          title: t("협찬 · {name}", { name: `${request.groupName} ${request.eventName}` }),
          date: request.eventDate,
          description: request.ask,
        })),
    ]
    if (entries.length === 0) {
      onNotice?.(t("캘린더에 넣을 다가오는 일정이 없어요."))
      return
    }
    saveFile(`uniconnect-${today}.ics`, calendarFile(entries, t("uniconnect 행사 일정")), "text/calendar;charset=utf-8")
    onNotice?.(t("캘린더 파일을 내려받았어요. 캘린더 앱에서 열면 일정이 추가돼요."))
  }
  const [selected, setSelected] = useState(() =>
    initialDate && fromIsoDate(initialDate) ? initialDate : today,
  )
  const [month, setMonth] = useState(() => startOfMonth(fromIsoDate(selected) ?? new Date()))

  const entries: Entry[] = [
    ...events.map((event) => ({
      kind: "event" as const,
      id: event.id,
      date: event.date,
      end: event.endDate,
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
  for (const entry of entries) {
    for (const day of daysOf(entry.date, entry.end)) byDate.set(day, [...(byDate.get(day) ?? []), entry])
  }
  const selectedEntries = byDate.get(selected) ?? []
  // Everything on the month shown, for the list under the calendar.
  const monthStart = toIsoDate(month)
  const monthEnd = toIsoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const monthEntries = entries
    .filter((entry) => entry.date <= monthEnd && (entry.end ?? entry.date) >= monthStart)
    .sort((a, b) => a.date.localeCompare(b.date))
  const upcoming = entries
    .filter((entry) => (entry.end ?? entry.date) >= today)
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
        eyebrow={role === "학생단체" ? "My Events" : "Event Calendar"}
        title={t("행사 일정")}
        description={t("날짜를 고르면 그날의 일정이 함께 보여요. 두 번 누르면 그 날짜로 바로 등록해요.")}
        actions={
          <>
            <Pill onClick={exportCalendar} variant="outline">
              {t("캘린더에 추가")}
            </Pill>
            <Pill arrow="right" onClick={() => onCreate(selected)}>
              {t("새로 등록")}
            </Pill>
          </>
        }
      />

      <div className="calendar-layout">
        <div className="calendar-card">
          <div className="calendar-head">
            <button
              aria-label={t("이전 달")}
              className="calendar-nav previous"
              onClick={() => shiftMonth(-1)}
              type="button"
            >
              <Icon name="chevron" size={18} />
            </button>
            <strong>{month.toLocaleDateString(locale, { year: "numeric", month: "long" })}</strong>
            <button
              aria-label={t("다음 달")}
              className="calendar-nav"
              onClick={() => shiftMonth(1)}
              type="button"
            >
              <Icon name="chevron" size={18} />
            </button>
            <button className="calendar-today" onClick={() => jumpTo(today)} type="button">
              {t("오늘")}
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
                dayEntries.length > 0 && "has-events",
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
                  aria-label={
                    dayEntries.length
                      ? t("{day}, 일정 {count}개", { day: formatDay(iso), count: dayEntries.length })
                      : formatDay(iso)
                  }
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
            <span className="legend-matching">{t("매칭 중")}</span>
            <span className="legend-scheduled">{t("집행 예정")}</span>
            <span className="legend-done">{t("측정 완료")}</span>
            {role === "브랜드" && <span className="legend-confirmed">{t("협찬 확정")}</span>}
          </div>

          <div className="month-agenda">
            <p className="month-agenda-title">
              {t("{month} 일정", { month: month.toLocaleDateString(locale, { month: "long" }) })}{" "}
              <em>{monthEntries.length}</em>
            </p>
            {monthEntries.length === 0 ? (
              <p className="day-empty">{t("이 달에는 일정이 없어요.")}</p>
            ) : (
              <ol className="stagger" key={toIsoDate(month)}>
                {monthEntries.map((entry) => {
                  const start = fromIsoDate(entry.date)
                  return (
                    <li key={entry.id}>
                      <button
                        className={entry.date === selected ? "agenda-item selected" : "agenda-item"}
                        onClick={() => jumpTo(entry.date)}
                        type="button"
                      >
                        <span className="agenda-day">
                          <strong>{start?.getDate()}</strong>
                          <small>{start ? weekdayNames[start.getDay()] : ""}</small>
                        </span>
                        <span className="agenda-copy">
                          <strong>{entry.name}</strong>
                          <small>{formatPeriod(entry.date, entry.end)}</small>
                        </span>
                        <span className={`status-chip ${statusClass(entry)}`}>{statusLabel(entry)}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>

        <aside className="day-panel">
          <div className="day-panel-head">
            <span className="eyebrow">Selected Day</span>
            <p className="day-title" key={selected}>
              {formatDay(selected)}
            </p>
          </div>

          <div className="day-event-list stagger" key={selected}>
            {selectedEntries.length === 0 ? (
              <p className="day-empty">
                {role === "학생단체" ? t("등록된 행사가 없어요.") : t("등록된 캠페인이 없어요.")}
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
            <Icon name="plus" size={17} />{" "}
            {role === "학생단체" ? t("이 날짜에 행사 등록") : t("이 날짜에 캠페인 등록")}
          </button>

          <div className="upcoming stagger">
            <span className="upcoming-title">{t("다가오는 일정")}</span>
            {upcoming.length === 0 ? (
              <p className="day-empty">{t("예정된 일정이 없어요.")}</p>
            ) : (
              upcoming.map((entry) => (
                <button
                  className="upcoming-item"
                  key={entry.id}
                  onClick={() => jumpTo(entry.date)}
                  type="button"
                >
                  <span className="upcoming-date">
                    {formatDay(entry.date)}
                    {entry.end && ` ~ ${shortDay(entry.end)}`}
                  </span>
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
