import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "../api"
import type { MetricEntry, Metrics, Report } from "../types"
import { exportPdf } from "./pdf"
import { ReportDocument } from "./ReportDocument"

// Renders the report pages off screen, saves them as a PDF, then reports
// back through onDone (true when it failed).
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
  // StrictMode runs effects twice while developing; export only once.
  const started = useRef(false)
  const [entries, setEntries] = useState<MetricEntry[] | null>(null)

  useEffect(() => {
    api
      .metricLog()
      .then((result) => setEntries(result.entries))
      .catch(() => setEntries([]))
  }, [])

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
