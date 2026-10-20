import { useContext, useEffect, type ReactNode } from "react"

import type { ModalName } from "../types"
import { Icon } from "./Icon"
import { ClosingContext } from "./Presence"

// Shared dialog frame: backdrop click, the close button and Escape all close it.
// Inside a Presence it slides down while closing.
export function Modal({
  name,
  kicker,
  title,
  onClose,
  children,
}: {
  name: ModalName
  kicker: string
  title: string
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

  return (
    <div
      className={closing ? "modal-backdrop closing" : "modal-backdrop"}
      role="presentation"
      onMouseDown={closing ? undefined : onClose}
    >
      <div
        className={`modal modal-${name}${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="section-kicker dark">{kicker}</span>
            <p id="modal-title">{title}</p>
          </div>
          <button
            className="icon-button"
            aria-label="닫기"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
