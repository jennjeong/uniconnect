import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { TabBar } from "../components/TabBar"
import {
  dDayLabel,
  formatDateTime,
  formatDay,
  fromIsoDate,
  shortDay,
  toIsoDate,
  todayIso,
} from "../lib/date"
import type { RequestStatus, SponsorRequest } from "../types"

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

// An accepted sponsorship from the proposal to its report, each step with
// its day: done up to today, the next one under way.
function progressSteps(request: SponsorRequest) {
  const dayOf = (timestamp?: string) => (timestamp ? toIsoDate(new Date(timestamp)) : "")
  const event = fromIsoDate(request.eventDate)
  const afterEvent = (days: number) =>
    event ? toIsoDate(new Date(event.getFullYear(), event.getMonth(), event.getDate() + days)) : ""
  const today = todayIso()
  const steps = [
    { label: "제안 받음", day: dayOf(request.createdAt) },
    { label: "협찬 확정", day: dayOf(request.respondedAt) },
    { label: "행사 당일", day: request.eventDate },
    { label: "성과 리포트", day: afterEvent(7) },
  ]
  const next = steps.findIndex((step) => !step.day || step.day > today)
  return steps.map((step, index) => ({
    ...step,
    state: next === -1 || index < next ? "step-done" : index === next ? "step-current" : "step-next",
  }))
}

function RequestProgress({ request }: { request: SponsorRequest }) {
  return (
    <ol aria-label="협찬 진행 상황" className="request-progress">
      {progressSteps(request).map((step) => (
        <li className={step.state} key={step.label}>
          <i aria-hidden="true" />
          <strong>{step.label}</strong>
          <time dateTime={step.day || undefined}>{step.day ? shortDay(step.day) : "미정"}</time>
        </li>
      ))}
    </ol>
  )
}

function RequestCard({
  request,
  onAnswer,
}: {
  request: SponsorRequest
  onAnswer: (request: SponsorRequest, decision: "accept" | "decline") => void
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
        <time dateTime={request.createdAt}>{formatDateTime(request.createdAt)} 받음</time>
      </div>

      <dl className="request-facts">
        <div>
          <dt>행사</dt>
          <dd>{request.eventName}</dd>
        </div>
        <div>
          <dt>일정</dt>
          <dd>
            {request.eventDate ? formatDay(request.eventDate) : "협의 중"}
            {request.eventDate && <em>{dDayLabel(request.eventDate)}</em>}
          </dd>
        </div>
        <div>
          <dt>규모</dt>
          <dd>{request.people}</dd>
        </div>
      </dl>

      <div className="request-ask">
        <span>요청 협찬</span>
        <strong>{request.ask}</strong>
      </div>
      <p className="request-message">{request.message}</p>

      <div className="request-actions">
        {request.status === "검토 중" ? (
          confirming ? (
            <>
              <span className="request-confirm">이 제안을 거절할까요?</span>
              <button className="cancel-button" onClick={() => setConfirming(false)} type="button">
                아니요
              </button>
              <button
                className="decline-button"
                onClick={() => {
                  setConfirming(false)
                  onAnswer(request, "decline")
                }}
                type="button"
              >
                거절하기
              </button>
            </>
          ) : (
            <>
              <button className="cancel-button" onClick={() => setConfirming(true)} type="button">
                거절
              </button>
              <button
                className="primary-button"
                onClick={() => onAnswer(request, "accept")}
                type="button"
              >
                <Icon name="check" size={16} /> 수락하기
              </button>
            </>
          )
        ) : (
          <span className={request.status === "수락" ? "request-result confirmed" : "request-result"}>
            {request.status === "수락" && <Icon name="check" size={15} />}
            {request.status === "수락" ? "협찬 확정" : "거절한 제안"}
            {request.respondedAt && <small>{formatDateTime(request.respondedAt)}</small>}
          </span>
        )}
      </div>
      {request.status === "수락" && <RequestProgress request={request} />}
    </article>
  )
}

// Proposals student groups sent to the brand, to accept or decline.
export function InboxPage({
  requests,
  onAnswer,
}: {
  requests: SponsorRequest[]
  onAnswer: (request: SponsorRequest, decision: "accept" | "decline") => void
}) {
  const [tab, setTab] = useState<RequestStatus>("검토 중")
  const current = tabs.find((item) => item.status === tab) ?? tabs[0]
  const list = requests.filter((request) => request.status === tab)

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Proposal inbox"
        title="받은 협찬 제안"
        description="학생단체가 보낸 제안을 확인하고 협찬 여부를 정해 주세요."
      />

      <TabBar
        items={tabs.map((item) => ({
          value: item.status,
          label: (
            <>
              {item.label}
              <em>{requests.filter((request) => request.status === item.status).length}</em>
            </>
          ),
        }))}
        label="제안 상태"
        onChange={setTab}
        value={tab}
      />

      {list.length === 0 ? (
        <p className="day-empty inbox-empty" key={tab}>
          {current.empty}
        </p>
      ) : (
        <div className="request-grid stagger" key={tab}>
          {list.map((request) => (
            <RequestCard key={request.id} onAnswer={onAnswer} request={request} />
          ))}
        </div>
      )}
    </section>
  )
}
