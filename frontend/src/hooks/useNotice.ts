import { useCallback, useEffect, useRef, useState } from "react"

export const noticeDuration = 2400

// Short toast message that hides itself; a new message restarts the timer.
// Holding or hovering it pauses the timer (pauseNotice), and swiping it
// away hides it at once (hideNotice). Each message has its own id, so its
// time bar starts over.
export function useNotice() {
  const [notice, setNotice] = useState("")
  const [noticeId, setNoticeId] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  // When the shown message hides, and how long it had left when paused.
  const deadline = useRef(0)
  const left = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const hideNotice = useCallback(() => {
    window.clearTimeout(timer.current)
    left.current = undefined
    setNotice("")
  }, [])

  const run = useCallback((ms: number) => {
    window.clearTimeout(timer.current)
    deadline.current = Date.now() + ms
    timer.current = window.setTimeout(() => setNotice(""), ms)
  }, [])

  const showNotice = useCallback((message: string) => {
    left.current = undefined
    setNotice(message)
    setNoticeId((id) => id + 1)
    run(noticeDuration)
  }, [run])

  const pauseNotice = useCallback((paused: boolean) => {
    if (paused && left.current === undefined) {
      window.clearTimeout(timer.current)
      left.current = Math.max(0, deadline.current - Date.now())
    } else if (!paused && left.current !== undefined) {
      const ms = left.current
      left.current = undefined
      run(ms)
    }
  }, [run])

  return { notice, noticeId, showNotice, hideNotice, pauseNotice }
}
