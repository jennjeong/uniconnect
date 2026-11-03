import { useContext, useRef, useState, type CSSProperties } from "react"

import { noticeDuration } from "../hooks/useNotice"
import { ClosingContext } from "./Presence"

// How far a swipe goes before it sends the toast away.
const swipeAway = 80

// Short message after an action; inside a Presence it sinks away when hidden.
// A bar along its foot shows the time left, which holding or hovering it
// pauses; swiping it sideways sends it off at once.
export function Toast({
  message,
  id,
  onDismiss,
  onPause,
}: {
  message: string
  // Changes with each message, to start its time bar over.
  id: number
  onDismiss: () => void
  onPause: (paused: boolean) => void
}) {
  const closing = useContext(ClosingContext)
  const start = useRef<number | undefined>(undefined)
  const [dx, setDx] = useState(0)
  const [paused, setPaused] = useState(false)
  const pause = (value: boolean) => {
    setPaused(value)
    onPause(value)
  }
  const style = {
    "--swipe": `${dx}px`,
    "--swipe-fade": Math.max(0, 1 - Math.abs(dx) / (swipeAway * 2)),
    "--notice-ms": `${noticeDuration}ms`,
  } as CSSProperties
  return (
    <div
      className={closing ? "toast closing" : "toast"}
      data-dragging={start.current !== undefined}
      data-paused={paused}
      onPointerDown={(event) => {
        start.current = event.clientX
        event.currentTarget.setPointerCapture(event.pointerId)
        pause(true)
      }}
      onPointerEnter={() => pause(true)}
      onPointerLeave={() => start.current === undefined && pause(false)}
      onPointerMove={(event) => start.current !== undefined && setDx(event.clientX - start.current)}
      onPointerUp={() => {
        start.current = undefined
        if (Math.abs(dx) > swipeAway) onDismiss()
        else {
          setDx(0)
          pause(false)
        }
      }}
      onPointerCancel={() => {
        start.current = undefined
        setDx(0)
        pause(false)
      }}
      role="status"
      style={style}
    >
      {/* The ring draws itself round, fills, and the check strokes in. */}
      <svg aria-hidden="true" className="toast-check" viewBox="0 0 24 24">
        <circle className="toast-check-fill" cx="12" cy="12" r="10" />
        <circle className="toast-check-ring" cx="12" cy="12" pathLength="1" r="10" />
        <path className="toast-check-mark" d="M7.6 12.4l3 3 5.8-6.2" pathLength="1" />
      </svg>
      {message}
      <span aria-hidden="true" className="toast-fuse" key={id} />
    </div>
  )
}
