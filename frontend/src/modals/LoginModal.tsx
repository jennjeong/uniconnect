import { useCallback, useState } from "react"

import { api, errorMessage } from "../api"
import { CodeStep } from "../components/CodeStep"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { RoleMark } from "../components/RoleMark"
import { RolePicker } from "../components/RolePicker"
import { usePageReturn } from "../hooks/usePageReturn"
import { demoAccounts, demoPassword } from "../data/demo"
import { roles } from "../data/roles"
import { t } from "../i18n"
import { socialNames } from "../data/social"
import type { CodeTicket, Role, Session, SocialProvider } from "../types"

export function LoginModal({
  initialRole,
  example,
  onClose,
  onLoggedIn,
  onSignup,
  onForgot,
  onJoin,
  providers,
  initialTicket,
}: {
  initialRole: Role
  // 방문자가 예시 카드의 제안하기로 연 경우 그 상대. 그 역할의 데모 로그인만
  // 이어받는다(`fromExample`).
  example?: { name: string; role: Role }
  onClose: () => void
  // 2단계 인증이 켜져 있으면 코드 다음에. `recoveryLeft`가 남은 복구 코드 수를
  // 알려 준다.
  onLoggedIn: (session: Session & { recoveryLeft?: number }, fromExample?: boolean) => void
  onSignup: (role: Role) => void
  onForgot: (email: string) => void
  // 초대받은 공동 관리자의 첫 방문(modals/JoinTeamModal.tsx).
  onJoin: () => void
  // 서버가 제공하면 카카오나 네이버. 2단계 인증 코드를 아직 요구하는 로그인이
  // 돌아오면 `initialTicket`으로 들어온다.
  providers: SocialProvider[]
  initialTicket?: { email: string; ticket: CodeTicket }
}) {
  const [draft, setDraft] = useState({ role: initialRole, email: "", password: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  // 비밀번호가 맞았고 계정이 다음으로 코드를 요구한다.
  const [ticket, setTicket] = useState<{ email: string; ticket: CodeTicket } | null>(initialTicket ?? null)
  // 2단계 인증을 방금 설정했다. 로그인이 이어지기 전에 복구 코드를 한 번 보여
  // 준다.
  const [recovery, setRecovery] = useState<{ session: Session; codes: string[] } | null>(null)

  // 로그인하지 않고 제공자 화면에서 돌아온 경우.
  usePageReturn(useCallback(() => setBusy(false), []))

  // 제공자로 나간다. 제공자가 브라우저를 서버로 돌려보내면 서버가 로그인을
  // 끝낸다(App이 ?social=을 읽는다).
  const socialLogin = async (provider: SocialProvider) => {
    setBusy(true)
    setError("")
    try {
      window.location.assign((await api.socialStart(provider, "login")).url)
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  // 입력한 그대로의 폼, 또는 데모 계정의 공개된 로그인.
  const submit = async (form = draft, fromExample = false) => {
    if (!form.email.trim() || !form.password) {
      setError(t("이메일과 비밀번호를 입력해 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const answer = await api.login(form)
      if ("ticket" in answer) setTicket({ email: form.email, ticket: answer })
      else onLoggedIn(answer, fromExample)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal banner name="login" kicker="Welcome Back" title={t("로그인")} onClose={onClose}>
      {recovery ? (
        <div className="auth-form">
          <p className="auth-lead">
            {t("2단계 인증을 켰어요. 휴대폰을 잃어버렸을 때 쓸 복구 코드예요. 지금만 보여 드리니 안전한 곳에 적어 두세요. 코드마다 한 번씩 쓸 수 있어요.")}
          </p>
          <ol className="recovery-codes">
            {recovery.codes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <button className="primary-button wide" onClick={() => onLoggedIn(recovery.session)} type="button">
            {t("적어 뒀어요")}
          </button>
        </div>
      ) : ticket ? (
        <CodeStep
          email={ticket.email}
          onDone={({ recoveryCodes, ...session }) => (recoveryCodes ? setRecovery({ session, codes: recoveryCodes }) : onLoggedIn(session))}
          onRestart={() => {
            setTicket(null)
            setDraft((current) => ({ ...current, password: "" }))
          }}
          ticket={ticket.ticket}
        />
      ) : (
        <form
          className="auth-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {example && (
            <div className="example-resume">
              <p>{t("예시 상대인 {name}에는 데모 계정으로만 제안해 볼 수 있어요.", { name: example.name })}</p>
              <button
                className="primary-button wide"
                disabled={busy}
                onClick={() =>
                  void submit({ role: example.role, email: demoAccounts[example.role].email, password: demoPassword }, true)
                }
                type="button"
              >
                {t("이 제안 데모로 체험하기")}
              </button>
              <small>{t("로그인하거나 가입하면 실제 회원 목록에서 협찬 상대를 찾을 수 있어요.")}</small>
            </div>
          )}
          <RolePicker
            name="login-role"
            value={draft.role}
            onChange={(role) => setDraft((current) => ({ ...current, role }))}
          />
          <label>
            {t("이메일")}
            <input
              autoComplete="email"
              placeholder={
                draft.role === "학생단체" ? "name@school.ac.kr" : "name@company.com"
              }
              type="email"
              value={draft.email}
              onChange={(event) =>
                setDraft((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <PasswordField
            autoComplete="current-password"
            label={t("비밀번호")}
            value={draft.password}
            onChange={(event) =>
              setDraft((current) => ({ ...current, password: event.target.value }))
            }
          />
          <p className="forgot-row">
            <button onClick={() => onForgot(draft.email)} type="button">
              {t("비밀번호를 잊으셨나요?")}
            </button>
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button wide" disabled={busy} type="submit">
            {draft.role === "학생단체" ? t("학생단체로 로그인") : t("스폰서로 로그인")}
          </button>
          {providers.length > 0 && (
            <div className="social-login">
              <span className="social-divider">{t("연결한 계정으로 로그인")}</span>
              {providers.map((provider) => (
                <button
                  className={`social-button ${provider}`}
                  disabled={busy}
                  key={provider}
                  onClick={() => void socialLogin(provider)}
                  type="button"
                >
                  {t("{provider}로 로그인", { provider: t(socialNames[provider]) })}
                </button>
              ))}
              <small>{t("회원가입을 마치고 내 정보에서 계정을 연결한 회원만 쓸 수 있어요.")}</small>
            </div>
          )}
          <p className="auth-switch">
            {t("아직 계정이 없나요?")}{" "}
            <button onClick={() => onSignup(draft.role)} type="button">
              {t("회원가입")}
            </button>
          </p>
          <p className="auth-switch">
            {t("함께 관리하자는 초대를 받았나요?")}{" "}
            <button onClick={onJoin} type="button">
              {t("초대받았나요?")}
            </button>
          </p>
          <div className="demo-login">
            <p>{t("데모 계정으로 체험하기")}</p>
            <div className="demo-login-buttons">
              {roles.map((role) => (
                <button
                  disabled={busy}
                  key={role}
                  onClick={() => void submit({ role, email: demoAccounts[role].email, password: demoPassword })}
                  type="button"
                >
                  <RoleMark role={role} size={22} />
                  <span>
                    {demoAccounts[role].name}
                    <small>{t(role)}</small>
                  </span>
                </button>
              ))}
            </div>
            <small>{t("여러 사람이 함께 쓰는 체험용 계정이라, 예시 데이터 안에서만 제안하고 수락해 볼 수 있어요.")}</small>
          </div>
        </form>
      )}
    </Modal>
  )
}
