import { useState } from "react"

import { t } from "../i18n"

// 현장 PIN을 새로 만드는 버튼. 지금 PIN이 바로 막히므로 한 번 더 묻고, 오늘
// 틀린 시도가 있으면 바꿀지 판단하도록 함께 보여 준다.
export function RotatePin({
  label,
  misses = 0,
  onRotate,
}: {
  label?: string
  misses?: number
  onRotate: () => Promise<unknown>
}) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const rotate = async () => {
    setBusy(true)
    try {
      await onRotate()
      setAsking(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rotate-pin">
      {misses > 0 && <small className="rotate-pin-misses">{t("오늘 틀린 PIN 시도 {count}회", { count: misses })}</small>}
      {asking ? (
        <>
          <small>{t("지금 PIN은 바로 막혀요. 현장 담당자에게 새 PIN을 다시 알려 주세요.")}</small>
          <span className="rotate-pin-actions">
            <button className="row-button point" disabled={busy} onClick={() => void rotate()} type="button">
              {t("새 PIN으로 바꾸기")}
            </button>
            <button className="row-button" disabled={busy} onClick={() => setAsking(false)} type="button">
              {t("그대로 두기")}
            </button>
          </span>
        </>
      ) : (
        <button className="row-button" onClick={() => setAsking(true)} type="button">
          {label ?? t("PIN 바꾸기")}
        </button>
      )}
    </div>
  )
}
