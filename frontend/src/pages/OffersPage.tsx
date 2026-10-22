import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { RequestProgress } from "../components/RequestProgress"
import { TabBar } from "../components/TabBar"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import type { Match, RequestStatus, SponsorOffer } from "../types"

// Card class for each status (the brand inbox's cards).
const cardState: Record<RequestStatus, string> = {
  "검토 중": "pending",
  수락: "accepted",
  거절: "declined",
}

const tabs: { status: RequestStatus; label: string; empty: string }[] = [
  { status: "검토 중", label: "검토 중", empty: "답을 기다리는 협찬 제안이 없어요." },
  { status: "수락", label: "수락함", empty: "아직 수락한 협찬이 없어요." },
  { status: "거절", label: "거절함", empty: "거절한 협찬 제안이 없어요." },
]

function OfferCard({
  offer,
  brand,
  onAnswer,
}: {
  offer: SponsorOffer
  // The brand's listing, for its logo.
  brand?: Match
  onAnswer: (offer: SponsorOffer, decision: "accept" | "decline") => void
}) {
  // Declining can't be undone, so it asks once more.
  const [confirming, setConfirming] = useState(false)

  return (
    <article className={`request-card ${cardState[offer.status]}`}>
      <div className="request-head">
        <BrandMark match={brand ?? offer} />
        <div className="request-from">
          <strong>{offer.brandName}</strong>
          <span>브랜드</span>
        </div>
        <time dateTime={offer.createdAt}>{formatDateTime(offer.createdAt)} 받음</time>
      </div>

      <dl className="request-facts">
        <div>
          <dt>캠페인</dt>
          <dd>{offer.campaignName}</dd>
        </div>
        <div>
          <dt>일정</dt>
          <dd>
            {offer.campaignDate ? formatDay(offer.campaignDate) : "협의 중"}
            {offer.campaignDate && <em>{dDayLabel(offer.campaignDate)}</em>}
          </dd>
        </div>
      </dl>

      <div className="request-ask">
        <span>제공 협찬</span>
        <strong>{offer.offer}</strong>
      </div>
      <p className="request-message">{offer.message}</p>

      <div className="request-actions">
        {offer.status === "검토 중" ? (
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
                  onAnswer(offer, "decline")
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
              <button className="primary-button" onClick={() => onAnswer(offer, "accept")} type="button">
                <Icon name="check" size={16} /> 수락하기
              </button>
            </>
          )
        ) : (
          <span className={offer.status === "수락" ? "request-result confirmed" : "request-result"}>
            {offer.status === "수락" && <Icon name="check" size={15} />}
            {offer.status === "수락" ? "협찬 확정" : "거절한 제안"}
            {offer.respondedAt && <small>{formatDateTime(offer.respondedAt)}</small>}
          </span>
        )}
      </div>
      {offer.status === "수락" && (
        <RequestProgress createdAt={offer.createdAt} day={offer.campaignDate} respondedAt={offer.respondedAt} />
      )}
    </article>
  )
}

// Proposals brands sent to the student group, to accept or decline.
export function OffersPage({
  offers,
  brands,
  onAnswer,
}: {
  offers: SponsorOffer[]
  brands: Match[]
  onAnswer: (offer: SponsorOffer, decision: "accept" | "decline") => void
}) {
  const [tab, setTab] = useState<RequestStatus>("검토 중")
  const current = tabs.find((item) => item.status === tab) ?? tabs[0]
  const list = offers.filter((offer) => offer.status === tab)

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Offer inbox"
        title="받은 협찬 제안"
        description="브랜드가 보낸 협찬 제안을 확인하고 함께할지 정해 주세요."
      />

      <TabBar
        items={tabs.map((item) => ({
          value: item.status,
          label: (
            <>
              {item.label}
              <em>{offers.filter((offer) => offer.status === item.status).length}</em>
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
          {list.map((offer) => (
            <OfferCard
              brand={brands.find((brand) => brand.id === offer.brandId)}
              key={offer.id}
              offer={offer}
              onAnswer={onAnswer}
            />
          ))}
        </div>
      )}
    </section>
  )
}
