import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "../api"
import type { MetricEntry, Metrics, Report } from "../types"
import { exportPdf } from "./pdf"
import { ReportDocument } from "./ReportDocument"

// 리포트 페이지를 화면 밖에서 그려 PDF로 저장한 뒤 onDone으로 알린다(실패하면
// true).
export function ReportExport({
  report,
  metrics,
  author,
  onDone,
}: {
  report: Report
  metrics: Metrics
  author: string
  onDone: (failed: boolean) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode는 개발 중 effect를 두 번 실행한다. 내보내기는 한 번만 한다.
  const started = useRef(false)
  const [entries, setEntries] = useState<MetricEntry[] | null>(null)

  useEffect(() => {
    api
      .measurementLog(report.eventId)
      .then((result) => setEntries(result.entries))
      .catch(() => setEntries([]))
  }, [report.eventId])

  useEffect(() => {
    if (!entries || started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    exportPdf(pages, "uniconnect-performance-report.pdf")
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [entries, onDone])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      {entries && (
        <ReportDocument author={author} entries={entries} metrics={metrics} report={report} />
      )}
    </div>,
    document.body,
  )
}
