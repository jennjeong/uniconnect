import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { CodeStep } from "../components/CodeStep"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { PasswordRules } from "../components/PasswordRules"
import { t } from "../i18n"
import { formatRemaining } from "../lib/format"
import { passwordProblem } from "../lib/password"
import type { CodeTicket, Session } from "../types"

type Sent = {
  expiresAt: number
  // 백엔드에 메일 서비스가 없을 때(개발)만 돌려준다.
  devCode?: string
}

// 잊은 비밀번호. 계정이 가입한 이메일로 코드를 보낸 뒤 새 비밀번호를 받는다.
// 설정하면 다른 모든 기기를 로그아웃하고 여기서 로그인하며, 2단계 인증이 켜져
// 있으면 앱의 코드를 거친다.
export function ResetPasswordModal({
  initialEmail,
  onClose,
  onReset,
  onLogin,
  onNotice,
}: {
  initialEmail: string
  onClose: () => void
  onReset: (session: Session & { recoveryLeft?: number }) => void
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
  const [ticket, setTicket] = useState<CodeTicket | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sent) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sent])

  // 요청을 한 번에 하나씩 실행하고 오류는 제출 버튼 위에 보여 준다.
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
      setError(t("가입한 이메일을 입력해 주세요."))
      return
    }
    void run(async () => {
      const result = await api.requestPasswordResetCode({ email })
      setSent({ expiresAt: result.expiresAt, devCode: result.devCode })
      setCode("")
      setNow(Date.now())
      onNotice(t("{email}로 인증번호를 보냈어요.", { email: result.email }))
    })
  }

  const submit = () => {
    if (!sent) {
      sendCode()
      return
    }
    if (code.length !== 6) return setError(t("6자리 인증번호를 입력해 주세요."))
    if (passwordProblem(password)) return setError(passwordProblem(password))
    if (password !== confirm) return setError(t("비밀번호가 일치하지 않아요."))
    void run(async () => {
      const answer = await api.resetPassword({ email, code, password })
      if ("ticket" in answer) setTicket(answer)
      else onReset(answer)
    })
  }

  return (
    <Modal banner name="reset" kicker="Forgot Password" title={t("비밀번호 찾기")} onClose={onClose}>
      {ticket ? (
        <CodeStep email={email} onDone={onReset} onRestart={onLogin} ticket={ticket} />
      ) : (
        <form
          className="auth-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <p className="auth-lead">
            {t("가입한 이메일로 인증번호를 보내 드려요. 새 비밀번호를 정하면 다른 기기에서는 로그아웃돼요.")}
          </p>
          <div className="field-group">
            <label htmlFor="reset-email">{t("가입한 이메일")}</label>
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
                  {t("재전송")}
                </button>
              )}
            </div>
            {sent && (
              <>
                <input
                  aria-label={t("인증번호")}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("6자리 인증번호")}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
                <small className="field-hint">
                  {now < sent.expiresAt
                    ? t("남은 시간 {time}", { time: formatRemaining(sent.expiresAt - now) })
                    : t("인증 시간이 지났어요. 재전송을 눌러 주세요.")}
                  {sent.devCode && (
                    <>
                      {" · "}
                      {t("개발 모드라서 메일 대신 인증번호를 여기에 보여드려요:")}{" "}
                      <strong>{sent.devCode}</strong>
                    </>
                  )}
                </small>
              </>
            )}
          </div>
          {sent && (
            <div className="form-row">
              <PasswordField
                aria-describedby="reset-password-rules"
                autoComplete="new-password"
                label={t("새 비밀번호")}
                placeholder={t("영문·숫자·특수문자 8자 이상")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <PasswordField
                autoComplete="new-password"
                label={t("새 비밀번호 확인")}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
          )}
          {sent && <PasswordRules id="reset-password-rules" password={password} />}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button wide" disabled={busy} type="submit">
            {sent ? t("새 비밀번호로 로그인") : t("인증번호 받기")}
          </button>
          <p className="auth-switch">
            {t("비밀번호가 기억났나요?")}{" "}
            <button onClick={onLogin} type="button">
              {t("로그인")}
            </button>
          </p>
        </form>
      )}
    </Modal>
  )
}
