// The intro loader (components/Loader.tsx) plays on a browser's first visit only,
// as it holds the page for 2.5 seconds on every return otherwise.
// Scenes wait for it to leave before their entrance, so it isn't wasted
// behind the panel.

const storageKey = "uniconnect:intro-played"
const eventName = "uniconnect:intro-done"
let done = false

// Whether the loader should play on this load.
export function shouldPlayIntro() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false
  try {
    return localStorage.getItem(storageKey) !== "1"
  } catch {
    return false
  }
}

export function finishIntro() {
  done = true
  try {
    localStorage.setItem(storageKey, "1")
  } catch {
    // Private windows may refuse storage; the loader just plays again next time.
  }
  window.dispatchEvent(new Event(eventName))
}

export function isIntroDone() {
  return done
}

// Calls back once the intro is done (right away if it already is).
export function onIntroDone(callback: () => void) {
  if (done) {
    callback()
    return () => {}
  }
  window.addEventListener(eventName, callback, { once: true })
  return () => window.removeEventListener(eventName, callback)
}
