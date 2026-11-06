import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { BillingInfo, Role } from "../types"
import { Presence } from "./Presence"

// 내 정보의 공개 소개 위에 붙는 상단 광고 (backend lib/ads.ts). 30일 동안
// 리스팅이 반대쪽 카탈로그의 맨 앞에 AD 표시와 함께 나온다. 브랜드는 그룹보다
// 더 낸다. 아직 진행 중일 때 연장하면 10%가 할인되며, 정가에 취소선을 그어 함께
// 보여 준다 (기준가). 다른 상품과 같이(PaymentModal) 카드나 계좌이체로
// 결제한다.
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
        <p className="field-hint">{t("부가세 포함 {price}", { price: fullWon(Math.round(ad.next * (1 + billing.prices.vatRate))) })}</p>
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
