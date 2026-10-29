import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { BillingInfo } from "../types"
import { Icon } from "./Icon"
import { Presence } from "./Presence"

// 요금제 on a brand's 내 정보 (backend lib/pro.ts): the plan it is on, this
// month's proposals against the free plan's limit, the two plans side by
// side, and paying for 30 days of Pro (or 30 more).
export function PlanCard({ onNotice }: { onNotice: (message: string) => void }) {
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

  if (!billing) return <p className="field-hint">{t("요금제를 불러오고 있어요…")}</p>
  const { plan, prices } = billing
  const plans = [
    {
      name: t("무료"),
      price: t("0원"),
      current: !plan.pro,
      items: [
        t("한 달에 협찬 제안 {count}건", { count: plan.freeOffers }),
        t("성과 분석 · CSV · PDF"),
        t("상세 성과 리포트 건당 {price}", { price: fullWon(prices.report) }),
      ],
    },
    {
      name: t("프로"),
      price: t("{price} / {days}일", { price: fullWon(prices.pro), days: prices.proDays }),
      current: plan.pro,
      items: [t("협찬 제안 제한 없음"), t("상세 성과 리포트 모두 포함"), t("브랜드 카드에 PRO 표시")],
    },
  ]
  return (
    <>
      <p className="plan-status">
        {plan.pro && plan.until
          ? t("프로를 쓰고 있어요 · {date}까지", { date: formatFullDate(plan.until) })
          : t("무료 요금제 · 이번 달 협찬 제안 {used}/{limit}건", { used: plan.offersThisMonth, limit: plan.freeOffers })}
      </p>
      <div className="plan-grid">
        {plans.map((item) => (
          <article className={item.current ? "plan-option current" : "plan-option"} key={item.name}>
            <header>
              <strong>{item.name}</strong>
              {item.current && <em>{t("지금 요금제")}</em>}
            </header>
            <span className="plan-price">{item.price}</span>
            <ul>
              {item.items.map((line) => (
                <li key={line}>
                  <Icon name="check" size={14} />
                  {line}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <button className="primary-button" disabled={!billing.canPay} onClick={() => setBuying(true)} type="button">
        {plan.pro ? t("프로 {days}일 연장하기", { days: prices.proDays }) : t("프로 시작하기")}
      </button>
      {!billing.canPay && <p className="field-hint">{t("데모 계정은 테스트 결제로만 시연할 수 있어요.")}</p>}
      <p className="field-hint">{t("자동으로 결제되지 않아요. 끝나는 날이 다가오면 다시 결제해 이어서 쓸 수 있어요.")}</p>
      <Presence show={buying}>
        <PaymentModal
          amount={prices.pro}
          kind="pro"
          lines={[
            { label: t("상품"), value: t("uniconnect 프로") },
            { label: t("기간"), value: t("{days}일", { days: prices.proDays }) },
          ]}
          onClose={() => setBuying(false)}
          onTransferAsked={() => {
            setBuying(false)
            onNotice(t("계좌 입금을 요청했어요. 입금이 확인되면 프로가 시작돼요."))
          }}
          targetId=""
          title={t("프로 결제")}
        />
      </Presence>
    </>
  )
}
