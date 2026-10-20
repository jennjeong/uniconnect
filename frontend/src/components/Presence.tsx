import { createContext, useEffect, useState, type ReactNode } from "react"

// True while a popup plays its closing animation (Modal.tsx reads it).
export const ClosingContext = createContext(false)

// Matches the closing animations in index.css.
const exitMs = 260

// Keeps a popup on screen for its closing animation after `show` turns false,
// however it was closed (close button, backdrop, Escape, or a finished login).
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  // The last children shown, replayed while closing.
  const [kept, setKept] = useState<ReactNode>(show ? children : null)
  if (show && kept !== children) setKept(children)
  const closing = !show && kept !== null

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => setKept(null), exitMs)
    return () => window.clearTimeout(timer)
  }, [closing])

  return (
    <ClosingContext.Provider value={closing}>{show ? children : kept}</ClosingContext.Provider>
  )
}
