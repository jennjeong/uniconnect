import { t } from "../i18n"
import type { UploadDocument } from "../types"
import { photoFromFile } from "./image"

// 서류와 분쟁 증빙으로 고른 파일. 사진은 줄여서(lib/image.ts), PDF는 그대로 2MB까지
// 보낸다. 서버도 내용으로 다시 확인한다(backend lib/applications.ts의 parseDocument).
export const documentPdfMaxBytes = 2 * 1024 * 1024

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name)

// 시스템이 타입을 주지 않아도 PDF 타입의 data URL로 만든다.
const pdfDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*;base64,/, "data:application/pdf;base64,"))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export async function documentFromFile(file: File): Promise<UploadDocument> {
  if (isPdf(file)) {
    if (file.size > documentPdfMaxBytes) throw new Error(t("PDF는 2MB까지 올릴 수 있어요."))
    return { file: await pdfDataUrl(file), name: file.name }
  }
  return { file: await photoFromFile(file), name: file.name }
}

// data URL이 담은 바이트 수(서버 한도와 맞춰 보려고 쓴다).
export const dataUrlBytes = (url: string) => {
  const base64 = url.slice(url.indexOf(",") + 1)
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)
}

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`
