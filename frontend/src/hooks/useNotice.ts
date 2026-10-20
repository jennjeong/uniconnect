import { useCallback, useEffect, useRef, useState } from "react"

const noticeDuration = 2400

// Short toast message that hides itself; a new message restarts the timer.
export function useNotice() {
  const [notice, setNotice] = useState("")
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const showNotice = useCallback((message: string) => {
    window.clearTimeout(timer.current)
    setNotice(message)
    timer.current = window.setTimeout(() => setNotice(""), noticeDuration)
  }, [])

  return { notice, showNotice }
}
