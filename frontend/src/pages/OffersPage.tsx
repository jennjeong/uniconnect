import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { RequestProgress } from "../components/RequestProgress"
import { PendingBothWays } from "../components/SentProposals"
import { TabBar } from "../components/TabBar"
import { t } from "../i18n"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import type { Match, RequestStatus, SentProposal, SponsorOffer } from "../types"

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
  onOpenAgreement,
}: {
  offer: SponsorOffer
  // The brand's listing, for its logo.
  brand?: Match
  onAnswer: (offer: SponsorOffer, decision: "accept" | "decline") => void
  onOpenAgreement: (id: string) => void
}) {
  // Declining can't be undone, so it asks once more.
  const [confirming, setConfirming] = useState(false)

  return (
    <article className={`request-card ${cardState[offer.status]}`}>
      <div className="request-head">
        <BrandMark match={brand ?? offer} />
        <div className="request-from">
          <strong>{offer.brandName}</strong>
          <span>{t("브랜드")}</span>
        </div>
        <time dateTime={offer.createdAt}>{t("{date} 받음", { date: formatDateTime(offer.createdAt) })}</time>
      </div>

      <dl className="request-facts">
        <div>
          <dt>{t("캠페인")}</dt>
          <dd>{offer.campaignName}</dd>
        </div>
        <div>
          <dt>{t("일정")}</dt>
          <dd>
            {offer.campaignDate ? formatDay(offer.campaignDate) : t("협의 중")}
            {offer.campaignDate && <em>{dDayLabel(offer.campaignDate)}</em>}
          </dd>
        </div>
      </dl>

      <div className="request-ask">
        <span>{t("제공 협찬")}</span>
        <strong>{offer.offer}</strong>
      </div>
      <p className="request-message">{offer.message}</p>

      <div className="request-actions">
        {offer.status === "검토 중" ? (
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
                  onAnswer(offer, "decline")
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
              <button className="primary-button" onClick={() => onAnswer(offer, "accept")} type="button">
                <Icon name="check" size={16} /> {t("수락하기")}
              </button>
            </>
          )
        ) : (
          <>
            <span className={offer.status === "수락" ? "request-result confirmed" : "request-result"}>
              {offer.status === "수락" && <Icon name="check" size={15} />}
              {offer.status === "수락" ? t("협찬 확정") : t("거절한 제안")}
              {offer.respondedAt && <small>{formatDateTime(offer.respondedAt)}</small>}
            </span>
            {offer.status === "수락" && (
              <button className="detail-button" onClick={() => onOpenAgreement(offer.id)} type="button">
                <Icon name="file" size={15} /> {t("약속서")}
              </button>
            )}
          </>
        )}
      </div>
      {offer.status === "수락" && (
        <RequestProgress createdAt={offer.createdAt} day={offer.campaignDate} respondedAt={offer.respondedAt} />
      )}
    </article>
  )
}

// Proposals brands sent to the student group, to accept or decline, and
// under 검토 중 the proposals it sent that wait for an answer, to take back.
export function OffersPage({
  offers,
  brands,
  sent,
  onAnswer,
  onWithdraw,
  onOpenAgreement,
}: {
  offers: SponsorOffer[]
  brands: Match[]
  sent: SentProposal[]
  onAnswer: (offer: SponsorOffer, decision: "accept" | "decline") => void
  onWithdraw: (proposal: SentProposal) => void
  // An accepted offer's agreement (pages/AgreementPage.tsx).
  onOpenAgreement: (id: string) => void
}) {
  const [tab, setTab] = useState<RequestStatus>("검토 중")
  const current = tabs.find((item) => item.status === tab) ?? tabs[0]
  const list = offers.filter((offer) => offer.status === tab)
  const waitingSent = sent.filter((item) => item.status === "검토 중").length
  const received =
    list.length === 0 ? (
      <p className="day-empty inbox-empty">{t(current.empty)}</p>
    ) : (
      <div className="request-grid stagger">
        {list.map((offer) => (
          <OfferCard
            brand={brands.find((brand) => brand.id === offer.brandId)}
            key={offer.id}
            offer={offer}
            onAnswer={onAnswer}
            onOpenAgreement={onOpenAgreement}
          />
        ))}
      </div>
    )

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Offer Inbox"
        title={t("받은 협찬 제안")}
        description={t("브랜드가 보낸 협찬 제안을 확인하고 함께할지 정해 주세요. 우리 단체가 보낸 제안도 검토 중에서 보고 취소할 수 있어요.")}
      />

      <TabBar
        items={tabs.map((item) => ({
          value: item.status,
          label: (
            <>
              {t(item.label)}
              <em>
                {offers.filter((offer) => offer.status === item.status).length +
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
