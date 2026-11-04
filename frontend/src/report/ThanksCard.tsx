import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import logo from "../assets/brand/uniconnect_horizontal_reversed.svg"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { saveFile } from "../lib/download"
import type { Agreement } from "../types"
import { loadedFontCSS } from "./pdf"

// 협찬 감사 카드뉴스: 협찬에 대해 브랜드에 감사하는 1080×1350 이미지(인스타그램
// 세로 게시물) 하나. uniconnect의 짙은 파랑 위에 행사와 그것이 가져온 것을
// 담고, 단체가 약속한 대로 올린다.
export function ThanksCardImage({ agreement }: { agreement: Agreement }) {
  const counts = agreement.measure?.counts
  const figures = counts
    ? [
        { label: t("QR 참여"), value: counts.scans },
        { label: t("쿠폰 수령"), value: counts.coupons },
        { label: t("매장 방문"), value: counts.visits },
      ].filter((figure) => figure.value > 0)
    : []
  return (
    <div className="thanks-card">
      <img alt="uniconnect" className="thanks-logo" src={logo} />
      <span className="thanks-eyebrow">THANK YOU</span>
      <h1>
        <span>{agreement.brand.name}</span>
        {t("고맙습니다")}
      </h1>
      <p className="thanks-lead">
        {t("{group}의 ‘{event}’를 함께해 주셨어요.", { group: agreement.group.name, event: agreement.eventName })}
      </p>
      {agreement.eventDate && <p className="thanks-date">{formatFullDate(agreement.eventDate)}</p>}
      {figures.length > 0 && (
        <ul className="thanks-figures">
          {figures.map((figure) => (
            <li key={figure.label}>
              <strong>{figure.value.toLocaleString("ko-KR")}</strong>
              <small>{figure.label}</small>
            </li>
          ))}
        </ul>
      )}
      <footer>
        <span>{agreement.group.name}</span>
        <span>#uniconnect #캠퍼스협찬</span>
      </footer>
    </div>
  )
}

// 카드를 화면 밖에서 그려 PNG로 저장한 뒤 onDone으로 알린다(실패하면 true).
export function ThanksCardExport({ agreement, onDone }: { agreement: Agreement; onDone: (failed: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode는 개발 중 effect를 두 번 실행한다. 저장은 한 번만 한다.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !container.current) return
    started.current = true
    const card = container.current.querySelector<HTMLElement>(".thanks-card")
    ;(async () => {
      const { toPng } = await import("html-to-image")
      await document.fonts.ready
      const image = await toPng(card!, { fontEmbedCSS: await loadedFontCSS(), pixelRatio: 1, width: 1080, height: 1350 })
      // 여기서 디코딩한다. Content-Security-Policy가 fetch()가 이 사이트에만
      // 닿게 하고 data: 주소는 막는다.
      const bytes = Uint8Array.from(atob(image.split(",")[1]), (letter) => letter.charCodeAt(0))
      saveFile(`uniconnect-thanks-${agreement.eventDate || "card"}.png`, bytes, "image/png")
    })().then(
      () => onDone(false),
      (error) => {
        console.error(error)
        onDone(true)
      },
    )
  }, [agreement, onDone])

  return createPortal(
    <div aria-hidden="true" className="card-export" ref={container}>
      <ThanksCardImage agreement={agreement} />
    </div>,
    document.body,
  )
}
