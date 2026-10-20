import { Modal } from "../components/Modal"
import { initialOf } from "../lib/format"
import type { Account } from "../types"

export function ProfileModal({
  account,
  eventCount,
  proposalCount,
  onClose,
  onLogout,
}: {
  account: Account
  eventCount: number
  proposalCount: number
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
          <div>
            <span>등록한 {account.role === "학생단체" ? "행사" : "캠페인"}</span>
            <strong>{eventCount}개</strong>
          </div>
          <div>
            <span>보낸 협찬 제안</span>
            <strong>{proposalCount}건</strong>
          </div>
          <div>
            <span>참여 파일럿</span>
            <strong>삼육대 파일럿 · 11월 30일까지</strong>
          </div>
        </div>
        <button className="cancel-button wide" onClick={onLogout} type="button">
          로그아웃
        </button>
      </div>
    </Modal>
  )
}
