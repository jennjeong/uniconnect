import { useState } from "react"

import { api, errorMessage } from "../api"
import { PasswordField } from "../components/PasswordField"
import { QrCode } from "../components/QrCode"
import { t } from "../i18n"
import type { AdminLoginStart } from "../types"

// 비밀번호로 시작한 로그인의 다음 단계들이다. 처음 로그인하면 setup이 와서 인증
// 앱에 등록한다.
type Step =
  | { name: "password" }
  | { name: "code"; start: AdminLoginStart }
  | { name: "recovery"; token: string; expiresAt: string; codes: string[] }

// 운영자의 이메일, 비밀번호, 2단계 코드로 콘솔에 들어간다. 첫 운영자를 만들기
// 전이나 운영자가 없는 환경에서는 접힌 항목의 공유 토큰으로 들어간다. 공유 토큰은
// 2단계 로그인을 마친 운영자가 생기면 서버가 거절한다.
export function AdminLogin({
  logo,
  checking,
  error,
  onOperator,
  onToken,
}: {
  logo: string
  checking: boolean
  error: string
  onOperator: (token: string, expiresAt: string) => void
  onToken: (token: string) => void
}) {
  const [step, setStep] = useState<Step>({ name: "password" })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [tokenDraft, setTokenDraft] = useState("")
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState("")
  const [busy, setBusy] = useState(false)
  const shown = failure || error

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setFailure("")
    try {
      await work()
    } catch (caught) {
      setFailure(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const start = () =>
    run(async () => {
      const started = await api.adminLogin({ email: email.trim(), password })
      setPassword("")
      setCode("")
      setStep({ name: "code", start: started })
    })

  const finish = (start: AdminLoginStart) =>
    run(async () => {
      const done = await api.adminLoginCode({ email: email.trim(), ticket: start.ticket, code: code.trim() })
      if (done.recoveryCodes?.length) setStep({ name: "recovery", token: done.token, expiresAt: done.expiresAt, codes: done.recoveryCodes })
      else onOperator(done.token, done.expiresAt)
    })

  const message = shown && (
    <p className="form-error" role="alert">
      {shown}
    </p>
  )

  if (step.name === "recovery") {
    return (
      <div className="console-login-card">
        <img alt="uniconnect" src={logo} />
        <h1>{t("복구 코드")}</h1>
        <p>{t("휴대폰이 없을 때 코드 대신 한 번씩 쓸 수 있어요. 지금만 보여 주고 다시 받을 수 없어요.")}</p>
        <ul className="recovery-codes">
          {step.codes.map((item) => (
            <li key={item}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
        <label className="console-check">
          <input checked={saved} onChange={(event) => setSaved(event.target.checked)} type="checkbox" />
          {t("복구 코드를 안전한 곳에 저장했어요")}
        </label>
        <button className="primary-button wide" disabled={!saved} onClick={() => onOperator(step.token, step.expiresAt)} type="button">
          {t("콘솔로 들어가기")}
        </button>
      </div>
    )
  }

  if (step.name === "code") {
    const { setup } = step.start
    return (
      <form
        className="console-login-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (code.trim()) void finish(step.start)
        }}
      >
        <img alt="uniconnect" src={logo} />
        <h1>{t("2단계 로그인")}</h1>
        {setup ? (
          <>
            <p>{t("처음 로그인이에요. 인증 앱에 등록한 뒤 앱의 6자리 코드를 넣어 주세요.")}</p>
            <div className="console-login-qr">
              <QrCode label={t("인증 앱에 등록할 QR 코드")} value={setup.url} />
            </div>
            <p className="console-login-key">
              {t("키를 직접 넣을 때")} <code>{setup.secret}</code>
            </p>
          </>
        ) : (
          <p>{t("인증 앱의 6자리 코드나 복구 코드를 넣어 주세요.")}</p>
        )}
        <label>
          {t("코드")}
          <input autoComplete="one-time-code" onChange={(event) => setCode(event.target.value)} value={code} />
        </label>
        {message}
        <button className="primary-button wide" disabled={busy || !code.trim()} type="submit">
          {busy ? t("확인하고 있어요…") : t("확인")}
        </button>
        <button
          className="cancel-button wide"
          onClick={() => {
            setFailure("")
            setStep({ name: "password" })
          }}
          type="button"
        >
          {t("처음으로")}
        </button>
      </form>
    )
  }

  return (
    <div className="console-login-card">
      <img alt="uniconnect" src={logo} />
      <h1>{t("운영자 콘솔")}</h1>
      <p>{t("운영자 계정으로 들어와요. 세션은 이 탭에만 기억되고 8시간 뒤에 끝나요.")}</p>
      <form
        className="console-login-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (email.trim() && password) void start()
        }}
      >
        <label>
          {t("이메일")}
          <input autoComplete="username" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
        </label>
        <PasswordField autoComplete="current-password" label={t("비밀번호")} onChange={(event) => setPassword(event.target.value)} value={password} />
        {message}
        <button className="primary-button wide" disabled={busy || checking || !email.trim() || !password} type="submit">
          {busy || checking ? t("확인하고 있어요…") : t("다음")}
        </button>
      </form>
      <details className="console-login-token">
        <summary>{t("공유 토큰으로 들어가기")}</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (tokenDraft.trim()) onToken(tokenDraft.trim())
          }}
        >
          <p>{t("첫 운영자를 만들 때만 써요. 2단계 로그인을 마친 운영자가 생기면 닫혀요.")}</p>
          <PasswordField
            autoComplete="off"
            label={t("관리자 토큰")}
            onChange={(event) => setTokenDraft(event.target.value)}
            placeholder={t("서버의 ADMIN_TOKEN")}
            toggleLabel={t("토큰 보기")}
            value={tokenDraft}
          />
          <button className="cancel-button wide" disabled={!tokenDraft.trim() || checking} type="submit">
            {checking ? t("확인하고 있어요…") : t("들어가기")}
          </button>
        </form>
      </details>
    </div>
  )
}
