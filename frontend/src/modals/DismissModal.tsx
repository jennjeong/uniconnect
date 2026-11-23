import { useState } from "react"

import { errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { dismissReasons } from "../data/dismiss"
import { t } from "../i18n"

// 관심 없음(#341): 이유를 하나 고르면 이 상대를 추천에서 뺀다. 전체 목록과 검색에는
// 그대로 남고, 추천 탭 아래 '추천에서 뺀 곳'에서 되돌릴 수 있다.
export function DismissModal({
  name,
  onClose,
  onDismiss,
}: {
  name: string
  onClose: () => void
  onDismiss: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState(dismissReasons[0])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <Modal kicker="Not for us" name="dismiss" onClose={onClose} title={t("{name} 추천에서 빼기", { name })}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError("")
          onDismiss(reason)
            .catch((problem: unknown) => setError(errorMessage(problem)))
            .finally(() => setBusy(false))
        }}
      >
        <p className="auth-lead">{t("다음 추천부터 빠져요. 전체 목록에는 그대로 있어요.")}</p>
        <div aria-label={t("빼는 이유")} className="ask-categories" role="radiogroup">
          {dismissReasons.map((item) => (
            <button
              aria-checked={reason === item}
              className={reason === item ? "ask-category active" : "ask-category"}
              key={item}
              onClick={() => setReason(item)}
              role="radio"
              type="button"
            >
              {t(item)}
            </button>
          ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("추천에서 빼기")}
        </button>
      </form>
    </Modal>
  )
}
