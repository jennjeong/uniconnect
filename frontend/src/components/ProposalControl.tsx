import { t } from "../i18n"
import type { RequestStatus } from "../types"
import { Icon } from "./Icon"

export function ProposalControl({
  done,
  status,
  label,
  className,
  undelivered = false,
  onPropose,
  onCancel,
}: {
  done: boolean
  // 계정이 있는 브랜드가 답했을 때 그 브랜드의 답.
  status?: RequestStatus
  label: string
  className: string
  // 상대가 아직 가입하지 않아 받은편지함이 없다: 보냈지만 전달되지 않았다.
  undelivered?: boolean
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
  // 수락한 파트너에게는 다음 행사에 대해 다시 물을 수 있다. 아직 행사가 없으면
  // 서버가 그렇게 답한다.
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
  // 거절·취소됐거나 행사가 끝나 닫힌 경우. 다시 보낼 수 있다.
  if (status === "거절" || status === "취소됨" || status === "마감") {
    const label = status === "거절" ? t("거절된 제안") : status === "취소됨" ? t("취소된 협찬") : t("마감된 제안")
    return (
      <div className="proposal-actions">
        <span className="proposal-button declined">{label}</span>
        <button className="proposal-cancel" onClick={onPropose} type="button">
          {t("다시 제안하기")}
        </button>
      </div>
    )
  }
  // 보낸 제안: 상대의 받은편지함에 닿았으면 답을 기다리고, 아니면 가입하면 전달된다.
  return (
    <div className="proposal-actions">
      <span className={undelivered ? "proposal-button done undelivered" : "proposal-button done"}>
        <Icon name={undelivered ? "send" : "check"} size={16} /> {undelivered ? t("전달 대기") : t("제안 보냄")}
      </span>
      <button className="proposal-cancel" onClick={onCancel} type="button">
        {t("제안 취소")}
      </button>
    </div>
  )
}
