import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "../api"
import { sponsorHistory, type HistoryRow } from "../lib/history"
import type { EventPage } from "../types"
import { t } from "../i18n"
import { todayIso } from "../lib/date"
import { exportPdf, pdfFileName } from "./pdf"
import { ProposalDocument } from "./ProposalDocument"

// 단체의 협찬 기록과 함께 행사의 제안서를 화면 밖에서 그려 PDF로 저장한 뒤
// onDone으로 알린다(실패하면 true).
export function ProposalExport({ page, onDone }: { page: EventPage; onDone: (failed: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode는 개발 중 effect를 두 번 실행한다. 내보내기는 한 번만 한다.
  const started = useRef(false)
  // 부르는 쪽이 매번 새 함수를 넘겨도 기록을 다시 받지 않게, 최신 onDone을 ref로 든다.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  const [history, setHistory] = useState<HistoryRow[] | null>(null)

  // 협찬 기록을 받지 못하면 기록이 없는 것처럼(0건) 만들지 않고 실패로 알린다.
  useEffect(() => {
    api
      .measurements("학생단체")
      .then((result) => setHistory(sponsorHistory(result.measurements)))
      .catch((error) => {
        console.error(error)
        done.current(true)
      })
  }, [])

  useEffect(() => {
    if (!history || started.current || !container.current) return
    started.current = true
    const pages = [...container.current.querySelectorAll<HTMLElement>(".pdf-page")]
    exportPdf(pages, pdfFileName(t("협찬 제안서"), page.event.name, todayIso()))
      .then(() => onDone(false))
      .catch((error) => {
        console.error(error)
        onDone(true)
      })
  }, [history, onDone, page.event.name])

  return createPortal(
    <div aria-hidden="true" className="pdf-export" ref={container}>
      {history && <ProposalDocument history={history} page={page} />}
    </div>,
    document.body,
  )
}
