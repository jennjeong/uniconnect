import { useState } from "react"

import { t } from "../i18n"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import type { SentProposal } from "../types"
import { byDeadline } from "../lib/respondBy"
import { BrandMark } from "./BrandMark"
import { RespondBy } from "./RespondBy"
import { TermsList } from "./TermsList"

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

      <RespondBy side="sent" status={item.status} terms={item.terms} />
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

      {item.terms ? (
        <TermsList terms={item.terms} />
      ) : (
        <div className="request-ask">
          <span>{t("제안한 협찬")}</span>
          <strong>{item.offer}</strong>
        </div>
      )}
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
        ) : sentStage(item) === "accepted" || sentStage(item) === "closed" ? (
          <span className="request-result">
            {item.status === "수락"
              ? t("상대가 수락했어요 · 계약서를 확인해 주세요")
              : item.status === "거절"
                ? t("상대가 거절했어요")
                : item.status === "취소됨"
                  ? t("취소된 협찬")
                  : t("행사가 끝나 마감됐어요")}
          </span>
        ) : (
          <>
            <span className="request-result">
              {item.noInbox ? t("상대가 가입하면 전달돼요") : t("상대에게 전달됐어요 · 답을 기다려요")}
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

// 보낸 제안이 어디까지 갔는지. 상대에게 실제로 닿았는지(전달됨)와 답을 구분한다.
// - 답변 대기: 상대의 받은편지함에 도착해 답을 기다린다.
// - 전달 대기: 상대가 아직 가입하지 않아 받은편지함이 없다. 가입하면 전달된다.
// - 수락 · 거절 · 마감 · 취소됨: 상대가 답했거나 행사가 끝났다.
export type SentStage = "waiting" | "undelivered" | "accepted" | "closed"

export const sentStage = (item: SentProposal): SentStage =>
  item.noInbox ? "undelivered" : item.status === "검토 중" ? "waiting" : item.status === "수락" ? "accepted" : "closed"

const stages: { stage: SentStage; title: string; empty: string }[] = [
  { stage: "waiting", title: "답변 대기", empty: "답을 기다리는 보낸 제안이 없어요." },
  { stage: "undelivered", title: "전달 대기 · 상대 미가입", empty: "" },
  { stage: "accepted", title: "수락됨", empty: "" },
  { stage: "closed", title: "거절 · 마감 · 취소", empty: "" },
]

// 받은 제안과 보낸 제안을 나누는 위쪽의 고르기. 건수는 지금 답이 필요한 것만 센다:
// 받은 쪽은 내 답을 기다리는 것, 보낸 쪽은 상대에게 닿아 답을 기다리는 것.
export function InboxDirection({
  value,
  onChange,
  receivedWaiting,
  sent,
}: {
  value: "received" | "sent"
  onChange: (value: "received" | "sent") => void
  receivedWaiting: number
  sent: SentProposal[]
}) {
  const sentWaiting = sent.filter((item) => sentStage(item) === "waiting").length
  return (
    <div aria-label={t("제안 방향")} className="inbox-direction" role="group">
      <button aria-pressed={value === "received"} onClick={() => onChange("received")} type="button">
        {t("받은 제안")} <em>{receivedWaiting}</em>
      </button>
      <button aria-pressed={value === "sent"} onClick={() => onChange("sent")} type="button">
        {t("보낸 제안")} <em>{sentWaiting}</em>
      </button>
    </div>
  )
}

// 보낸 제안을 단계별로. 답을 기다리는 것만 거둘 수 있다.
export function SentList({ sent, onWithdraw }: { sent: SentProposal[]; onWithdraw: (item: SentProposal) => void }) {
  if (sent.length === 0) return <p className="day-empty inbox-empty">{t("아직 보낸 제안이 없어요.")}</p>
  return (
    <div className="inbox-both stagger">
      {stages.map(({ stage, title, empty }) => {
        // 답변 대기는 응답 기한이 가까운(지난) 것부터.
        const filtered = sent.filter((item) => sentStage(item) === stage)
        const items = stage === "waiting" ? byDeadline(filtered) : filtered
        if (items.length === 0 && !empty) return null
        return (
          <section aria-labelledby={`sent-${stage}`} className="inbox-part" key={stage}>
            <h2 className="inbox-subhead" id={`sent-${stage}`}>
              {t(title)} <em>{items.length}</em>
            </h2>
            {items.length === 0 ? (
              <p className="day-empty inbox-empty">{t(empty)}</p>
            ) : (
              <div className="request-grid">
                {items.map((item) => (
                  <SentCard item={item} key={item.id} onWithdraw={onWithdraw} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
