import { useState } from "react"

import { api, errorMessage } from "../api"
import { DocumentField, type PickedDocument } from "../components/DocumentField"
import { Modal } from "../components/Modal"
import { PasswordField } from "../components/PasswordField"
import { PasswordRules } from "../components/PasswordRules"
import { t } from "../i18n"
import { passwordProblem } from "../lib/password"

// 초대받은 계정에 합류한다(로그인 팝업의 초대받았나요?에서). 초대가 간 이메일,
// 코드, 본인 비밀번호, 재직 증빙을 받고 운영자가 먼저 확인한다.
export function JoinTeamModal({
  onClose,
  onJoined,
  onLogin,
}: {
  onClose: () => void
  onJoined: () => void
  onLogin: () => void
}) {
  const [draft, setDraft] = useState({ email: "", code: "", password: "", confirm: "" })
  const [document, setDocument] = useState<PickedDocument>()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!draft.email.trim() || !draft.code.trim()) return setError(t("초대받은 이메일과 초대 코드를 입력해 주세요."))
    if (passwordProblem(draft.password)) return setError(passwordProblem(draft.password))
    if (draft.password !== draft.confirm) return setError(t("비밀번호가 일치하지 않아요."))
    if (!document) return setError(t("재직 증명 서류를 올려 주세요."))
    setBusy(true)
    setError("")
    try {
      await api.joinTeam({ email: draft.email.trim(), code: draft.code.trim(), password: draft.password, document })
      onJoined()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const set = (key: keyof typeof draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Modal banner name="join" kicker="Join a Team" title={t("초대받아 함께 관리하기")} onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">
          {t("대표가 보낸 초대 메일의 이메일과 6자리 코드를 입력하고 나만 쓸 비밀번호를 정해 주세요. 운영자가 재직 증명 서류를 확인하면 메일로 알려 드리고, 첫 로그인에서 2단계 인증을 설정해요.")}
        </p>
        <label>
          {t("초대받은 이메일")}
          <input autoComplete="email" onChange={set("email")} type="email" value={draft.email} />
        </label>
        <label>
          {t("초대 코드")}
          <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={set("code")} value={draft.code} />
        </label>
        <PasswordField
          aria-describedby="join-password-rules"
          autoComplete="new-password"
          label={t("새 비밀번호")}
          onChange={set("password")}
          value={draft.password}
        />
        <PasswordField autoComplete="new-password" label={t("새 비밀번호 확인")} onChange={set("confirm")} value={draft.confirm} />
        <PasswordRules id="join-password-rules" password={draft.password} />
        <DocumentField
          hint={t("재직증명서나 임명장, 학생증처럼 이 단체 소속임을 보여 주는 서류예요. 확인 뒤 바로 지워요.")}
          label={t("재직 증명 서류")}
          onPick={setDocument}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("함께 관리 시작하기")}
        </button>
        <p className="auth-switch">
          {t("이미 함께 관리하고 있나요?")}{" "}
          <button onClick={onLogin} type="button">
            {t("로그인")}
          </button>
        </p>
      </form>
    </Modal>
  )
}
