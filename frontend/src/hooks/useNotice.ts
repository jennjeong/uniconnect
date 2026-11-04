import { useCallback, useEffect, useRef, useState } from "react"

export const noticeDuration = 2400

// 저절로 사라지는 짧은 토스트 메시지. 새 메시지는 타이머를 다시 시작한다.
// 누르고 있거나 마우스를 올리면 타이머가 멈추고 (pauseNotice), 옆으로 밀면 바로
// 숨겨진다 (hideNotice). 메시지마다 고유한 id가 있어서 시간 막대가 처음부터
// 다시 시작한다.
export function useNotice() {
  const [notice, setNotice] = useState("")
  const [noticeId, setNoticeId] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  // 보이는 메시지가 숨겨질 때와, 멈췄을 때 남아 있던 시간.
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
