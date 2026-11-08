import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { dataUrlBytes, documentFromFile, fileSize } from "../lib/documents"
import type { UploadDocument } from "../types"

// 서버가 받는 두 서류의 합(backend lib/groupCheck.ts의 groupCheckMaxBytes).
const maxBytes = 3 * 1024 * 1024

// 학생단체 확인(#334): 대표가 대표자 이름과 재학 증명, 단체 소속 증빙을 내면
// 운영자가 /admin의 가입 승인에서 보고 정한다. 서류는 결정이 나면 바로 지운다.
export function GroupCheckModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [representative, setRepresentative] = useState("")
  const [enrollment, setEnrollment] = useState<UploadDocument | null>(null)
  const [membership, setMembership] = useState<UploadDocument | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const pick = async (file: File | undefined, set: (document: UploadDocument | null) => void) => {
    if (!file) return
    setReading(true)
    setError("")
    try {
      set(await documentFromFile(file))
    } catch (problem) {
      set(null)
      setError(problem instanceof Error ? problem.message : errorMessage(problem))
    } finally {
      setReading(false)
    }
  }

  const total = (enrollment ? dataUrlBytes(enrollment.file) : 0) + (membership ? dataUrlBytes(membership.file) : 0)

  const submit = async () => {
    if (busy || reading) return
    if (!representative.trim()) {
      setError(t("대표자 이름을 적어 주세요."))
      return
    }
    if (!enrollment || !membership) {
      setError(t("재학 증명과 단체 소속 증빙을 모두 올려 주세요."))
      return
    }
    if (total > maxBytes) {
      setError(t("서류 둘을 합쳐 3MB 이하로 올려 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      await api.requestGroupVerification({ representative: representative.trim(), enrollment, membership })
      onSent()
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  const fileField = (
    label: string,
    hint: string,
    document: UploadDocument | null,
    set: (document: UploadDocument | null) => void,
  ) => (
    <label>
      {label}
      <input
        accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
        onChange={(event) => {
          void pick(event.target.files?.[0], set)
          event.target.value = ""
        }}
        type="file"
      />
      <small className="field-hint">
        {document ? t("{name} · {size}", { name: document.name, size: fileSize(dataUrlBytes(document.file)) }) : hint}
      </small>
    </label>
  )

  return (
    <Modal kicker="Verification" name="group-check" onClose={onClose} title={t("학생단체 확인")}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="auth-lead">
          {t("대표자의 재학과 단체 소속을 서류로 보내면 운영자가 확인해요. 확인되면 1년 동안 소개에 '단체 확인'이 붙어요.")}
        </p>
        <label>
          {t("대표자 이름")}
          <input
            autoComplete="name"
            maxLength={40}
            onChange={(event) => setRepresentative(event.target.value)}
            placeholder={t("예) 홍길동")}
            value={representative}
          />
        </label>
        {fileField(t("재학 증명"), t("재학증명서나 학생증 · 사진이나 PDF"), enrollment, setEnrollment)}
        {fileField(t("단체 소속 증빙"), t("임명장, 동아리 등록증, 학교 공지 등 · 사진이나 PDF"), membership, setMembership)}
        <p className="field-hint">
          {t("서류는 운영자만 보고, 승인하든 거절하든 결정이 나면 바로 지워요. 확인한 날과 기한만 남아요.")}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy || reading} type="submit">
          {reading ? t("파일을 읽고 있어요…") : t("확인 요청 보내기")}
        </button>
      </form>
    </Modal>
  )
}
