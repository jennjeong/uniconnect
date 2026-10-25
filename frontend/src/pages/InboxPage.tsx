import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { RequestProgress } from "../components/RequestProgress"
import { PendingBothWays } from "../components/SentProposals"
import { TabBar } from "../components/TabBar"
import { t } from "../i18n"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import type { RequestStatus, SentProposal, SponsorRequest } from "../types"

// Card class for each status.
const cardState: Record<RequestStatus, string> = {
  "검토 중": "pending",
  수락: "accepted",
  거절: "declined",
}

const tabs: { status: RequestStatus; label: string; empty: string }[] = [
  { status: "검토 중", label: "검토 중", empty: "답을 기다리는 제안이 없어요." },
  { status: "수락", label: "수락함", empty: "아직 수락한 제안이 없어요." },
  { status: "거절", label: "거절함", empty: "거절한 제안이 없어요." },
]

function RequestCard({
  request,
  onAnswer,
  onOpenAgreement,
}: {
  request: SponsorRequest
  onAnswer: (request: SponsorRequest, decision: "accept" | "decline") => void
  onOpenAgreement: (id: string) => void
}) {
  // Declining can't be undone, so it asks once more.
  const [confirming, setConfirming] = useState(false)

  return (
    <article className={`request-card ${cardState[request.status]}`}>
      <div className="request-head">
        <BrandMark match={request} />
        <div className="request-from">
          <strong>{request.groupName}</strong>
          <span>{request.school}</span>
        </div>
        <time dateTime={request.createdAt}>{t("{date} 받음", { date: formatDateTime(request.createdAt) })}</time>
      </div>

      <dl className="request-facts">
        <div>
          <dt>{t("행사")}</dt>
          <dd>{request.eventName}</dd>
        </div>
        <div>
          <dt>{t("일정")}</dt>
          <dd>
            {request.eventDate ? formatDay(request.eventDate) : t("협의 중")}
            {request.eventDate && <em>{dDayLabel(request.eventDate)}</em>}
          </dd>
        </div>
        <div>
          <dt>{t("규모")}</dt>
          <dd>{request.people}</dd>
        </div>
      </dl>

      <div className="request-ask">
        <span>{t("요청 협찬")}</span>
        <strong>{request.ask}</strong>
      </div>
      <p className="request-message">{request.message}</p>

      <div className="request-actions">
        {request.status === "검토 중" ? (
          confirming ? (
            <>
              <span className="request-confirm">{t("이 제안을 거절할까요?")}</span>
              <button className="cancel-button" onClick={() => setConfirming(false)} type="button">
                {t("아니요")}
              </button>
              <button
                className="decline-button"
                onClick={() => {
                  setConfirming(false)
                  onAnswer(request, "decline")
                }}
                type="button"
              >
                {t("거절하기")}
              </button>
            </>
          ) : (
            <>
              <button className="cancel-button" onClick={() => setConfirming(true)} type="button">
                {t("거절하기")}
              </button>
              <button
                className="primary-button"
                onClick={() => onAnswer(request, "accept")}
                type="button"
              >
                <Icon name="check" size={16} /> {t("수락하기")}
              </button>
            </>
          )
        ) : (
          <>
            <span className={request.status === "수락" ? "request-result confirmed" : "request-result"}>
              {request.status === "수락" && <Icon name="check" size={15} />}
              {request.status === "수락" ? t("협찬 확정") : t("거절한 제안")}
              {request.respondedAt && <small>{formatDateTime(request.respondedAt)}</small>}
            </span>
            {request.status === "수락" && (
              <button className="detail-button" onClick={() => onOpenAgreement(request.id)} type="button">
                <Icon name="file" size={15} /> {t("계약서")}
              </button>
            )}
          </>
        )}
      </div>
      {request.status === "수락" && (
        <RequestProgress createdAt={request.createdAt} day={request.eventDate} respondedAt={request.respondedAt} />
      )}
    </article>
  )
}

// Proposals student groups sent to the brand, to accept or decline, and
// under 검토 중 the offers it sent that wait for an answer, to take back.
export function InboxPage({
  requests,
  sent,
  onAnswer,
  onWithdraw,
  onOpenAgreement,
}: {
  requests: SponsorRequest[]
  sent: SentProposal[]
  onAnswer: (request: SponsorRequest, decision: "accept" | "decline") => void
  onWithdraw: (proposal: SentProposal) => void
  // An accepted proposal's agreement (pages/AgreementPage.tsx).
  onOpenAgreement: (id: string) => void
}) {
  const [tab, setTab] = useState<RequestStatus>("검토 중")
  const current = tabs.find((item) => item.status === tab) ?? tabs[0]
  const list = requests.filter((request) => request.status === tab)
  const waitingSent = sent.filter((item) => item.status === "검토 중").length

  const received =
    list.length === 0 ? (
      <p className="day-empty inbox-empty">{t(current.empty)}</p>
    ) : (
      <div className="request-grid stagger">
        {list.map((request) => (
          <RequestCard key={request.id} onAnswer={onAnswer} onOpenAgreement={onOpenAgreement} request={request} />
        ))}
      </div>
    )

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Proposal Inbox"
        title={t("받은 협찬 제안")}
        description={t("학생단체가 보낸 제안을 확인하고 협찬 여부를 정해 주세요. 우리 브랜드가 보낸 제안도 검토 중에서 보고 취소할 수 있어요.")}
      />

      <TabBar
        items={tabs.map((item) => ({
          value: item.status,
          label: (
            <>
              {t(item.label)}
              <em>
                {requests.filter((request) => request.status === item.status).length +
                  (item.status === "검토 중" ? waitingSent : 0)}
              </em>
            </>
          ),
        }))}
        label={t("제안 상태")}
        onChange={setTab}
        value={tab}
      />

      {tab === "검토 중" ? (
        <PendingBothWays
          key={tab}
          received={received}
          receivedCount={list.length}
          sent={sent}
          onWithdraw={onWithdraw}
        />
      ) : (
        <div key={tab}>{received}</div>
      )}
    </section>
  )
}
