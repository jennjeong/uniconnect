import { useEffect } from "react"

// Runs when the browser brings this page back as it left it, after going
// back from another site (the back/forward cache): nothing reloads, so state
// set on the way out, such as a popup waiting on the redirect, must be undone.
export function usePageReturn(onReturn: () => void) {
  useEffect(() => {
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted) onReturn()
    }
    window.addEventListener("pageshow", returned)
    return () => window.removeEventListener("pageshow", returned)
  }, [onReturn])
}
