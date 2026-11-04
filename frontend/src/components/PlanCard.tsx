import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { BillingInfo } from "../types"
import { Icon } from "./Icon"
import { Presence } from "./Presence"

// 브랜드의 내 정보에 있는 요금제 (backend lib/pro.ts). 쓰고 있는 요금제, 이번
// 달 제안 수와 무료 요금제의 한도, 무료와 캠퍼스 파트너스를 나란히 비교한 표,
// 30일(또는 30일 추가) 결제, 파트너의 1:1 섭외 요청을 운영진에게 보내는 기능을
// 담는다.
export function PlanCard({ onNotice }: { onNotice: (message: string) => void }) {
  const [billing, setBilling] = useState<BillingInfo>()
  const [buying, setBuying] = useState(false)
  const [wanted, setWanted] = useState("")
  const [asking, setAsking] = useState(false)

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
        t("상세 분석 리포트 건당 {price}", { price: fullWon(prices.report) }),
      ],
    },
    {
      name: t("캠퍼스 파트너스"),
      price: t("{price} / {days}일", { price: fullWon(prices.pro), days: prices.proDays }),
      current: plan.pro,
      items: [
        t("협찬 제안 제한 없음"),
        t("상세 분석 리포트 모두 포함"),
        t("캠퍼스 포트폴리오 분석: 학교 · 시기 · 단체 종류별 성과와 다음 예산"),
        t("운영자 1:1 섭외 요청 한 달 2건"),
        t("브랜드 카드에 PARTNERS 표시"),
      ],
    },
  ]
  return (
    <>
      <p className="plan-status">
        {plan.pro && plan.until
          ? t("캠퍼스 파트너스를 쓰고 있어요 · {date}까지", { date: formatFullDate(plan.until) })
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
        {plan.pro ? t("캠퍼스 파트너스 {days}일 연장하기", { days: prices.proDays }) : t("캠퍼스 파트너스 시작하기")}
      </button>
      {!billing.canPay && <p className="field-hint">{t("데모 계정은 테스트 결제로만 시연할 수 있어요.")}</p>}
      <p className="field-hint">{t("자동으로 결제되지 않아요. 끝나는 날이 다가오면 다시 결제해 이어서 쓸 수 있어요.")}</p>
      {plan.pro && (
        <form
          className="partner-request"
          onSubmit={(event) => {
            event.preventDefault()
            setAsking(true)
            api.partnerRequest(wanted).then(
              ({ plan: next }) => {
                setBilling({ ...billing, plan: next })
                setWanted("")
                onNotice(t("섭외 요청을 보냈어요. 운영자가 맞는 단체를 찾아 FAQ의 내 질문으로 답해 드려요."))
              },
              (error: unknown) => onNotice(errorMessage(error)),
            ).finally(() => setAsking(false))
          }}
        >
          <label>
            {t("1:1 섭외 요청 · 이번 달 {count}건 남음", { count: plan.partnerRequestsLeft })}
            <textarea
              maxLength={1000}
              onChange={(event) => setWanted(event.target.value)}
              placeholder={t("예) 12월에 공릉동 대학 축제 중 관객 300명 이상, 시음 부스가 가능한 행사를 찾아 주세요.")}
              rows={3}
              value={wanted}
            />
          </label>
          <button className="cancel-button" disabled={asking || plan.partnerRequestsLeft === 0 || wanted.trim().length < 10} type="submit">
            {t("섭외 요청 보내기")}
          </button>
        </form>
      )}
      <Presence show={buying}>
        <PaymentModal
          amount={prices.pro}
          kind="pro"
          lines={[
            { label: t("상품"), value: t("캠퍼스 파트너스") },
            { label: t("기간"), value: t("{days}일", { days: prices.proDays }) },
          ]}
          onClose={() => setBuying(false)}
          onTransferAsked={() => {
            setBuying(false)
            onNotice(t("계좌 입금을 요청했어요. 입금이 확인되면 캠퍼스 파트너스가 시작돼요."))
          }}
          targetId=""
          title={t("캠퍼스 파트너스 결제")}
        />
      </Presence>
    </>
  )
}
