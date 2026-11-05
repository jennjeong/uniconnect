import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { keptReferral } from "../lib/referral"
import { DocumentField, type PickedDocument } from "../components/DocumentField"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { PasswordRules } from "../components/PasswordRules"
import { PositionField } from "../components/PositionField"
import { RolePicker } from "../components/RolePicker"
import { t } from "../i18n"
import { accountTypeGroups, accountTypes } from "../data/roles"
import { formatRemaining } from "../lib/format"
import { passwordProblem } from "../lib/password"
import { viewPath } from "../lib/route"
import type { Role, Session } from "../types"

const emptyDraft = (role: Role) => ({
  role,
  name: "",
  type: accountTypes[role][0],
  school: "",
  contactName: "",
  position: "",
  phone: "",
  email: "",
  password: "",
  confirm: "",
  agreed: false,
  over14: false,
})

type Draft = ReturnType<typeof emptyDraft>

type Verification = {
  expiresAt: number
  // 백엔드에 메일 서비스가 없을 때(개발)만 돌려준다.
  devCode?: string
  // 코드를 확인하면 설정된다. 가입은 이를 증거로 보낸다.
  token?: string
}

// API를 부르기 전의 간단한 검사. 백엔드가 학교·회사 이메일 규칙을 포함해 모두
// 다시 검증한다.
function draftError(draft: Draft, verified: boolean) {
  if (!draft.name.trim()) {
    return draft.role === "학생단체" ? t("단체명을 입력해 주세요.") : t("브랜드명을 입력해 주세요.")
  }
  if (draft.role === "학생단체" && !draft.school.trim()) return t("학교를 입력해 주세요.")
  if (!draft.contactName.trim()) return t("담당자 이름을 입력해 주세요.")
  if (!draft.position.trim()) return t("직책을 입력해 주세요.")
  if (!/^01[016789]\d{7,8}$/.test(draft.phone.replace(/\D/g, ""))) return t("휴대폰 번호를 010-1234-5678처럼 입력해 주세요.")
  if (!verified) return t("이메일 인증을 완료해 주세요.")
  if (passwordProblem(draft.password)) return passwordProblem(draft.password)
  if (draft.password !== draft.confirm) return t("비밀번호가 일치하지 않아요.")
  if (!draft.agreed) return t("이용약관에 동의해 주세요.")
  if (!draft.over14) return t("만 14세 이상만 가입할 수 있어요.")
  return ""
}

export function SignupModal({
  initialRole,
  onClose,
  invite,
  onSignedUp,
  onPending,
  onLogin,
  onNotice,
}: {
  initialRole: Role
  // 방문자가 가입하는 가게의 초대(/invite/<code>).
  invite?: string
  onClose: () => void
  onSignedUp: (session: Session) => void
  // 운영자에게 보내 확인한다. 아직 로그인할 곳은 없다.
  onPending: () => void
  onLogin: (role: Role) => void
  onNotice: (message: string) => void
}) {
  const [draft, setDraft] = useState(() => emptyDraft(initialRole))
  const [verification, setVerification] = useState<Verification | null>(null)
  const [codeInput, setCodeInput] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  // 초대된 가게는 어떤 이메일이든 받고 서류를 함께 받는다.
  const invitedShop = Boolean(invite) && draft.role === "브랜드"
  const [document, setDocument] = useState<PickedDocument>()
  const verified = verification?.token !== undefined
  // 두 링크를 둘러싼 동의 문장. 보이는 언어로 쓴다.
  const [termsBefore, termsBetween, termsAfter] = t("{terms}과 {privacy}에 동의합니다.").split(
    /\{terms\}|\{privacy\}/,
  )

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

  const sendCode = () =>
    run(async () => {
      const result = await api.requestEmailCode({
        role: draft.role,
        email: draft.email,
        ...(invitedShop ? { invite } : {}),
      })
      setVerification({ expiresAt: result.expiresAt, devCode: result.devCode })
      setCodeInput("")
      setNow(Date.now())
      onNotice(t("{email}로 인증번호를 보냈어요.", { email: result.email }))
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
    const problem = draftError(draft, verified) || (invitedShop && !document ? t("사업자등록증이나 재직 서류를 올려 주세요.") : "")
    if (problem || !verificationToken) {
      setError(problem)
      return
    }
    void run(async () => {
      const answer = await api.signup({
          role: draft.role,
          name: draft.name,
          type: draft.type,
          school: draft.role === "학생단체" ? draft.school : "",
          email: draft.email,
          password: draft.password,
          verificationToken,
          agreedToTerms: draft.agreed,
          over14: draft.over14,
          contact: { name: draft.contactName.trim(), position: draft.position.trim(), phone: draft.phone },
          ...(keptReferral() ? { referral: keptReferral() } : {}),
          ...(invitedShop && document ? { invite, document } : {}),
      })
      if ("pending" in answer) onPending()
      else onSignedUp(answer)
    })
  }

  return (
    <Modal banner name="signup" kicker="Join uniconnect" title={t("회원가입")} onClose={onClose}>
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
            update({ role, type: accountTypes[role][0], position: "" })
            resetVerification()
          }}
        />
        <div className="form-row">
          <label>
            {draft.role === "학생단체" ? t("단체명") : t("브랜드명")}
            <input
              autoComplete="organization"
              placeholder={draft.role === "학생단체" ? t("예) 삼육대 뮤즈") : t("예) 오후의 커피")}
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
          <label>
            {draft.role === "학생단체" ? t("단체 분류") : t("업종")}
            <select
              value={draft.type}
              onChange={(event) => update({ type: event.target.value })}
            >
              {accountTypeGroups[draft.role].map((group) => (
                <optgroup key={group.label} label={t(group.label)}>
                  {group.types.map((type) => (
                    <option key={type} value={type}>
                      {t(type)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        {draft.role === "학생단체" && (
          <label>
            {t("학교")}
            <input
              placeholder={t("예) 삼육대학교")}
              value={draft.school}
              onChange={(event) => update({ school: event.target.value })}
            />
          </label>
        )}
        <div className="form-row">
          <label>
            {t("담당자 이름")}
            <input
              autoComplete="name"
              placeholder={t("예) 홍길동")}
              value={draft.contactName}
              onChange={(event) => update({ contactName: event.target.value })}
            />
          </label>
          <PositionField
            key={draft.role}
            onChange={(position) => update({ position })}
            role={draft.role}
            value={draft.position}
          />
        </div>
        <label>
          {t("휴대폰 번호")}
          <input
            aria-describedby="signup-phone-hint"
            autoComplete="tel"
            inputMode="tel"
            placeholder="010-1234-5678"
            type="tel"
            value={draft.phone}
            onChange={(event) => update({ phone: event.target.value })}
          />
        </label>
        <small className="field-hint" id="signup-phone-hint">
          {t("협찬이 확정된 상대에게만 임시 전자 계약서에서 보여요.")}
        </small>
        {invitedShop && (
          <DocumentField
            hint={t("운영자가 서류를 확인하고 승인하면 가입이 끝나요. 승인 전에는 로그인할 수 없고 서류는 확인 뒤 바로 지워요.")}
            label={t("사업자등록증 또는 재직 서류")}
            onPick={setDocument}
          />
        )}
        <div className="field-group">
          <label htmlFor="signup-email">
            {draft.role === "학생단체" ? t("학교 이메일") : invitedShop ? t("이메일") : t("회사 이메일")}
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
                {t("변경")}
              </button>
            ) : (
              <button
                className="field-action"
                disabled={busy}
                onClick={sendCode}
                type="button"
              >
                {verification ? t("재전송") : t("인증번호 받기")}
              </button>
            )}
          </div>
          {verified ? (
            <small className="field-hint success">{t("이메일 인증이 완료됐어요.")}</small>
          ) : verification ? (
            <>
              <div className="field-with-action">
                <input
                  aria-label={t("인증번호")}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("6자리 인증번호")}
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, ""))}
                />
                <button
                  className="field-action"
                  disabled={busy}
                  onClick={confirmCode}
                  type="button"
                >
                  {t("확인")}
                </button>
              </div>
              <small className="field-hint">
                {now < verification.expiresAt
                  ? t("남은 시간 {time}", { time: formatRemaining(verification.expiresAt - now) })
                  : t("인증 시간이 지났어요. 재전송을 눌러 주세요.")}
                {verification.devCode && (
                  <>
                    {" · "}
                    {t("개발 모드라서 메일 대신 인증번호를 여기에 보여드려요:")}{" "}
                    <strong>{verification.devCode}</strong>
                  </>
                )}
              </small>
            </>
          ) : (
            <small className="field-hint">
              {draft.role === "학생단체"
                ? t("학교 이메일(ac.kr)로 인증해야 가입할 수 있어요.")
                : t("회사 이메일로 인증해야 가입할 수 있어요. 개인 메일(gmail, naver 등)은 사용할 수 없어요.")}
            </small>
          )}
        </div>
        <div className="form-row">
          <PasswordField
            aria-describedby="signup-password-rules"
            autoComplete="new-password"
            label={t("비밀번호")}
            placeholder={t("영문·숫자·특수문자 8자 이상")}
            value={draft.password}
            onChange={(event) => update({ password: event.target.value })}
          />
          <PasswordField
            autoComplete="new-password"
            label={t("비밀번호 확인")}
            value={draft.confirm}
            onChange={(event) => update({ confirm: event.target.value })}
          />
        </div>
        <PasswordRules id="signup-password-rules" password={draft.password} />
        <label className="terms-check">
          <input
            checked={draft.agreed}
            type="checkbox"
            onChange={(event) => update({ agreed: event.target.checked })}
          />
          {/* 문서는 새 탭에서 열려서 폼에 입력한 내용이 남는다. */}
          <span>
            {termsBefore}
            <a href={viewPath({ page: "대시보드", legal: "terms" })} rel="noopener" target="_blank">
              {t("서비스 이용약관")}
            </a>
            {termsBetween}
            <a href={viewPath({ page: "대시보드", legal: "privacy" })} rel="noopener" target="_blank">
              {t("개인정보 처리방침")}
            </a>
            {termsAfter}
          </span>
        </label>
        {/* 약관은 만 14세부터 회원으로 받는다(더 어리면 보호자가 필요하다). */}
        <label className="terms-check">
          <input
            checked={draft.over14}
            type="checkbox"
            onChange={(event) => update({ over14: event.target.checked })}
          />
          <span>{t("만 14세 이상이에요.")}</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("가입하고 시작하기")}
        </button>
        <p className="auth-switch">
          {t("이미 계정이 있나요?")}{" "}
          <button onClick={() => onLogin(draft.role)} type="button">
            {t("로그인")}
          </button>
        </p>
      </form>
    </Modal>
  )
}
