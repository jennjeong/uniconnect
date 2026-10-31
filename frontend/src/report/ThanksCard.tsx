import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import logo from "../assets/brand/uniconnect_horizontal_reversed.svg"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { saveFile } from "../lib/download"
import type { Agreement } from "../types"
import { loadedFontCSS } from "./pdf"

// 협찬 감사 카드뉴스: one 1080×1350 image (Instagram's portrait post) thanking
// the brand for a sponsorship, on uniconnect's deep blue with the event and
// what it brought, for the group to post as it promised.
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

// Renders the card off screen, saves it as a PNG, then reports back through
// onDone (true when it failed).
export function ThanksCardExport({ agreement, onDone }: { agreement: Agreement; onDone: (failed: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  // StrictMode runs effects twice while developing; save only once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !container.current) return
    started.current = true
    const card = container.current.querySelector<HTMLElement>(".thanks-card")
    ;(async () => {
      const { toPng } = await import("html-to-image")
      await document.fonts.ready
      const image = await toPng(card!, { fontEmbedCSS: await loadedFontCSS(), pixelRatio: 1, width: 1080, height: 1350 })
      // Decoded here: the Content-Security-Policy lets fetch() reach this
      // site only, not a data: address.
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
