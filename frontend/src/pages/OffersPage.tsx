import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Presence } from "../components/Presence"
import { RequestProgress } from "../components/RequestProgress"
import { PendingBothWays } from "../components/SentProposals"
import { TabBar } from "../components/TabBar"
import { t } from "../i18n"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import { AcceptModal } from "../modals/AcceptModal"
import type { Match, RequestStatus, SentProposal, SponsorOffer } from "../types"

// 상태별 카드 클래스(브랜드 받은함의 카드).
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
  { status: "검토 중", label: "검토 중", empty: "답을 기다리는 협찬 제안이 없어요." },
  { status: "수락", label: "수락함", empty: "아직 수락한 협찬이 없어요." },
  { status: "거절", label: "거절함", empty: "거절한 협찬 제안이 없어요." },
  { status: "마감", label: "마감", empty: "마감된 협찬 제안이 없어요." },
]

function OfferCard({
  offer,
  brand,
  onAnswer,
  onOpenAgreement,
}: {
  offer: SponsorOffer
  // 로고를 위한 브랜드의 리스팅.
  brand?: Match
  onAnswer: (offer: SponsorOffer, decision: "accept" | "decline") => void | Promise<void>
  onOpenAgreement: (id: string) => void
}) {
  // 거절은 되돌릴 수 없으므로 한 번 더 묻는다.
  const [confirming, setConfirming] = useState(false)
  // 수락은 무엇을 수락하는지와 그다음 순서를 보여 주는 확인창을 거친다.
  const [accepting, setAccepting] = useState(false)

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
              <button className="primary-button" onClick={() => setAccepting(true)} type="button">
                <Icon name="check" size={16} /> {t("수락하기")}
              </button>
            </>
          )
        ) : (
          <>
            <span className={offer.status === "수락" ? "request-result confirmed" : "request-result"}>
              {offer.status === "수락" && <Icon name="check" size={15} />}
              {offer.status === "수락"
                ? offer.contract === "confirmed"
                  ? t("협찬 확정")
                  : t("제안 수락 · 계약 확인 대기")
                : offer.status === "취소됨"
                  ? t("취소된 협찬")
                  : offer.status === "마감"
                    ? t("마감된 제안")
                    : t("거절한 제안")}
              {offer.status === "취소됨" && offer.canceledAt ? (
                <small>{formatDateTime(offer.canceledAt)}</small>
              ) : offer.status === "마감" ? (
                <small>{t("캠페인이 끝나 마감됐어요.")}</small>
              ) : (
                offer.respondedAt && <small>{formatDateTime(offer.respondedAt)}</small>
              )}
            </span>
            {(offer.status === "수락" || offer.status === "취소됨") && (
              <button
                className={offer.status === "수락" && offer.contract !== "confirmed" ? "primary-button" : "detail-button"}
                onClick={() => onOpenAgreement(offer.id)}
                type="button"
              >
                <Icon name="file" size={15} /> 
                {offer.status === "수락" && offer.contract !== "confirmed" ? t("계약서 열기") : t("계약서")}
              </button>
            )}
          </>
        )}
      </div>
      {offer.status === "수락" && (
        <RequestProgress
          contractAt={offer.contractAt}
          createdAt={offer.createdAt}
          day={offer.campaignDate}
          respondedAt={offer.respondedAt}
        />
      )}
      <Presence show={accepting}>
        {accepting && (
          <AcceptModal
            side="학생단체"
            partner={offer.brandName}
            eventName={offer.campaignName}
            eventDate={offer.campaignDate || undefined}
            terms={offer.offer}
            onClose={() => setAccepting(false)}
            onConfirm={async () => {
              await onAnswer(offer, "accept")
              setAccepting(false)
            }}
          />
        )}
      </Presence>
    </article>
  )
}

// 브랜드가 학생단체에 보낸 제안은 수락하거나 거절하고, 검토 중에는 단체가 보낸
// 제안 중 답을 기다리는 것을 거둘 수 있게 보여 준다.
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
  onAnswer: (offer: SponsorOffer, decision: "accept" | "decline") => void | Promise<void>
  onWithdraw: (proposal: SentProposal) => void
  // 수락된 제안의 계약서(pages/AgreementPage.tsx).
  onOpenAgreement: (id: string) => void
}) {
  const [tab, setTab] = useState<RequestStatus>("검토 중")
  const current = tabs.find((item) => item.status === tab) ?? tabs[0]
  const list = offers.filter((offer) => inTab(offer.status, tab))
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
        description={t("브랜드가 보낸 협찬 제안이 도착했어요. 내가 보낸 제안은 검토 중에서 봐요.")}
      />

      <TabBar
        items={tabs.map((item) => ({
          value: item.status,
          label: (
            <>
              {t(item.label)}
              <em>
                {offers.filter((offer) => inTab(offer.status, item.status)).length +
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
