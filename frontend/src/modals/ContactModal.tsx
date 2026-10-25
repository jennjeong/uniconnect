import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { PositionField } from "../components/PositionField"
import { t } from "../i18n"
import type { Account } from "../types"

// The person running the account, from 내 정보: name, position and mobile
// number, as sign-up asks for them (a new officer after a handover, say).
export function ContactModal({
  account,
  onClose,
  onSaved,
}: {
  account: Account
  onClose: () => void
  onSaved: (account: Account) => void
}) {
  const [draft, setDraft] = useState({
    name: account.contact?.name ?? "",
    position: account.contact?.position ?? "",
    phone: account.contact?.phone ?? "",
  })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!draft.name.trim()) return setError(t("담당자 이름을 입력해 주세요."))
    if (!draft.position.trim()) return setError(t("직책을 입력해 주세요."))
    if (!/^01[016789]\d{7,8}$/.test(draft.phone.replace(/\D/g, ""))) {
      return setError(t("휴대폰 번호를 010-1234-5678처럼 입력해 주세요."))
    }
    setBusy(true)
    setError("")
    try {
      onSaved((await api.updateContact(draft)).account)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="contact" kicker="Account" title={t("담당자 정보 수정")} onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">{t("협찬이 확정된 상대에게만 임시 전자 계약서에서 보여요.")}</p>
        <label>
          {t("담당자 이름")}
          <input
            autoComplete="name"
            placeholder={t("예) 홍길동")}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <PositionField
          onChange={(position) => setDraft((current) => ({ ...current, position }))}
          role={account.role}
          value={draft.position}
        />
        <label>
          {t("휴대폰 번호")}
          <input
            autoComplete="tel"
            inputMode="tel"
            placeholder="010-1234-5678"
            type="tel"
            value={draft.phone}
            onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("저장하기")}
        </button>
      </form>
    </Modal>
  )
}
