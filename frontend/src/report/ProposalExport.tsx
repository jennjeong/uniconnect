import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "../api"
import { sponsorHistory, type HistoryRow } from "../lib/history"
import type { EventPage } from "../types"
import { exportPdf } from "./pdf"
import { ProposalDocument } from "./ProposalDocument"

// Renders the event's proposal off screen with the group's sponsorship
// record, saves it as a PDF, then reports back through onDone (true when
// it failed).
export function ProposalExport({ page, onDone }: { page: EventPage; onDone: (failed: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode runs effects twice while developing; export only once.
  const started = useRef(false)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)

  useEffect(() => {
    api
      .measurements("학생단체")
      .then((result) => setHistory(sponsorHistory(result.measurements)))
      .catch(() => setHistory([]))
  }, [])

  useEffect(() => {
    if (!history || started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    exportPdf(pages, `uniconnect-proposal-${page.event.date}.pdf`)
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [history, onDone, page.event.date])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      {history && <ProposalDocument history={history} page={page} />}
    </div>,
    document.body,
  )
}
