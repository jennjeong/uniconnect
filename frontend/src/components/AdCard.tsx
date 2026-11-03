import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { BillingInfo, Role } from "../types"
import { Presence } from "./Presence"

// 상단 광고 under 내 정보's 공개 소개 (backend lib/ads.ts): for 30 days the
// listing comes first on the other side's catalog, marked AD. A brand pays
// more than a group; extending while it still runs takes 10% off, shown
// against the full price struck through (an anchor). Paid like
// the other products (PaymentModal), by card or bank transfer.
export function AdCard({ role, onNotice }: { role: Role; onNotice: (message: string) => void }) {
  const [billing, setBilling] = useState<BillingInfo>()
  const [buying, setBuying] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.billing().then(
      (result) => {
        if (!cancelled) setBilling(result)
      },
      (error: unknown) => {
        if (!cancelled) onNotice(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [onNotice])

  if (!billing) return null
  const { ad } = billing
  const where = role === "브랜드" ? t("학생단체의 추천 매칭") : t("브랜드의 단체 찾기")
  return (
    <div className="ad-card">
      <div className="ad-card-copy">
        <strong>
          {t("상단 광고")} <em className="ad-mark">AD</em>
        </strong>
        <p>
          {ad.until
            ? t("{where} 맨 위에 보이고 있어요 · {date}까지", { where, date: formatFullDate(ad.until) })
            : t("{days}일 동안 {where} 맨 위에 우리 소개를 보여 줘요. 한 달 {price}.", {
                days: ad.days,
                where,
                price: fullWon(ad.price),
              })}
        </p>
        {ad.renewing && (
          <p className="ad-card-deal">
            {t("끝나기 전에 연장하면 10% 할인돼요.")} <s>{fullWon(ad.price)}</s> <strong>{fullWon(ad.next)}</strong>
          </p>
        )}
      </div>
      <button className="primary-button" disabled={!billing.canPayAd} onClick={() => setBuying(true)} type="button">
        {ad.renewing ? t("광고 연장하기") : t("광고하기")}
      </button>
      {!billing.canPayAd && <p className="field-hint">{t("데모 계정은 테스트 결제로만 시연할 수 있어요.")}</p>}
      <Presence show={buying}>
        <PaymentModal
          amount={ad.next}
          kind="ad"
          lines={[
            { label: t("상품"), value: t("상단 광고") },
            { label: t("기간"), value: t("{days}일", { days: ad.days }) },
            ...(ad.renewing ? [{ label: t("연장 할인"), value: `-${fullWon(ad.price - ad.next)}` }] : []),
          ]}
          onClose={() => setBuying(false)}
          onTransferAsked={() => {
            setBuying(false)
            onNotice(t("계좌 입금을 요청했어요. 입금이 확인되면 광고가 시작돼요."))
          }}
          targetId=""
          title={t("상단 광고 결제")}
        />
      </Presence>
    </div>
  )
}
