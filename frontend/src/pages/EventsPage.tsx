import { useState } from "react"

import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { Presence } from "../components/Presence"
import { locale, t } from "../i18n"
import { formatWon } from "../lib/kpis"
import {
  calendarDays,
  dDayLabel,
  daysOf,
  formatDay,
  formatPeriod,
  fromIsoDate,
  startOfMonth,
  toIsoDate,
  todayIso,
  weekdayNames,
} from "../lib/date"
import type { CalendarEntry } from "../lib/ics"
import { CalendarModal } from "../modals/CalendarModal"
import type { EventItem, Role, SponsorRequest } from "../types"

// 캘린더의 하루에는 계정 자신의 행사나 캠페인이 담기고, 브랜드는 제안을 수락한
// 학생 행사도 담긴다. 여러 날에 걸친 행사는 각 날에 보인다.
type Entry =
  | { kind: "event"; id: string; date: string; end?: string; name: string; event: EventItem }
  | { kind: "sponsorship"; id: string; date: string; end?: string; name: string; request: SponsorRequest }

// 수락만 되고 계약서를 양쪽이 아직 확인하지 않은 협찬은 '계약 확인 대기'다.
const sponsorshipConfirmed = (request: SponsorRequest) => request.contract !== "waiting"

const statusClass = (entry: Entry) =>
  entry.kind === "event"
    ? `status-${entry.event.status.replace(" ", "")}`
    : sponsorshipConfirmed(entry.request)
      ? "status-협찬확정"
      : "status-매칭중"

const statusLabel = (entry: Entry) =>
  entry.kind === "event"
    ? t(entry.event.status)
    : sponsorshipConfirmed(entry.request)
      ? t("협찬 확정")
      : t("계약 확인 대기")

// 인원수는 "120명"처럼 쓴 대로 저장된다. 영어로는 "120 people"로 읽는다.
const peopleLabel = (people: string) => {
  const match = /^([\d,]+)명$/.exec(people)
  return match ? t("{count}명", { count: match[1] }) : people
}

// 보이는 언어로 쓴 "현금 · 기타(음향 장비)".
const typeLabels = (event: EventItem) =>
  event.types
    .map((type) => (type === "기타" && event.typeNote ? `${t("기타")}(${event.typeNote})` : t(type)))
    .join(" · ")

function EventRow({
  role,
  event,
  onShowDetail,
  onEdit,
  onCopy,
  onDelete,
}: {
  role: Role
  event: EventItem
  onShowDetail: (event: EventItem) => void
  onEdit: (event: EventItem) => void
  onCopy: (event: EventItem) => void
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
            ? `${
                event.budget === undefined
                  ? t("예상 참여 {people}", { people })
                  : t("예상 참여 {people} · 예산 {budget}", { people, budget: formatWon(event.budget) })
              }${types}`
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
          aria-label={t("{name} 수정", { name: event.name })}
          onClick={() => onEdit(event)}
          type="button"
        >
          <Icon name="edit" size={16} />
        </button>
        <button
          className="delete-button"
          aria-label={t("{name} 복제", { name: event.name })}
          onClick={() => onCopy(event)}
          type="button"
        >
          <Icon name="copy" size={16} />
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

// 브랜드가 협찬하기로 한 학생 행사.
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
        <span className={sponsorshipConfirmed(request) ? "status-chip status-협찬확정" : "status-chip status-매칭중"}>
          {sponsorshipConfirmed(request) ? t("협찬 확정") : t("계약 확인 대기")}
        </span>
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
  onEdit,
  onCopy,
  onDelete,
  onOpenSponsorship,
  onNotice,
  canSubscribe = false,
  onExplore,
}: {
  role: Role
  events: EventItem[]
  // 브랜드 전용: 수락된 제안을 행사 날에 보여 준다.
  sponsorships?: SponsorRequest[]
  // 처음 열 날. 방금 등록한 행사의 날짜 등.
  initialDate?: string
  onCreate: (date: string) => void
  onShowDetail: (event: EventItem) => void
  onEdit: (event: EventItem) => void
  // 이 행사로 채운 등록 폼을 연다(행사 복제).
  onCopy: (event: EventItem) => void
  onDelete: (event: EventItem) => void
  // 요청이 주어지면 협찬 행사의 페이지로, 아니면 제안으로 간다.
  onOpenSponsorship?: (request?: SponsorRequest) => void
  onNotice?: (message: string) => void
  // 회원의 캘린더에 추가는 구독 링크도 함께 제공한다.
  canSubscribe?: boolean
  // 행사 둘러보기: 다른 단체의 행사(학생단체 전용).
  onExplore?: () => void
}) {
  const today = todayIso()

  // 오늘부터의 행사와 브랜드가 협찬하는 날을 날짜순으로. CalendarModal에서 고른
  // 캘린더 앱에 추가한다.
  const [calendar, setCalendar] = useState<CalendarEntry[] | null>(null)
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
    setCalendar(entries.sort((a, b) => a.date.localeCompare(b.date)))
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
  // 보이는 달의 모든 것. 캘린더 아래 목록용.
  const monthStart = toIsoDate(month)
  const monthEnd = toIsoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const monthEntries = entries
    .filter((entry) => entry.date <= monthEnd && (entry.end ?? entry.date) >= monthStart)
    .sort((a, b) => a.date.localeCompare(b.date))
  // 캘린더 위의 요약: 아직 오지 않은 다음 행사와, 계정 자신의 행사가 각 단계에
  // 몇 개 있는지.
  const next = entries
    .filter((entry) => (entry.end ?? entry.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const countOf = (status: EventItem["status"]) => events.filter((event) => event.status === status).length

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
        description={t("날짜를 누르면 그날 일정이 보이고, 두 번 누르면 바로 등록해요.")}
        actions={
          <>
            {onExplore && (
              <Pill onClick={onExplore} variant="outline">
                {t("다른 단체 행사 보기")}
              </Pill>
            )}
            <Pill onClick={exportCalendar} variant="outline">
              {t("캘린더에 추가")}
            </Pill>
            <Pill arrow="right" onClick={() => onCreate(selected)}>
              {t("새로 등록")}
            </Pill>
          </>
        }
      />

      <section aria-label={t("일정 요약")} className="events-summary">
        <article className="events-next">
          <span className="events-next-kicker">{role === "학생단체" ? t("다음 행사") : t("다음 캠페인")}</span>
          {next ? (
            <>
              <strong>{next.name}</strong>
              <span className="events-next-date">
                {formatPeriod(next.date, next.end)} <em>{dDayLabel(next.date)}</em>
              </span>
              <div className="events-next-actions">
                <span className={`status-chip ${statusClass(next)}`}>{statusLabel(next)}</span>
                <button
                  className="events-next-open"
                  onClick={() => (next.kind === "event" ? onShowDetail(next.event) : onOpenSponsorship?.(next.request))}
                  type="button"
                >
                  {t("상세 보기")}
                  <Icon name="arrowUpRight" size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <strong>{role === "학생단체" ? t("아직 다가오는 행사가 없어요") : t("아직 다가오는 캠페인이 없어요")}</strong>
              <button className="events-next-open" onClick={() => onCreate(selected)} type="button">
                {t("지금 등록하기")}
                <Icon name="arrowUpRight" size={14} />
              </button>
            </>
          )}
        </article>
        <dl className="events-counts">
          <div>
            <dt>{t("{month} 일정", { month: month.toLocaleDateString(locale, { month: "long" }) })}</dt>
            <dd>{monthEntries.length}</dd>
          </div>
          <div className="count-matching">
            <dt>{t("매칭 중")}</dt>
            <dd>{countOf("매칭 중")}</dd>
          </div>
          <div className="count-scheduled">
            <dt>{t("집행 예정")}</dt>
            <dd>{countOf("집행 예정")}</dd>
          </div>
          <div className="count-done">
            <dt>{t("측정 완료")}</dt>
            <dd>{countOf("측정 완료")}</dd>
          </div>
        </dl>
      </section>

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
                  {/* 휴대폰의 좁은 칸에는 이름 대신 상태 점을 셋까지, 더 있으면 개수로.
                      이름과 상태는 아래 '선택한 날'의 목록이 보여 준다. */}
                  {dayEntries.length > 0 && (
                    <span aria-hidden="true" className="day-dots">
                      {dayEntries.slice(0, dayEntries.length > 3 ? 2 : 3).map((entry) => (
                        <i className={statusClass(entry)} key={entry.id} />
                      ))}
                      {dayEntries.length > 3 && <small>+{dayEntries.length - 2}</small>}
                    </span>
                  )}
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

        </div>

        <aside className="day-panel">
          <div className="day-panel-head">
            <span className="eyebrow">{t("선택한 날의 일정")}</span>
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
                    onEdit={onEdit}
                    onCopy={onCopy}
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
        </aside>
      </div>

      <Presence show={calendar !== null}>
        {calendar && (
          <CalendarModal entries={calendar} onClose={() => setCalendar(null)} onNotice={onNotice} subscribe={canSubscribe} />
        )}
      </Presence>
    </section>
  )
}
