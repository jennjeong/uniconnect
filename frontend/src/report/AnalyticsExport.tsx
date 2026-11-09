import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import type { Sponsorship } from "../types"
import { AnalyticsDocument } from "./AnalyticsDocument"
import { t } from "../i18n"
import { todayIso } from "../lib/date"
import { exportPdf, pdfFileName } from "./pdf"

// 분석 리포트 페이지를 화면 밖에서 그려 PDF로 저장한 뒤 onDone으로
// 알린다(실패하면 true).
export function AnalyticsExport({
  sponsorships,
  author,
  onDone,
  sample = false,
}: {
  // 예시 자료: 파일 이름에 sample, 페이지마다 '예시 데이터'.
  sample?: boolean
  sponsorships: Sponsorship[]
  author: string
  onDone: (failed: boolean) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode는 개발 중 effect를 두 번 실행한다. 내보내기는 한 번만 한다.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    const name = pdfFileName(t("성과 분석"), author, todayIso())
    exportPdf(pages, sample ? name.replace(/^uniconnect-/, "uniconnect-sample-") : name)
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [author, onDone, sample])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      <AnalyticsDocument author={author} sample={sample} sponsorships={sponsorships} />
    </div>,
    document.body,
  )
}
