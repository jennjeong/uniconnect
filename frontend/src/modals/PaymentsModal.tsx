import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { Payment } from "../types"

const statusLabel: Record<Payment["status"], string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  cancelled: "취소 · 환불",
}

// A brand's payments to the platform (결제 내역), newest first: what each
// was for, its amount and state, the card receipt, and a waiting order to
// cancel.
export function PaymentsModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [payments, setPayments] = useState<Payment[]>()
  const [error, setError] = useState("")

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
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">{t("세금계산서가 필요하면 FAQ의 관리자에게 질문하기로 사업자 정보를 보내 주세요.")}</p>
    </Modal>
  )
}
