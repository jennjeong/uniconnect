import { t } from "../i18n"
import type { RequestStatus } from "../types"
import { Icon } from "./Icon"

export function ProposalControl({
  done,
  status,
  label,
  className,
  onPropose,
  onCancel,
}: {
  done: boolean
  // The brand's answer, once a brand with an account has replied.
  status?: RequestStatus
  label: string
  className: string
  onPropose: () => void
  onCancel: () => void
}) {
  if (!done) {
    return (
      <button className={className} onClick={onPropose} type="button">
        {label}
      </button>
    )
  }
  // A confirmed partner can be asked again about the next event; the server
  // answers when there is none yet.
  if (status === "수락") {
    return (
      <div className="proposal-actions">
        <span className="proposal-button confirmed">
          <Icon name="check" size={16} /> {t("협찬 확정")}
        </span>
        <button className="proposal-cancel" onClick={onPropose} type="button">
          {t("다음 일정으로 다시 제안")}
        </button>
      </div>
    )
  }
  if (status === "거절") {
    return (
      <div className="proposal-actions">
        <span className="proposal-button declined">{t("거절된 제안")}</span>
        <button className="proposal-cancel" onClick={onPropose} type="button">
          {t("다시 제안하기")}
        </button>
      </div>
    )
  }
  return (
    <div className="proposal-actions">
      <span className="proposal-button done">
        <Icon name="check" size={16} /> {t("제안 완료")}
      </span>
      <button className="proposal-cancel" onClick={onCancel} type="button">
        {t("제안 취소")}
      </button>
    </div>
  )
}
