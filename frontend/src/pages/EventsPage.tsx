import { Icon } from "../components/Icon"
import { monthAndDay } from "../lib/format"
import type { EventItem, Role } from "../types"

export function EventsPage({
  role,
  events,
  onCreate,
  onShowDetail,
  onDelete,
}: {
  role: Role
  events: EventItem[]
  onCreate: () => void
  onShowDetail: (event: EventItem) => void
  onDelete: (event: EventItem) => void
}) {
  const noun = role === "학생단체" ? "행사" : "캠페인"

  return (
    <section className="page-view">
      <div className="section-heading-row view-heading">
        <div>
          <span className="section-kicker dark">EVENTS & CAMPAIGNS</span>
          <p className="section-title">등록한 {noun}</p>
        </div>
        <button className="primary-button" onClick={onCreate} type="button">
          <Icon name="plus" size={17} /> 새로 등록
        </button>
      </div>
      <div className="event-grid">
        {events.length === 0 && (
          <p className="event-empty">
            {role === "학생단체"
              ? "아직 등록한 행사가 없어요."
              : "아직 등록한 캠페인이 없어요."}{" "}
            새로 등록하고 추천 매칭을 받아 보세요.
          </p>
        )}
        {events.map((event) => {
          const { month, day } = monthAndDay(event.date)
          return (
            <article className="event-card" key={event.id}>
              <div className="event-date">
                <span>{month}</span>
                <strong>{day}</strong>
              </div>
              <div className="event-card-copy">
                <span
                  className={`status-chip status-${event.status.replace(" ", "")}`}
                >
                  {event.status}
                </span>
                <strong>{event.name}</strong>
                <p>
                  예상 참여 {event.people} · {event.types.join(" · ")} 협찬
                </p>
              </div>
              <div className="event-card-actions">
                <button
                  className="cancel-button"
                  onClick={() => onShowDetail(event)}
                  type="button"
                >
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
        })}
      </div>
    </section>
  )
}
