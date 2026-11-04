import { useState } from "react"

import { api, errorMessage } from "../api"
import { QrCode } from "./QrCode"
import { t } from "../i18n"
import type { CodeTicket, Session } from "../types"

// The second step of a login with two-step login on: the 6-digit code from
// the authenticator app, or one of the recovery codes when the phone isn't
// at hand. Five wrong codes send the person back to the password.
export function CodeStep({
  email,
  ticket,
  onDone,
  onRestart,
}: {
  email: string
  ticket: CodeTicket
  onDone: (session: Session & { recoveryLeft?: number; recoveryCodes?: string[] }) => void
  onRestart: () => void
}) {
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!code.trim()) return setError(t("인증 앱의 6자리 코드를 입력해 주세요."))
    setBusy(true)
    setError("")
    try {
      onDone(await api.loginCode({ email, ticket: ticket.ticket, code: code.trim() }))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {ticket.setup ? (
        <>
          <p className="auth-lead">
            {t("함께 관리하는 사람은 2단계 인증이 필수예요. 인증 앱으로 이 QR을 찍고 앱에 보이는 6자리 코드를 입력해 주세요.")}
          </p>
          <QrCode label={t("인증 앱으로 찍을 QR 코드")} value={ticket.setup.url} />
          <code>{ticket.setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
        </>
      ) : (
        <p className="auth-lead">
          {t("2단계 인증이 켜진 계정이에요. 인증 앱에 보이는 6자리 코드를 입력해 주세요. 휴대폰이 없으면 복구 코드를 입력해도 돼요.")}
        </p>
      )}
      <label>
        {t("인증 코드")}
        <input
          autoComplete="one-time-code"
          autoFocus
          maxLength={9}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
          value={code}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button wide" disabled={busy} type="submit">
        {t("확인하고 로그인")}
      </button>
      <p className="auth-switch">
        <button onClick={onRestart} type="button">
          {t("비밀번호부터 다시 입력하기")}
        </button>
      </p>
    </form>
  )
}
