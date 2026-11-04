import { useEffect, useState } from "react"

import { api } from "../api"
import { t } from "../i18n"
import { formatPeriod } from "../lib/date"
import type { EventPage, Match } from "../types"
import { Icon } from "./Icon"

// 그룹 프로필에서 브랜드가 따져 보는 내용을 한눈에 읽는 세 칸으로 보여 준다.
// 그룹이 브랜드에 해 주는 일(제안과 다음 행사의 홍보 계획), 그룹이 요청하는
// 것(협찬 종류와 패키지별 요청), 그리고 페이지가 열리는 행사 자체다.
export function GroupDeal({ match, onOpenEvent }: { match: Match; onOpenEvent?: (eventId: string) => void }) {
  const [page, setPage] = useState<EventPage | null>(null)
  useEffect(() => {
    if (!match.eventId) return
    let cancelled = false
    api.eventPage(match.eventId).then(
      (result) => {
        if (!cancelled) setPage(result)
      },
      // 행사가 없으면 칸들은 리스팅 내용만 보여 준다.
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [match.eventId])

  const event = page?.event
  const gives = [
    ...(match.offer ? [match.offer] : []),
    ...(event?.promo?.spots.map((spot) => t("로고 노출 · {place}", { place: t(spot) })) ?? []),
    ...(event?.promo?.handouts.map((way) => t("현장 배포 · {way}", { way: t(way) })) ?? []),
    ...(event?.promo?.posts.map((post) => t("SNS · {post}", { post: t(post) })) ?? []),
    ...(event?.packages ?? []).map((item) => `${item.name} · ${item.gives}`),
  ]
  const asks = [
    ...(event?.types ?? []).map((type) => (type === "기타" && event?.typeNote ? event.typeNote : t(type))),
    ...(event?.packages ?? []).flatMap((item) => (item.asks ? [`${item.name} · ${item.asks}`] : [])),
  ]

  return (
    <section aria-label={t("협찬 한눈에 보기")} className="deal-grid">
      <article className="deal-box gives">
        <span className="deal-icon" aria-hidden="true">
          <Icon name="spark" size={18} />
        </span>
        <h3>{t("단체가 해 드리는 것")}</h3>
        {gives.length ? (
          <ul>
            {gives.slice(0, 6).map((line) => (
              <li key={line}>
                <Icon name="check" size={14} />
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("아직 정해 두지 않았어요. 문의로 물어보세요.")}</p>
        )}
      </article>
      <article className="deal-box asks">
        <span className="deal-icon" aria-hidden="true">
          <Icon name="won" size={18} />
        </span>
        <h3>{t("원하는 협찬")}</h3>
        {asks.length ? (
          <ul>
            {asks.slice(0, 6).map((line) => (
              <li key={line}>
                <Icon name="check" size={14} />
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("원하는 협찬은 제안하면서 함께 정해요.")}</p>
        )}
      </article>
      <article className="deal-box event">
        <span className="deal-icon" aria-hidden="true">
          <Icon name="calendar" size={18} />
        </span>
        <h3>{t("다음 행사")}</h3>
        {match.eventName ? (
          <>
            <strong>{match.eventName}</strong>
            <dl>
              {match.eventDate && (
                <div>
                  <dt>{t("일정")}</dt>
                  <dd>{formatPeriod(event?.date ?? match.eventDate, event?.endDate)}</dd>
                </div>
              )}
              {match.audience !== undefined && (
                <div>
                  <dt>{t("예상 인원")}</dt>
                  <dd>{t("{count}명", { count: match.audience.toLocaleString("ko-KR") })}</dd>
                </div>
              )}
              {match.eventKind && (
                <div>
                  <dt>{t("행사 유형")}</dt>
                  <dd>{t(match.eventKind)}</dd>
                </div>
              )}
              {event?.venue && (
                <div>
                  <dt>{t("장소")}</dt>
                  <dd>{event.venue}</dd>
                </div>
              )}
            </dl>
            {match.eventId && onOpenEvent && (
              <button className="cancel-button" onClick={() => onOpenEvent(match.eventId!)} type="button">
                {t("행사 페이지 보기")}
              </button>
            )}
          </>
        ) : (
          <p>{t("다가오는 행사가 아직 없어요.")}</p>
        )}
      </article>
    </section>
  )
}
