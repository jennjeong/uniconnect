import { useState, type ReactNode } from "react"

import { t } from "../i18n"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import type { SentProposal } from "../types"
import { BrandMark } from "./BrandMark"

// One proposal the account sent and the partner hasn't answered: to whom,
// about which event, offering what, and a way to take it back (asked once
// more, as declining is on received ones).
function SentCard({ item, onWithdraw }: { item: SentProposal; onWithdraw: (item: SentProposal) => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <article className="request-card pending sent">
      <div className="request-head">
        <BrandMark match={item} />
        <div className="request-from">
          <strong>{item.partnerName}</strong>
          {item.school && <span>{item.school}</span>}
        </div>
        <time dateTime={item.createdAt}>{t("{date} 보냄", { date: formatDateTime(item.createdAt) })}</time>
      </div>

      <dl className="request-facts">
        <div>
          <dt>{t("행사")}</dt>
          <dd>{item.eventName}</dd>
        </div>
        <div>
          <dt>{t("일정")}</dt>
          <dd>
            {item.eventDate ? formatDay(item.eventDate) : t("협의 중")}
            {item.eventDate && <em>{dDayLabel(item.eventDate)}</em>}
          </dd>
        </div>
      </dl>

      <div className="request-ask">
        <span>{t("제안한 협찬")}</span>
        <strong>{item.offer}</strong>
      </div>
      {item.message && <p className="request-message">{item.message}</p>}

      <div className="request-actions">
        {confirming ? (
          <>
            <span className="request-confirm">{t("이 제안을 취소할까요?")}</span>
            <button className="cancel-button" onClick={() => setConfirming(false)} type="button">
              {t("아니요")}
            </button>
            <button
              className="decline-button"
              onClick={() => {
                setConfirming(false)
                onWithdraw(item)
              }}
              type="button"
            >
              {t("제안 취소")}
            </button>
          </>
        ) : (
          <>
            <span className="request-result">{t("답을 기다리고 있어요")}</span>
            <button className="cancel-button" onClick={() => setConfirming(true)} type="button">
              {t("제안 취소")}
            </button>
          </>
        )}
      </div>
    </article>
  )
}

// The inbox's 검토 중, both ways: the proposals waiting for this account's
// answer (`received`, the page's own cards) and the ones it sent that wait
// for the partner's, each with 제안 취소.
export function PendingBothWays({
  received,
  receivedCount,
  sent,
  onWithdraw,
}: {
  received: ReactNode
  receivedCount: number
  sent: SentProposal[]
  onWithdraw: (item: SentProposal) => void
}) {
  const waiting = sent.filter((item) => item.status === "검토 중")
  return (
    <div className="inbox-both stagger">
      <section aria-labelledby="inbox-received" className="inbox-part">
        <h2 className="inbox-subhead" id="inbox-received">
          {t("받은 제안")} <em>{receivedCount}</em>
        </h2>
        {received}
      </section>
      <section aria-labelledby="inbox-sent" className="inbox-part">
        <h2 className="inbox-subhead" id="inbox-sent">
          {t("보낸 제안")} <em>{waiting.length}</em>
        </h2>
        {waiting.length === 0 ? (
          <p className="day-empty inbox-empty">{t("답을 기다리는 보낸 제안이 없어요.")}</p>
        ) : (
          <div className="request-grid">
            {waiting.map((item) => (
              <SentCard item={item} key={item.id} onWithdraw={onWithdraw} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
