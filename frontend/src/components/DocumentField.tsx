import { useState } from "react"

import { Icon } from "./Icon"
import { t } from "../i18n"
import { photoFromFile } from "../lib/image"

// The largest PDF the server takes (backend lib/photos.ts).
const pdfMaxBytes = 2 * 1024 * 1024

export type PickedDocument = { file: string; name: string }

const readPdf = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*;base64,/, "data:application/pdf;base64,"))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// A document for the operators to check (backend lib/applications.ts): a
// photo, resized in the browser, or a PDF up to 2 MB.
export function DocumentField({
  label,
  hint,
  onPick,
}: {
  label: string
  hint: string
  onPick: (document: PickedDocument | undefined) => void
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  const pick = async (file: File) => {
    setError("")
    try {
      const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      if (pdf && file.size > pdfMaxBytes) throw new Error("large")
      onPick({ file: pdf ? await readPdf(file) : await photoFromFile(file), name: file.name })
      setName(file.name)
    } catch {
      onPick(undefined)
      setName("")
      setError(t("사진이나 2MB 이하의 PDF로 올려 주세요."))
    }
  }

  return (
    <div className="document-field">
      <span>{label}</span>
      <label className="cancel-button">
        <Icon name="plus" size={15} /> {name ? t("다른 파일로 바꾸기") : t("파일 올리기")}
        <input
          accept="image/*,application/pdf,.pdf"
          className="sr-only"
          onChange={(changed) => {
            const file = changed.target.files?.[0]
            changed.target.value = ""
            if (file) void pick(file)
          }}
          type="file"
        />
      </label>
      {name && <small>{name}</small>}
      <small className="field-hint">{hint}</small>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
