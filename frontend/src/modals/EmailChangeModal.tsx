import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import type { Account } from "../types"

// Handing the account over from 내 정보 (a group's new officers, say): the
// new login email and the current password send a code to the new address,
// and that code moves the account there. Other devices are logged out.
export function EmailChangeModal({
  onClose,
  onChanged,
}: {
  onClose: () => void
  onChanged: (account: Account) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState<{ email: string; devCode?: string } | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const run = async (step: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await step()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const send = () => {
    if (!email.trim()) return setError(t("새 로그인 이메일을 입력해 주세요."))
    if (!password) return setError(t("지금 비밀번호를 입력해 주세요."))
    void run(async () => {
      const result = await api.emailChangeCode({ email: email.trim(), password })
      setSent({ email: result.email, devCode: result.devCode })
    })
  }

  const confirm = () => {
    if (!sent) return
    if (!code.trim()) return setError(t("인증번호를 입력해 주세요."))
    void run(async () => onChanged((await api.changeEmail({ email: sent.email, code: code.trim() })).account))
  }

  return (
    <Modal name="email" kicker="Account" title={t("로그인 이메일 바꾸기")} onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (sent) confirm()
          else send()
        }}
      >
        <p className="auth-lead">
          {t("단체나 브랜드를 넘겨줄 때 새 담당자의 이메일로 로그인 이메일을 바꿔요. 바꾸면 다른 기기에서는 로그아웃돼요.")}
        </p>
        {sent ? (
          <>
            <p className="field-hint">{t("새 이메일로 인증번호를 보냈어요: {email}", { email: sent.email })}</p>
            <label>
              {t("인증번호")}
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            {sent.devCode && (
              <small className="field-hint">
                {t("개발 모드라서 메일 대신 인증번호를 여기에 보여드려요:")} <strong>{sent.devCode}</strong>
              </small>
            )}
          </>
        ) : (
          <>
            <label>
              {t("새 로그인 이메일")}
              <input
                autoComplete="email"
                inputMode="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              {t("지금 비밀번호")}
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {sent ? t("이메일 바꾸기") : t("인증번호 받기")}
        </button>
      </form>
    </Modal>
  )
}
