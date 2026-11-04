import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { usePageReturn } from "../hooks/usePageReturn"
import { t } from "../i18n"
import { payByCard } from "../lib/payments"
import { fullWon } from "../lib/sponsorships"
import type { BillingInfo, PaymentKind } from "../types"

// Pays for one thing a brand buys (backend lib/billing.ts): what it is, its
// price and the VAT added on top (as the server's vatOf works it out),
// agreeing to the paid terms, then Toss Payments' card
// window, which comes back to this page, or a request to pay by bank
// transfer, which the operators confirm. Without Toss keys only the
// transfer is offered. Pages open it, so it goes to the end of the body to
// sit over everything, the footer too.
export function PaymentModal({
  kind,
  targetId,
  title,
  amount,
  lines,
  onClose,
  onTransferAsked,
}: {
  kind: PaymentKind
  targetId: string
  title: string
  // The price before VAT, as the page last saw it; the order says the final
  // amount.
  amount: number
  // What is being bought, as label and value rows.
  lines: { label: string; value: string }[]
  onClose: () => void
  onTransferAsked: () => void
}) {
  const [billing, setBilling] = useState<BillingInfo>()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    api.billing().then(
      (result) => {
        if (!cancelled) setBilling(result)
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Back from the card window without paying.
  usePageReturn(useCallback(() => setBusy(false), []))

  const vat = billing ? Math.round(amount * billing.prices.vatRate) : undefined
  const total = amount + (vat ?? 0)

  const pay = async (how: "card" | "transfer") => {
    if (!agreed) {
      setError(t("결제 내용과 환불 규정에 동의해 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const order = await api.order(kind, targetId)
      if (how === "card" && billing?.card) {
        await payByCard(order, billing.card.clientKey)
        return
      }
      await api.askTransfer(order.order.id)
      onTransferAsked()
    } catch (failure) {
      setError(failure instanceof Error && failure.message === "sdk" ? t("결제창을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.") : errorMessage(failure))
      setBusy(false)
    }
  }

  return createPortal(
    <Modal kicker="Payment" name="payment" onClose={onClose} title={title}>
      <div className="payment-sheet">
        {billing?.testMode && (
          <p className="payment-test">{t("테스트 결제예요. 결제창을 끝까지 진행해도 실제로 돈이 빠져나가지 않아요.")}</p>
        )}
        <dl className="payment-lines">
          {lines.map((line) => (
            <div key={line.label}>
              <dt>{line.label}</dt>
              <dd>{line.value}</dd>
            </div>
          ))}
          <div>
            <dt>{t("공급가액")}</dt>
            <dd>{fullWon(amount)}</dd>
          </div>
          <div>
            <dt>{t("부가세 ({rate}%)", { rate: Math.round((billing?.prices.vatRate ?? 0.1) * 100) })}</dt>
            <dd>{vat === undefined ? "…" : fullWon(vat)}</dd>
          </div>
          <div className="payment-total">
            <dt>{t("결제 금액")}</dt>
            <dd>
              {vat === undefined ? "…" : fullWon(total)}
              <small>{t("부가세 포함")}</small>
            </dd>
          </div>
        </dl>
        <label className={agreed ? "check-row payment-agree checked" : "check-row payment-agree"}>
          <input checked={agreed} onChange={(event) => setAgreed(event.target.checked)} type="checkbox" />
          <span aria-hidden="true" className="check-box">
            <Icon name="check" size={14} />
          </span>
          <span>
            {t("결제 내용을 확인했고 ")}
            <a href="/terms#paid" rel="noreferrer" target="_blank">
              {t("유료 서비스 이용 조건과 환불 규정")}
            </a>
            {t("에 동의해요.")}
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!billing ? (
          <p className="field-hint">{t("결제 방법을 불러오고 있어요…")}</p>
        ) : (
          <div className="payment-actions">
            {billing.card ? (
              <button className="primary-button wide" disabled={busy} onClick={() => void pay("card")} type="button">
                {t("카드로 {amount} 결제하기", { amount: fullWon(total) })}
              </button>
            ) : (
              <p className="payment-note">{t("카드 결제는 준비 중이에요. 계좌 입금을 요청하면 운영자가 입금 계좌를 안내하고 입금이 확인되면 바로 반영돼요.")}</p>
            )}
            <button className={billing.card ? "cancel-button wide" : "primary-button wide"} disabled={busy} onClick={() => void pay("transfer")} type="button">
              {t("계좌 입금으로 요청하기")}
            </button>
          </div>
        )}
        <p className="field-hint">{t("결제 내역과 영수증은 내 정보의 결제 내역에서 볼 수 있어요.")}</p>
      </div>
    </Modal>,
    document.body,
  )
}
