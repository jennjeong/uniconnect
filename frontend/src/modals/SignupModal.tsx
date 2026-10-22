import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { RolePicker } from "../components/RolePicker"
import { accountTypes } from "../data/roles"
import { formatRemaining } from "../lib/format"
import { viewPath } from "../lib/route"
import type { Role, Session } from "../types"

const emptyDraft = (role: Role) => ({
  role,
  name: "",
  type: accountTypes[role][0],
  school: "",
  email: "",
  password: "",
  confirm: "",
  agreed: false,
  over14: false,
})

type Draft = ReturnType<typeof emptyDraft>

type Verification = {
  expiresAt: number
  // Sent back only while the backend has no mail service (development).
  devCode?: string
  // Set once the code is confirmed; sign-up sends it as proof.
  token?: string
}

// Quick checks before calling the API. The backend validates everything
// again, including the school/company email rules.
function draftError(draft: Draft, verified: boolean) {
  if (!draft.name.trim()) {
    return `${draft.role === "학생단체" ? "단체명" : "브랜드명"}을 입력해 주세요.`
  }
  if (draft.role === "학생단체" && !draft.school.trim()) return "학교를 입력해 주세요."
  if (!verified) return "이메일 인증을 완료해 주세요."
  if (draft.password.length < 8) return "비밀번호는 8자 이상이어야 해요."
  if (draft.password !== draft.confirm) return "비밀번호가 일치하지 않아요."
  if (!draft.agreed) return "이용약관에 동의해 주세요."
  if (!draft.over14) return "만 14세 이상만 가입할 수 있어요."
  return ""
}

export function SignupModal({
  initialRole,
  onClose,
  onSignedUp,
  onLogin,
  onNotice,
}: {
  initialRole: Role
  onClose: () => void
  onSignedUp: (session: Session) => void
  onLogin: (role: Role) => void
  onNotice: (message: string) => void
}) {
  const [draft, setDraft] = useState(() => emptyDraft(initialRole))
  const [verification, setVerification] = useState<Verification | null>(null)
  const [codeInput, setCodeInput] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const verified = verification?.token !== undefined

  useEffect(() => {
    if (!verification || verification.token) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [verification])

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  const resetVerification = () => {
    setVerification(null)
    setCodeInput("")
  }

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

  const sendCode = () =>
    run(async () => {
      const result = await api.requestEmailCode({ role: draft.role, email: draft.email })
      setVerification({ expiresAt: result.expiresAt, devCode: result.devCode })
      setCodeInput("")
      setNow(Date.now())
      onNotice(`${result.email}로 인증번호를 보냈어요.`)
    })

  const confirmCode = () =>
    run(async () => {
      if (!verification) return
      const { verificationToken } = await api.verifyEmailCode({
        email: draft.email,
        code: codeInput,
      })
      setVerification({ ...verification, token: verificationToken })
    })

  const submit = () => {
    const verificationToken = verification?.token
    const problem = draftError(draft, verified)
    if (problem || !verificationToken) {
      setError(problem)
      return
    }
    void run(async () => {
      onSignedUp(
        await api.signup({
          role: draft.role,
          name: draft.name,
          type: draft.type,
          school: draft.role === "학생단체" ? draft.school : "",
          email: draft.email,
          password: draft.password,
          verificationToken,
          agreedToTerms: draft.agreed,
          over14: draft.over14,
        }),
      )
    })
  }

  return (
    <Modal banner name="signup" kicker="Join uniconnect" title="회원가입" onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <RolePicker
          name="signup-role"
          value={draft.role}
          onChange={(role) => {
            update({ role, type: accountTypes[role][0] })
            resetVerification()
          }}
        />
        <div className="form-row">
          <label>
            {draft.role === "학생단체" ? "단체명" : "브랜드명"}
            <input
              autoComplete="organization"
              placeholder={draft.role === "학생단체" ? "예) 삼육대 뮤즈" : "예) 오후의 커피"}
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
          <label>
            {draft.role === "학생단체" ? "단체 분류" : "업종"}
            <select
              value={draft.type}
              onChange={(event) => update({ type: event.target.value })}
            >
              {accountTypes[draft.role].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
        </div>
        {draft.role === "학생단체" && (
          <label>
            학교
            <input
              placeholder="예) 삼육대학교"
              value={draft.school}
              onChange={(event) => update({ school: event.target.value })}
            />
          </label>
        )}
        <div className="field-group">
          <label htmlFor="signup-email">
            {draft.role === "학생단체" ? "학교 이메일" : "회사 이메일"}
          </label>
          <div className="field-with-action">
            <input
              autoComplete="email"
              id="signup-email"
              placeholder={draft.role === "학생단체" ? "name@syu.ac.kr" : "name@company.com"}
              readOnly={verified}
              type="email"
              value={draft.email}
              onChange={(event) => {
                update({ email: event.target.value })
                resetVerification()
              }}
            />
            {verified ? (
              <button
                className="field-action secondary"
                onClick={resetVerification}
                type="button"
              >
                변경
              </button>
            ) : (
              <button
                className="field-action"
                disabled={busy}
                onClick={sendCode}
                type="button"
              >
                {verification ? "재전송" : "인증번호 받기"}
              </button>
            )}
          </div>
          {verified ? (
            <small className="field-hint success">이메일 인증이 완료됐어요.</small>
          ) : verification ? (
            <>
              <div className="field-with-action">
                <input
                  aria-label="인증번호"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6자리 인증번호"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, ""))}
                />
                <button
                  className="field-action"
                  disabled={busy}
                  onClick={confirmCode}
                  type="button"
                >
                  확인
                </button>
              </div>
              <small className="field-hint">
                {now < verification.expiresAt
                  ? `남은 시간 ${formatRemaining(verification.expiresAt - now)}`
                  : "인증 시간이 지났어요. 재전송을 눌러 주세요."}
                {verification.devCode && (
                  <>
                    {" · "}
                    개발 모드라서 메일 대신 인증번호를 여기에 보여드려요:{" "}
                    <strong>{verification.devCode}</strong>
                  </>
                )}
              </small>
            </>
          ) : (
            <small className="field-hint">
              {draft.role === "학생단체"
                ? "학교 이메일(ac.kr)로 인증해야 가입할 수 있어요."
                : "회사 이메일로 인증해야 가입할 수 있어요. 개인 메일(gmail, naver 등)은 사용할 수 없어요."}
            </small>
          )}
        </div>
        <div className="form-row">
          <label>
            비밀번호
            <input
              autoComplete="new-password"
              placeholder="8자 이상"
              type="password"
              value={draft.password}
              onChange={(event) => update({ password: event.target.value })}
            />
          </label>
          <label>
            비밀번호 확인
            <input
              autoComplete="new-password"
              type="password"
              value={draft.confirm}
              onChange={(event) => update({ confirm: event.target.value })}
            />
          </label>
        </div>
        <label className="terms-check">
          <input
            checked={draft.agreed}
            type="checkbox"
            onChange={(event) => update({ agreed: event.target.checked })}
          />
          {/* The documents open in a new tab, so the form keeps what was typed. */}
          <span>
            <a href={viewPath({ page: "대시보드", legal: "terms" })} rel="noopener" target="_blank">
              서비스 이용약관
            </a>
            과{" "}
            <a href={viewPath({ page: "대시보드", legal: "privacy" })} rel="noopener" target="_blank">
              개인정보 처리방침
            </a>
            에 동의합니다.
          </span>
        </label>
        {/* The terms take members from 14 (younger ones need a guardian). */}
        <label className="terms-check">
          <input
            checked={draft.over14}
            type="checkbox"
            onChange={(event) => update({ over14: event.target.checked })}
          />
          <span>만 14세 이상이에요.</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          가입하고 시작하기
        </button>
        <p className="auth-switch">
          이미 계정이 있나요?{" "}
          <button onClick={() => onLogin(draft.role)} type="button">
            로그인
          </button>
        </p>
      </form>
    </Modal>
  )
}
