import { Icon } from "./Icon"

export function ProposalControl({
  done,
  label,
  className,
  onPropose,
  onCancel,
}: {
  done: boolean
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
  return (
    <div className="proposal-actions">
      <span className="proposal-button done">
        <Icon name="check" size={16} /> 제안 완료
      </span>
      <button className="proposal-cancel" onClick={onCancel} type="button">
        제안 취소
      </button>
    </div>
  )
}
