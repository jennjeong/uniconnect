import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { formatRemaining } from "../lib/format"
import type { Session } from "../types"

type Sent = {
  expiresAt: number
  // Sent back only while the backend has no mail service (development).
  devCode?: string
}

// A forgotten password: a code to the email the account signed up with,
// then a new password. Setting it logs out every other device and logs in
// here.
export function ResetPasswordModal({
  initialEmail,
  onClose,
  onReset,
  onLogin,
  onNotice,
}: {
  initialEmail: string
  onClose: () => void
  onReset: (session: Session) => void
  onLogin: () => void
  onNotice: (message: string) => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState<Sent | null>(null)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sent) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sent])

  // Runs one request at a time and shows its error above the submit button.
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await task()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () => {
    if (!email.trim()) {
      setError("가입한 이메일을 입력해 주세요.")
      return
    }
    void run(async () => {
      const result = await api.requestPasswordResetCode({ email })
      setSent({ expiresAt: result.expiresAt, devCode: result.devCode })
      setCode("")
      setNow(Date.now())
      onNotice(`${result.email}로 인증번호를 보냈어요.`)
    })
  }

  const submit = () => {
    if (!sent) {
      sendCode()
      return
    }
    if (code.length !== 6) return setError("6자리 인증번호를 입력해 주세요.")
    if (password.length < 8) return setError("비밀번호는 8자 이상이어야 해요.")
    if (password !== confirm) return setError("비밀번호가 일치하지 않아요.")
    void run(async () => {
      onReset(await api.resetPassword({ email, code, password }))
    })
  }

  return (
    <Modal banner name="reset" kicker="Forgot password" title="비밀번호 찾기" onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <p className="auth-lead">
          가입한 이메일로 인증번호를 보내 드려요. 새 비밀번호를 정하면 다른 기기에서는 로그아웃돼요.
        </p>
        <div className="field-group">
          <label htmlFor="reset-email">가입한 이메일</label>
          <div className="field-with-action">
            <input
              autoComplete="email"
              id="reset-email"
              placeholder="name@school.ac.kr"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setSent(null)
              }}
            />
            {sent && (
              <button className="field-action" disabled={busy} onClick={sendCode} type="button">
                재전송
              </button>
            )}
          </div>
          {sent && (
            <>
              <input
                aria-label="인증번호"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="6자리 인증번호"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
              <small className="field-hint">
                {now < sent.expiresAt
                  ? `남은 시간 ${formatRemaining(sent.expiresAt - now)}`
                  : "인증 시간이 지났어요. 재전송을 눌러 주세요."}
                {sent.devCode && (
                  <>
                    {" · "}
                    개발 모드라서 메일 대신 인증번호를 여기에 보여드려요:{" "}
                    <strong>{sent.devCode}</strong>
                  </>
                )}
              </small>
            </>
          )}
        </div>
        {sent && (
          <div className="form-row">
            <label>
              새 비밀번호
              <input
                autoComplete="new-password"
                placeholder="8자 이상"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                autoComplete="new-password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {sent ? "새 비밀번호로 로그인" : "인증번호 받기"}
        </button>
        <p className="auth-switch">
          비밀번호가 기억났나요?{" "}
          <button onClick={onLogin} type="button">
            로그인
          </button>
        </p>
      </form>
    </Modal>
  )
}
