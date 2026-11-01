import { useContext } from "react"

import { ClosingContext } from "./Presence"

// Short message after an action; inside a Presence it sinks away when hidden.
export function Toast({ message }: { message: string }) {
  const closing = useContext(ClosingContext)
  return (
    <div className={closing ? "toast closing" : "toast"} role="status">
      {/* The ring draws itself round, fills, and the check strokes in. */}
      <svg aria-hidden="true" className="toast-check" viewBox="0 0 24 24">
        <circle className="toast-check-fill" cx="12" cy="12" r="10" />
        <circle className="toast-check-ring" cx="12" cy="12" pathLength="1" r="10" />
        <path className="toast-check-mark" d="M7.6 12.4l3 3 5.8-6.2" pathLength="1" />
      </svg>
      {message}
    </div>
  )
}
