import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import { t } from "../i18n"
import { todayIso } from "../lib/date"
import type { Program, ProgramReport } from "../types"
import { exportPdf, pdfFileName } from "./pdf"
import { ProgramReportDocument } from "./ProgramReportDocument"

// 캠퍼스 캠페인 보고를 화면 밖에서 그려 PDF로 저장한 뒤 onDone으로 알린다(실패하면 true).
export function ProgramReportExport({
  program,
  report,
  author,
  sample,
  onDone,
}: {
  program: Program
  report: ProgramReport
  author: string
  sample: boolean
  onDone: (failed: boolean) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode는 개발 중 effect를 두 번 실행한다. 내보내기는 한 번만 한다.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    const name = sample ? `${program.brief.name}-${t("예시")}` : program.brief.name
    exportPdf(pages, pdfFileName(t("캠페인 보고"), name, todayIso()))
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [onDone, program.brief.name, sample])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      <ProgramReportDocument author={author} program={program} report={report} sample={sample} />
    </div>,
    document.body,
  )
}
