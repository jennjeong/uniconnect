import { Modal } from "../components/Modal"
import { formatFullDate, toIsoDate } from "../lib/date"
import { initialOf } from "../lib/format"
import type { Account } from "../types"

export function ProfileModal({
  account,
  activity,
  onClose,
  onLogout,
}: {
  account: Account
  // The account's own counts, such as events registered and proposals sent.
  activity: { label: string; value: string }[]
  onClose: () => void
  onLogout: () => void
}) {
  return (
    <Modal name="profile" kicker="MY PAGE" title="내 정보" onClose={onClose}>
      <div className="profile-detail">
        <div className="profile-summary">
          <div className="avatar large">{initialOf(account.name)}</div>
          <div>
            <strong>{account.name}</strong>
            <span>
              {account.role} · {account.type}
            </span>
          </div>
        </div>
        <div className="report-detail-rows">
          {account.school && (
            <div>
              <span>학교</span>
              <strong>{account.school}</strong>
            </div>
          )}
          <div>
            <span>이메일</span>
            <strong>{account.email}</strong>
          </div>
          {activity.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
          <div>
            <span>가입일</span>
            <strong>{formatFullDate(toIsoDate(new Date(account.createdAt)))}</strong>
          </div>
        </div>
        <button className="cancel-button wide" onClick={onLogout} type="button">
          로그아웃
        </button>
      </div>
    </Modal>
  )
}
