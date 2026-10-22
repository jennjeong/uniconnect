import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import type { Account } from "../types"

// Leaving uniconnect from 내 정보: what goes with the account, then the
// password again and a tick that says so, since nothing can be brought back.
export function LeaveModal({
  account,
  onClose,
  onLeft,
}: {
  account: Account
  onClose: () => void
  onLeft: () => void
}) {
  const [password, setPassword] = useState("")
  const [understood, setUnderstood] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const students = account.role === "학생단체"

  const submit = async () => {
    if (!password) return setError("비밀번호를 입력해 주세요.")
    if (!understood) return setError("지워지는 내용을 확인했다고 체크해 주세요.")
    setBusy(true)
    setError("")
    try {
      await api.deleteAccount({ password })
      onLeft()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="leave" kicker="Leave uniconnect" title="회원 탈퇴" onClose={onClose}>
      <form
        className="auth-form leave-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">
          탈퇴하면 {account.name} 계정과 아래 내용이 바로 지워지고, 되살릴 수 없어요.
        </p>
        <ul className="leave-list">
          <li>계정 정보와 {students ? "단체" : "브랜드"} 소개</li>
          <li>{students ? "등록한 행사와 보낸 협찬 제안" : "등록한 캠페인과 받은 협찬 제안"}</li>
          <li>주고받은 메시지 (상대방 쪽 대화도 함께 사라져요)</li>
          <li>관리자에게 보낸 질문과 답변</li>
        </ul>
        <label>
          비밀번호 확인
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="terms-check">
          <input
            checked={understood}
            type="checkbox"
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>지워지는 내용을 확인했고, 되살릴 수 없다는 것을 이해했어요.</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide leave-confirm" disabled={busy} type="submit">
          탈퇴하기
        </button>
        <p className="auth-switch">
          <button onClick={onClose} type="button">
            계속 이용할게요
          </button>
        </p>
      </form>
    </Modal>
  )
}
