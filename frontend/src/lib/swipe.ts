import type { HistoryEntry } from "./route"

// Swiping between screens, as Safari does on iPhone and Mac: a finger (or
// two on a trackpad) moving from left to right goes back a screen, and from
// right to left forward again, through this app's own history entries. A
// round arrow follows the swipe in from the left for back and from the
// right for forward, fills deep blue once letting go will move, and the
// screen that comes arrives from that side. Swipes that start on a screen
// edge are left to the browser's own gesture (except in a home-screen app,
// which has none), and so are swipes while a popup is open and over text
// boxes or anything that scrolls sideways.

const storageKey = "uniconnect:history-end"

// Index of the last entry App pushed in this tab, so a forward swipe knows
// whether there is a screen to go to. App calls it whenever it pushes one.
export function noteHistoryEnd(index: number) {
  try {
    sessionStorage.setItem(storageKey, String(index))
  } catch {
    // Without storage, forward swipes stay off.
  }
}

function historyEnd() {
  try {
    return Number(sessionStorage.getItem(storageKey) ?? 0)
  } catch {
    return 0
  }
}

type Direction = "back" | "forward"

const currentIndex = () => (history.state as HistoryEntry | null)?.index ?? 0
const canGo = (direction: Direction) =>
  direction === "back" ? currentIndex() > 0 : currentIndex() < historyEnd()

// Popups keep the gesture while they are open, and so do text boxes and
// anything that scrolls sideways under the finger.
const popups = ".modal-backdrop, .nav-menu, .notify-panel"
const fields = "input, textarea, select, [contenteditable]"

function scrollsSideways(element: Element) {
  for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = getComputedStyle(node).overflowX
      if (overflow === "auto" || overflow === "scroll") return true
    }
  }
  return false
}

const leftAlone = (target: EventTarget | null) =>
  !(target instanceof Element) ||
  document.querySelector(popups) !== null ||
  target.closest(fields) !== null ||
  scrollsSideways(target)

// How far a finger, or a trackpad's scrolling, travels to move a screen.
const touchDistance = 90
const wheelDistance = 220

// Returns a function that stops it.
export function installSwipeNavigation() {
  const root = document.documentElement
  const hint = document.createElement("div")
  hint.className = "swipe-hint"
  hint.setAttribute("aria-hidden", "true")
  hint.innerHTML =
    '<svg class="icon" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M5 12h14M14 7l5 5-5 5" /></svg>'
  document.body.append(hint)

  const show = (direction: Direction, progress: number) => {
    hint.dataset.direction = direction
    hint.classList.toggle("ready", progress >= 1)
    hint.style.setProperty("--progress", String(Math.min(progress, 1)))
  }
  const hide = () => {
    hint.classList.remove("ready")
    hint.style.setProperty("--progress", "0")
  }

  // data-swiped on the root lets the next screen arrive from the side it was
  // swiped from (index.css, "Motion").
  let arrived = 0
  const move = (direction: Direction) => {
    hide()
    root.dataset.swiped = direction
    window.clearTimeout(arrived)
    arrived = window.setTimeout(() => delete root.dataset.swiped, 700)
    if (direction === "back") history.back()
    else history.forward()
  }

  // Touch: one finger, mostly sideways and moving soon after it lands (a
  // long press is selecting text). A home-screen app has no edge gesture of
  // its own, so there the edges count too.
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const edge = standalone ? 0 : 24
  let touch: { x: number; y: number; at: number; sideways?: boolean } | null = null

  const onTouchStart = (event: TouchEvent) => {
    touch = null
    if (event.touches.length !== 1 || leftAlone(event.target)) return
    const { clientX: x, clientY: y } = event.touches[0]
    if (x < edge || x > window.innerWidth - edge) return
    touch = { x, y, at: event.timeStamp }
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!touch) return
    const dx = event.touches[0].clientX - touch.x
    const dy = event.touches[0].clientY - touch.y
    if (touch.sideways === undefined) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return
      touch.sideways = Math.abs(dx) > Math.abs(dy) * 1.5 && event.timeStamp - touch.at < 500
    }
    const direction: Direction = dx > 0 ? "back" : "forward"
    if (touch.sideways && canGo(direction)) show(direction, Math.abs(dx) / touchDistance)
    else hide()
  }

  const onTouchEnd = (event: TouchEvent) => {
    const start = touch
    touch = null
    if (!start?.sideways) return
    const dx = event.changedTouches[0].clientX - start.x
    const direction: Direction = dx > 0 ? "back" : "forward"
    const flick = event.timeStamp - start.at < 250 && Math.abs(dx) > 50
    if ((Math.abs(dx) >= touchDistance || flick) && canGo(direction)) move(direction)
    else hide()
  }

  const onTouchCancel = () => {
    touch = null
    hide()
  }

  // Trackpads: a two-finger sideways swipe arrives as wheel events, deltaX
  // negative while the fingers move right. A gesture (wheel events until
  // they rest) is settled as a swipe or not by its first event. A swipe's
  // events are all taken, so the browser's own swipe doesn't move a second
  // time, and it moves at most one screen; anything else (scrolling, Shift
  // or pinch zoom, nowhere to go) is left to the browser.
  let gesture: "swipe" | "other" | null = null
  let travelled = 0
  let moved = false
  let rest = 0

  const onWheel = (event: WheelEvent) => {
    window.clearTimeout(rest)
    rest = window.setTimeout(() => {
      gesture = null
      travelled = 0
      moved = false
      hide()
    }, 300)
    if (gesture === null) {
      if (event.deltaX === 0 && event.deltaY === 0) return
      const swipe =
        event.cancelable &&
        !event.ctrlKey &&
        !event.shiftKey &&
        Math.abs(event.deltaX) > Math.abs(event.deltaY) &&
        canGo(event.deltaX < 0 ? "back" : "forward") &&
        !leftAlone(event.target)
      gesture = swipe ? "swipe" : "other"
    }
    if (gesture === "other" || !event.cancelable) return
    event.preventDefault()
    if (moved) return
    travelled += event.deltaX
    const direction: Direction = travelled < 0 ? "back" : "forward"
    const progress = Math.abs(travelled) / wheelDistance
    if (!canGo(direction)) {
      hide()
    } else if (progress >= 1) {
      moved = true
      move(direction)
    } else {
      show(direction, progress)
    }
  }

  window.addEventListener("touchstart", onTouchStart, { passive: true })
  window.addEventListener("touchmove", onTouchMove, { passive: true })
  window.addEventListener("touchend", onTouchEnd, { passive: true })
  window.addEventListener("touchcancel", onTouchCancel, { passive: true })
  window.addEventListener("wheel", onWheel, { passive: false })
  return () => {
    window.removeEventListener("touchstart", onTouchStart)
    window.removeEventListener("touchmove", onTouchMove)
    window.removeEventListener("touchend", onTouchEnd)
    window.removeEventListener("touchcancel", onTouchCancel)
    window.removeEventListener("wheel", onWheel)
    window.clearTimeout(rest)
    window.clearTimeout(arrived)
    delete root.dataset.swiped
    hint.remove()
  }
}
