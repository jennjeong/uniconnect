import { useState, type ReactNode } from "react"

import { t } from "../i18n"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import type { SentProposal } from "../types"
import { BrandMark } from "./BrandMark"

// 계정이 보냈고 파트너가 아직 답하지 않은 제안 하나. 누구에게, 어떤 행사에
// 대해, 무엇을 제안했는지와 회수하는 방법(받은 제안에서 거절할 때처럼 한 번 더
// 묻는다)을 보여 준다.
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
        {item.noInbox ? (
          <span className="request-note">{t("아직 가입하지 않은 곳")}</span>
        ) : (
          <time dateTime={item.createdAt}>{t("{date} 보냄", { date: formatDateTime(item.createdAt) })}</time>
        )}
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
            <span className="request-result">
              {item.noInbox ? t("가입하면 제안이 전달돼요") : t("답을 기다리고 있어요")}
            </span>
            <button className="cancel-button" onClick={() => setConfirming(true)} type="button">
              {t("제안 취소")}
            </button>
          </>
        )}
      </div>
    </article>
  )
}

// 받은 편지함의 검토 중. 양방향 모두 보인다. 이 계정의 답을 기다리는 제안
// (`received`, 페이지 자체의 카드)과, 이 계정이 보내서 파트너의 답을 기다리는
// 제안이다. 각각 제안 취소 버튼이 붙는다.
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
