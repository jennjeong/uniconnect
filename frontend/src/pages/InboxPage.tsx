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

// 상태별 카드 클래스.
const cardState: Record<RequestStatus, string> = {
  "검토 중": "pending",
  수락: "accepted",
  거절: "declined",
  취소됨: "canceled",
  마감: "closed",
}

// 취소된 수락 건은 기록으로 수락함에 남는다.
const inTab = (status: RequestStatus, tab: RequestStatus) => status === tab || (tab === "수락" && status === "취소됨")

const tabs: { status: RequestStatus; label: string; empty: string }[] = [
  { status: "검토 중", label: "검토 중", empty: "답을 기다리는 제안이 없어요." },
  { status: "수락", label: "수락함", empty: "아직 수락한 제안이 없어요." },
  { status: "거절", label: "거절함", empty: "거절한 제안이 없어요." },
  { status: "마감", label: "마감", empty: "마감된 제안이 없어요." },
]

function RequestCard({
  request,
  onAnswer,
  onOpenAgreement,
  onOpenEvent,
}: {
  request: SponsorRequest
  onAnswer: (request: SponsorRequest, decision: "accept" | "decline") => void
  onOpenAgreement: (id: string) => void
  // 제안이 행사에 관한 것이면 그 단체의 행사 페이지.
  onOpenEvent?: (eventId: string) => void
}) {
  // 거절은 되돌릴 수 없으므로 한 번 더 묻는다.
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
          <dd>
            {request.eventId && onOpenEvent ? (
              <button className="text-link" onClick={() => onOpenEvent(request.eventId!)} type="button">
                {request.eventName}
              </button>
            ) : (
              request.eventName
            )}
          </dd>
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
              {request.status === "수락"
                ? t("협찬 확정")
                : request.status === "취소됨"
                  ? t("취소된 협찬")
                  : request.status === "마감"
                    ? t("마감된 제안")
                    : t("거절한 제안")}
              {request.status === "취소됨" && request.canceledAt ? (
                <small>{formatDateTime(request.canceledAt)}</small>
              ) : request.status === "마감" ? (
                <small>{t("행사가 끝나 마감됐어요.")}</small>
              ) : (
                request.respondedAt && <small>{formatDateTime(request.respondedAt)}</small>
              )}
            </span>
            {(request.status === "수락" || request.status === "취소됨") && (
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

// 학생단체가 브랜드에 보낸 제안은 수락하거나 거절하고, 검토 중에는 브랜드가
// 보낸 제안 중 답을 기다리는 것을 거둘 수 있게 보여 준다.
export function InboxPage({
  requests,
  sent,
  onAnswer,
  onWithdraw,
  onOpenAgreement,
  onOpenEvent,
}: {
  requests: SponsorRequest[]
  sent: SentProposal[]
  onAnswer: (request: SponsorRequest, decision: "accept" | "decline") => void
  onWithdraw: (proposal: SentProposal) => void
  // 수락된 제안의 계약서(pages/AgreementPage.tsx).
  onOpenAgreement: (id: string) => void
  onOpenEvent?: (eventId: string) => void
}) {
  const [tab, setTab] = useState<RequestStatus>("검토 중")
  const current = tabs.find((item) => item.status === tab) ?? tabs[0]
  const list = requests.filter((request) => inTab(request.status, tab))
  const waitingSent = sent.filter((item) => item.status === "검토 중").length

  const received =
    list.length === 0 ? (
      <p className="day-empty inbox-empty">{t(current.empty)}</p>
    ) : (
      <div className="request-grid stagger">
        {list.map((request) => (
          <RequestCard
            key={request.id}
            onAnswer={onAnswer}
            onOpenAgreement={onOpenAgreement}
            onOpenEvent={onOpenEvent}
            request={request}
          />
        ))}
      </div>
    )

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Proposal Inbox"
        title={t("받은 협찬 제안")}
        description={t("학생단체가 보낸 제안이 도착했어요. 내가 보낸 제안은 검토 중에서 봐요.")}
      />

      <TabBar
        items={tabs.map((item) => ({
          value: item.status,
          label: (
            <>
              {t(item.label)}
              <em>
                {requests.filter((request) => inTab(request.status, item.status)).length +
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
