import { useContext, useRef, useState, type CSSProperties } from "react"

import { noticeDuration } from "../hooks/useNotice"
import { ClosingContext } from "./Presence"

// 토스트를 쓸어 보내려면 얼마나 밀어야 하는지.
const swipeAway = 80

// 동작 뒤에 뜨는 짧은 메시지. Presence 안에서는 숨겨질 때 가라앉는다. 아래쪽
// 막대가 남은 시간을 보여 주며, 누르고 있거나 마우스를 올리면 멈추고 옆으로
// 밀면 바로 사라진다.
export function Toast({
  message,
  id,
  onDismiss,
  onPause,
}: {
  message: string
  // 메시지마다 바뀌어서 시간 막대를 처음부터 다시 시작하게 한다.
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
      {/* 링이 둥글게 그려지고 채워진 뒤 체크 표시가 그어진다. */}
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
