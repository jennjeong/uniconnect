import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import type { BusinessStatus } from "../types"

// 사업자 확인: the number, opening date and representative's name as on
// the business registration certificate, checked with the National Tax
// Service (backend lib/business.ts). Only the number is kept, once it
// matches.
export function BusinessModal({
  onClose,
  onVerified,
}: {
  onClose: () => void
  onVerified: (business: NonNullable<BusinessStatus["business"]>) => void
}) {
  const [number, setNumber] = useState("")
  const [startDate, setStartDate] = useState("")
  const [owner, setOwner] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (number.replace(/\D/g, "").length !== 10) {
      setError(t("사업자등록번호 10자리를 적어 주세요."))
      return
    }
    if (!startDate || !owner.trim()) {
      setError(t("개업일자와 대표자 성명을 적어 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const { business } = await api.verifyBusiness({ number, startDate, owner: owner.trim() })
      onVerified(business)
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal kicker="Business" name="business" onClose={onClose} title={t("사업자 확인")}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">
          {t("사업자등록증의 내용으로 국세청에서 확인해요. 확인되면 소개에 '사업자 확인'이 붙어요. 대표자 성명과 개업일자는 저장하지 않아요.")}
        </p>
        <label>
          {t("사업자등록번호")}
          <input
            autoComplete="off"
            inputMode="numeric"
            maxLength={12}
            onChange={(event) => setNumber(event.target.value.replace(/[^\d-]/g, ""))}
            placeholder="123-45-67890"
            value={number}
          />
        </label>
        <label>
          {t("개업일자")}
          <input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
        </label>
        <label>
          {t("대표자 성명")}
          <input
            autoComplete="off"
            maxLength={30}
            onChange={(event) => setOwner(event.target.value)}
            placeholder={t("예) 홍길동")}
            value={owner}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("국세청에서 확인하기")}
        </button>
      </form>
    </Modal>
  )
}
