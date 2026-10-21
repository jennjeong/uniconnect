import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import type { Sponsorship } from "../types"
import { AnalyticsDocument } from "./AnalyticsDocument"
import { exportPdf } from "./pdf"

// Renders the analytics report pages off screen, saves them as a PDF, then
// reports back through onDone (true when it failed).
export function AnalyticsExport({
  sponsorships,
  author,
  onDone,
}: {
  sponsorships: Sponsorship[]
  author: string
  onDone: (failed: boolean) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode runs effects twice while developing; export only once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    exportPdf(pages, "uniconnect-analytics-report.pdf")
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [onDone])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      <AnalyticsDocument author={author} sponsorships={sponsorships} />
    </div>,
    document.body,
  )
}
