import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import type { PremiumReport } from "../types"
import { InsightDocument } from "./InsightDocument"
import { t } from "../i18n"
import { todayIso } from "../lib/date"
import { exportPdf, pdfFileName } from "./pdf"

// 상세 리포트 페이지를 화면 밖에서 그려 PDF로 저장한 뒤 onDone으로
// 알린다(실패하면 true).
export function InsightExport({ report, onDone }: { report: PremiumReport; onDone: (failed: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode는 개발 중 effect를 두 번 실행한다. 내보내기는 한 번만 한다.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    exportPdf(pages, pdfFileName(t("상세 성과 리포트"), `${report.sponsorship.eventName} ${report.number}`, todayIso()))
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [onDone, report.number, report.sponsorship.eventName])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      <InsightDocument report={report} />
    </div>,
    document.body,
  )
}
