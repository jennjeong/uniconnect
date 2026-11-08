import { useState } from "react"

import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { dDayLabel, formatDay } from "../lib/date"

// 받은 제안을 수락하기 전에 한 번 더 보여 주는 확인창. 무엇을 수락하는지와
// 수락한 뒤의 순서(계약서 확인 → 협찬 확정)를 보여 주고, 마지막 버튼을 눌러야만
// 상태가 바뀐다. 닫기, 배경, Escape로 닫으면 아무것도 바뀌지 않는다.
export function AcceptModal({
  side,
  partner,
  eventName,
  eventDate,
  terms,
  onConfirm,
  onClose,
}: {
  // 수락하는 쪽. 브랜드는 계약서를 확인할 때 성사 수수료를 낸다.
  side: "브랜드" | "학생단체"
  partner: string
  eventName: string
  eventDate?: string
  // 요청받은 협찬(브랜드가 수락할 때) 또는 제안받은 협찬(단체가 수락할 때).
  terms: string
  onConfirm: () => Promise<void> | void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  return (
    <Modal kicker={t("제안 수락")} name="accept" title={t("이 제안을 수락할까요?")} onClose={onClose}>
      <dl className="accept-facts">
        <div>
          <dt>{t("보낸 곳")}</dt>
          <dd>{partner}</dd>
        </div>
        <div>
          <dt>{side === "브랜드" ? t("행사") : t("캠페인")}</dt>
          <dd>
            {eventName}
            {eventDate && (
              <small>
                {formatDay(eventDate)} · {dDayLabel(eventDate)}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>{side === "브랜드" ? t("요청 협찬") : t("제안받은 협찬")}</dt>
          <dd>{terms}</dd>
        </div>
      </dl>

      <p className="accept-cost">
        {side === "브랜드"
          ? t("수락해도 아직 결제되지 않아요. 계약서에 협찬액(현금 + 현물 환산)을 적고 확인할 때, 협찬액의 15%를 성사 수수료로 내요.")
          : t("학생단체는 수수료를 내지 않아요. 수락해도 계약서를 양쪽이 확인하기 전까지는 협찬이 확정되지 않아요.")}
      </p>

      <ol className="accept-steps">
        <li>{t("수락하면 임시 전자 계약서가 만들어져요.")}</li>
        <li>{t("양쪽이 계약서의 조건을 확인해요.")}</li>
        <li>{t("둘 다 확인하면 협찬 확정이 돼요.")}</li>
      </ol>

      <div className="modal-actions">
        <button className="cancel-button" disabled={busy} onClick={onClose} type="button">
          {t("취소")}
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
          type="button"
        >
          {busy ? t("수락하는 중") : t("수락하기")}
        </button>
      </div>
    </Modal>
  )
}
