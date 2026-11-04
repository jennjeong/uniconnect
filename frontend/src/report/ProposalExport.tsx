import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "../api"
import { sponsorHistory, type HistoryRow } from "../lib/history"
import type { EventPage } from "../types"
import { exportPdf } from "./pdf"
import { ProposalDocument } from "./ProposalDocument"

// 단체의 협찬 기록과 함께 행사의 제안서를 화면 밖에서 그려 PDF로 저장한 뒤
// onDone으로 알린다(실패하면 true).
export function ProposalExport({ page, onDone }: { page: EventPage; onDone: (failed: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode는 개발 중 effect를 두 번 실행한다. 내보내기는 한 번만 한다.
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
