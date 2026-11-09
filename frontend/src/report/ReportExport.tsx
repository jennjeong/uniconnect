import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "../api"
import type { MetricEntry, Metrics, Report } from "../types"
import { t } from "../i18n"
import { todayIso } from "../lib/date"
import { exportPdf, pdfFileName } from "./pdf"
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
  // 부르는 쪽이 매번 새 함수를 넘겨도 기록을 다시 받지 않게, 최신 onDone을 ref로 든다.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  const [entries, setEntries] = useState<MetricEntry[] | null>(null)

  // 기록을 받지 못하면 빈 기록으로 만들지 않고 실패로 알린다(없는 기록이 0처럼 보이지 않게).
  useEffect(() => {
    api
      .measurementLog(report.eventId)
      .then((result) => setEntries(result.entries))
      .catch((error) => {
        console.error(error)
        done.current(true)
      })
  }, [report.eventId])

  useEffect(() => {
    if (!entries || started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    exportPdf(pages, pdfFileName(t("성과 리포트"), report.eventName, todayIso()))
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [entries, onDone, report.eventName])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      {entries && (
        <ReportDocument author={author} entries={entries} metrics={metrics} report={report} />
      )}
    </div>,
    document.body,
  )
}
