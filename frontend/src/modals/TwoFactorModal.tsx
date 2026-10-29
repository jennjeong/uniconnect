import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { QrCode } from "../components/QrCode"
import { t } from "../i18n"
import type { Account } from "../types"

// Two-step login from 내 정보. Turning it on: the password, then the QR code
// (or the key typed in) for an authenticator app such as Google
// Authenticator, then the app's code; the ten recovery codes show once.
// Turning it off takes the password and a code.
export function TwoFactorModal({
  account,
  onClose,
  onSaved,
}: {
  account: Account
  onClose: () => void
  // The account once it was turned on or off; the modal stays open to show
  // the recovery codes after turning it on.
  onSaved: (account: Account, on: boolean) => void
}) {
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const on = Boolean(account.twoFactorOn) && !recoveryCodes

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

  const submit = () => {
    if (on) {
      if (!password || !code.trim()) return setError(t("비밀번호와 인증 코드를 입력해 주세요."))
      return void run(async () => {
        onSaved((await api.twoFactorDisable({ password, code: code.trim() })).account, false)
      })
    }
    if (!setup) {
      if (!password) return setError(t("지금 비밀번호를 입력해 주세요."))
      return void run(async () => setSetup(await api.twoFactorSetup(password)))
    }
    if (!code.trim()) return setError(t("인증 앱의 6자리 코드를 입력해 주세요."))
    void run(async () => {
      const enabled = await api.twoFactorEnable(code.trim())
      setRecoveryCodes(enabled.recoveryCodes)
      onSaved(enabled.account, true)
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes!.join("\n"))
      setCopied(true)
    } catch {
      setError(t("복사하지 못했어요. 코드를 직접 적어 두세요."))
    }
  }

  const codeField = (
    <label>
      {t("인증 코드")}
      <input
        autoComplete="one-time-code"
        inputMode={on ? undefined : "numeric"}
        maxLength={9}
        onChange={(event) => setCode(event.target.value)}
        placeholder="123456"
        value={code}
      />
    </label>
  )

  return (
    <Modal name="two-factor" kicker="Security" title={t("2단계 인증")} onClose={onClose}>
      {recoveryCodes ? (
        <div className="auth-form">
          <p className="auth-lead">
            {t("2단계 인증을 켰어요. 휴대폰을 잃어버렸을 때 쓸 복구 코드예요. 지금만 보여 드리니 안전한 곳에 적어 두세요. 코드마다 한 번씩 쓸 수 있어요.")}
          </p>
          <ol className="recovery-codes">
            {recoveryCodes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="cancel-button wide" onClick={() => void copy()} type="button">
            {copied ? t("복사했어요") : t("복구 코드 복사")}
          </button>
          <button className="primary-button wide" onClick={onClose} type="button">
            {t("적어 뒀어요")}
          </button>
        </div>
      ) : (
        <form
          className="auth-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {on ? (
            <>
              <p className="auth-lead">
                {t("2단계 인증이 켜져 있어요. 끄려면 비밀번호와 인증 앱의 코드(또는 복구 코드)를 입력해 주세요.")}
              </p>
              <PasswordField
                autoComplete="current-password"
                label={t("지금 비밀번호")}
                onChange={(event) => setPassword(event.target.value)}
                value={password}
              />
              {codeField}
            </>
          ) : setup ? (
            <>
              <p className="auth-lead">
                {t("Google Authenticator 같은 인증 앱으로 QR 코드를 찍거나 아래 키를 입력한 뒤, 앱에 보이는 6자리 코드를 입력해 주세요.")}
              </p>
              <div className="two-factor-qr">
                <QrCode label={t("인증 앱으로 찍을 QR 코드")} value={setup.url} />
              </div>
              <p className="two-factor-key">
                <span>{t("직접 입력할 키")}</span>
                <code>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
              </p>
              {codeField}
            </>
          ) : (
            <>
              <p className="auth-lead">
                {t("켜면 로그인할 때 비밀번호 다음에 인증 앱의 6자리 코드를 한 번 더 입력해요. 비밀번호가 새어도 계정을 지킬 수 있어요.")}
              </p>
              <PasswordField
                autoComplete="current-password"
                label={t("지금 비밀번호")}
                onChange={(event) => setPassword(event.target.value)}
                value={password}
              />
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className={on ? "decline-button wide" : "primary-button wide"} disabled={busy} type="submit">
            {on ? t("2단계 인증 끄기") : setup ? t("확인하고 켜기") : t("다음")}
          </button>
        </form>
      )}
    </Modal>
  )
}
