import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { t } from "../i18n"
import { fullWon } from "../lib/sponsorships"
import type { Account, PlanTable, PublicPlan } from "../types"

// 공개 요금제 표. 금액과 한도는 서버(GET /api/billing/plans)의 값만 쓰고, 이름과
// 설명은 여기서 쓴다. 준비 중인 요금제는 판매가 열리기 전까지 가격과 내용을
// 약속하지 않는다.
function planLines(plan: PublicPlan, reportPrice: number) {
  if (plan.id === "free") {
    return [
      t("한 달에 협찬 제안 {count}건", { count: plan.limits?.offersPerMonth ?? 0 }),
      t("성과 분석 · CSV · PDF"),
      t("상세 분석 리포트 건당 {price}", { price: fullWon(reportPrice) }),
    ]
  }
  if (plan.id === "growth") {
    return [
      t("협찬 제안 제한 없음"),
      t("상세 분석 리포트 모두 포함"),
      t("캠퍼스 포트폴리오 분석: 학교 · 시기 · 단체 종류별 성과와 다음 예산"),
      t("운영자 1:1 섭외 요청 한 달 {count}건", { count: plan.limits?.partnerRequestsPerMonth ?? 0 }),
      t("브랜드 카드에 PARTNERS 표시"),
      ...(plan.limits?.alwaysOnCoupons ? [t("상시 쿠폰과 월간 리포트 포함")] : []),
    ]
  }
  // 판매가 열린 뒤에만 내용을 적는다.
  if (plan.id === "local" && plan.status === "open") return [t("매장 상시 쿠폰 QR"), t("직원 쿠폰 확인"), t("월간 기본 리포트")]
  return []
}

export function PlansPage({
  account,
  visitor,
  onSignup,
  onOpenProfile,
}: {
  account: Account | null
  visitor: boolean
  onSignup: () => void
  onOpenProfile: () => void
}) {
  const [table, setTable] = useState<PlanTable>()
  const [pro, setPro] = useState<boolean>()
  const [failed, setFailed] = useState("")
  const brand = account?.role === "브랜드"

  useEffect(() => {
    let cancelled = false
    api.plans().then(
      (result) => {
        if (!cancelled) setTable(result)
      },
      (error: unknown) => {
        if (!cancelled) setFailed(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!brand) return
    let cancelled = false
    // 지금 요금제 표시는 없어도 표를 읽을 수 있어 실패를 알리지 않는다.
    api.billing().then(
      (result) => {
        if (!cancelled) setPro(result.plan.pro)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [brand])

  const plans = table?.plans ?? []
  const isCurrent = (plan: PublicPlan) => pro !== undefined && plan.id === (pro ? "growth" : "free")
  return (
    <section className="page-view plans-view">
      <PageIntro
        description={t("협찬 제안이 많아지면 Growth로 넓혀요.")}
        eyebrow={t("요금제")}
        title={t("브랜드 요금제")}
      />
      {failed && <p className="field-hint">{failed}</p>}
      {!failed && !table && <p className="field-hint">{t("요금제를 불러오고 있어요…")}</p>}
      {table && (
        <>
          <div className="plan-grid plans-table">
            {plans.map((plan) => {
              const current = isCurrent(plan)
              const lines = planLines(plan, table.reportPrice)
              const className = ["plan-option", current && "current", plan.status === "soon" && "soon"].filter(Boolean).join(" ")
              return (
                <article className={className} key={plan.id}>
                  <header>
                    <strong>{plan.id === "free" ? t("무료") : plan.id === "local" ? "Local" : "Growth"}</strong>
                    {current && <em>{t("지금 요금제")}</em>}
                    {plan.status === "soon" && <em>{t("준비 중")}</em>}
                  </header>
                  {plan.price !== null && (
                    <div className="plan-amount">
                      <span className="plan-price">
                        {plan.days
                          ? t("{price} / {days}일", { price: fullWon(plan.price), days: plan.days })
                          : fullWon(plan.price)}
                      </span>
                      {plan.price > 0 && plan.priceWithVat !== null && (
                        <small>{t("부가세 포함 {price}", { price: fullWon(plan.priceWithVat) })}</small>
                      )}
                    </div>
                  )}
                  {plan.status === "soon" && <p>{t("동네 가게를 위한 요금제를 준비하고 있어요.")}</p>}
                  {lines.length > 0 && (
                    <ul>
                      {lines.map((line) => (
                        <li key={line}>
                          <Icon name="check" size={14} />
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  {plan.status === "open" && visitor && (
                    <Pill onClick={onSignup} variant={plan.id === "growth" ? "primary" : "outline"}>
                      {t("회원가입")}
                    </Pill>
                  )}
                  {plan.orderKind && brand && !current && pro !== undefined && (
                    <Pill onClick={onOpenProfile}>{t("내 정보에서 시작하기")}</Pill>
                  )}
                </article>
              )
            })}
          </div>
          <ul className="plans-notes">
            <li>{t("금액은 부가세 별도예요. 결제할 때 {rate}%가 더해져요.", { rate: Math.round(table.vatRate * 100) })}</li>
            <li>
              {t("협찬이 성사되면 브랜드가 협찬액의 {rate}%를 수수료로 내요. 요금제와 상관없이 같아요.", {
                rate: Math.round(table.feeRate * 100),
              })}
            </li>
            <li>{t("자동으로 결제되지 않아요. 끝나는 날이 다가오면 다시 결제해 이어서 쓸 수 있어요.")}</li>
            <li>{t("학생단체는 협찬 매칭을 무료로 써요.")}</li>
          </ul>
        </>
      )}
    </section>
  )
}
