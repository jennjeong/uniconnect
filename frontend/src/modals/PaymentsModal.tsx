import { useEffect, useState } from "react"

import { ApiError, api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { Payment, RefundQuote } from "../types"

const statusLabel: Record<Payment["status"], string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  cancelled: "취소 · 환불",
}

// 브랜드가 플랫폼에 낸 결제(결제 내역). 최신순이며 무엇을 위한 것인지, 금액과
// 상태, 카드 영수증, 취소할 수 있는 대기 주문을 보여 준다.
export function PaymentsModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [payments, setPayments] = useState<Payment[]>()
  const [error, setError] = useState("")
  // 환불 확인 중인 결제와 그 금액. 금액은 날이 바뀌면 달라진다.
  const [refunding, setRefunding] = useState<{ payment: Payment; quote: RefundQuote }>()
  const [refundNote, setRefundNote] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.billing().then(
      (result) => {
        if (!cancelled) setPayments(result.payments)
      },
      (failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const cancel = async (payment: Payment) => {
    try {
      const { order } = await api.cancelOrder(payment.id)
      setPayments((list) => list?.map((item) => (item.id === order.id ? order : item)))
      onNotice(t("주문을 취소했어요."))
    } catch (failure) {
      onNotice(errorMessage(failure))
    }
  }

  const askRefund = async (payment: Payment) => {
    setRefundNote("")
    try {
      setRefunding({ payment, quote: await api.refundQuote(payment.id) })
    } catch (failure) {
      setRefunding(undefined)
      onNotice(errorMessage(failure))
    }
  }

  const refund = async () => {
    if (!refunding) return
    setBusy(true)
    try {
      const { payment } = await api.refund(refunding.payment.id, refunding.quote.amount)
      setPayments((list) => list?.map((item) => (item.id === payment.id ? payment : item)))
      setRefunding(undefined)
      onNotice(t("환불했어요."))
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0
      if (status === 409) {
        // 날이 바뀌어 금액이 달라졌을 수 있다. 다시 읽어 보여 준다.
        onNotice(errorMessage(failure))
        await askRefund(refunding.payment)
      } else if (status === 502 || status === 503) {
        // 환불이 이미 나갔을 수 있어 다시 누르게 하지 않는다.
        setRefunding(undefined)
        setRefundNote(t("몇 분 뒤에 결제 내역을 확인해 주세요."))
      } else {
        onNotice(errorMessage(failure))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal kicker="Payments" name="payments" onClose={onClose} title={t("결제 내역")}>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : !payments ? (
        <p className="field-hint">{t("결제 내역을 불러오고 있어요…")}</p>
      ) : payments.length === 0 ? (
        <p className="field-hint">{t("아직 결제한 내역이 없어요.")}</p>
      ) : (
        <ul className="payment-history">
          {payments.map((payment) => (
            <li key={payment.id}>
              <div>
                <strong>{payment.orderName}</strong>
                <small>
                  {formatDateTime(payment.paidAt ?? payment.requestedAt)}
                  {payment.method && ` · ${payment.method === "card" ? t("카드") : t("계좌 입금")}`}
                  {payment.status === "pending" && payment.transferRequestedAt && ` · ${t("입금 확인 중")}`}
                  {payment.refundedAmount !== undefined && ` · ${t("{amount} 환불", { amount: fullWon(payment.refundedAmount) })}`}
                </small>
              </div>
              <span className="payment-amount">{fullWon(payment.amount)}</span>
              <em className={`payment-status ${payment.status}`}>{t(statusLabel[payment.status])}</em>
              <span className="payment-links">
                {payment.receiptUrl && (
                  <a href={payment.receiptUrl} rel="noreferrer" target="_blank">
                    {t("영수증")}
                  </a>
                )}
                {payment.status === "pending" && (
                  <button className="subtle-link" onClick={() => void cancel(payment)} type="button">
                    {t("주문 취소")}
                  </button>
                )}
                {payment.kind === "local" && payment.status === "paid" && payment.refundedAmount === undefined && payment.method === "card" && (
                  <button className="subtle-link" onClick={() => void askRefund(payment)} type="button">
                    {t("환불")}
                  </button>
                )}
              </span>
              {refunding?.payment.id === payment.id && (
                <div className="refund-confirm">
                  <p>
                    {t("돌려받는 금액")} <strong>{fullWon(refunding.quote.amount)}</strong>
                  </p>
                  <p>{t("환불하면 오늘로 이용이 끝나요.")}</p>
                  <button className="decline-button" disabled={busy} onClick={() => void refund()} type="button">
                    {t("환불받기")}
                  </button>
                  <button className="cancel-button" onClick={() => setRefunding(undefined)} type="button">
                    {t("취소")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {refundNote && (
        <p className="field-hint" role="status">
          {refundNote}
        </p>
      )}
      <p className="field-hint">{t("세금계산서가 필요하면 FAQ의 관리자에게 질문하기로 사업자 정보를 보내 주세요.")}</p>
    </Modal>
  )
}
