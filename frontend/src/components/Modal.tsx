import { useContext, useEffect, type ReactNode } from "react"

import type { ModalName } from "../types"
import { GradientBackdrop } from "./GradientBackdrop"
import { Icon } from "./Icon"
import { ClosingContext } from "./Presence"

// Shared dialog frame: a white panel over a blurred backdrop, an eyebrow
// over the title and a round close button. With `banner`, the heading sits
// on a moving navy ShaderGradient strip (login and sign-up). Backdrop click, the close button and Escape all close it; inside
// a Presence it slides down while closing.
export function Modal({
  name,
  kicker,
  title,
  banner = false,
  onClose,
  children,
}: {
  name: ModalName
  kicker: string
  title: string
  banner?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const closing = useContext(ClosingContext)

  useEffect(() => {
    if (closing) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [closing, onClose])

  const heading = (
    <div className="modal-header">
      <span className={banner ? "eyebrow light" : "eyebrow"}>{kicker}</span>
      <h2 id="modal-title">{title}</h2>
    </div>
  )

  return (
    <div
      className={closing ? "modal-backdrop closing" : "modal-backdrop"}
      role="presentation"
      onMouseDown={closing ? undefined : onClose}
    >
      <div
        className={`modal modal-${name}${banner ? " has-banner" : ""}${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {banner ? (
          <div className="modal-banner has-gradient">
            <GradientBackdrop />
            {heading}
          </div>
        ) : (
          heading
        )}
        <button className="modal-close" aria-label="닫기" onClick={onClose} type="button">
          <Icon name="close" size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}
