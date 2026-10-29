import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import type { PremiumReport } from "../types"
import { InsightDocument } from "./InsightDocument"
import { exportPdf } from "./pdf"

// Renders the detailed report's pages off screen, saves them as a PDF, then
// reports back through onDone (true when it failed).
export function InsightExport({ report, onDone }: { report: PremiumReport; onDone: (failed: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode runs effects twice while developing; export only once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    exportPdf(pages, `uniconnect-${report.number}.pdf`)
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [onDone, report.number])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      <InsightDocument report={report} />
    </div>,
    document.body,
  )
}
