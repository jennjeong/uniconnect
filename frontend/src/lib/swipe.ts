import type { HistoryEntry } from "./route"

// Safari가 iPhone과 Mac에서 하듯 화면 사이를 스와이프한다: 손가락
// 하나(트랙패드에서는 둘)를 왼쪽에서 오른쪽으로 밀면 한 화면 뒤로 가고,
// 오른쪽에서 왼쪽으로 밀면 다시 앞으로 간다. 이 앱 자체의 기록 항목을 따라간다.
// 둥근 화살표가 스와이프를 따라 뒤로는 왼쪽에서, 앞으로는 오른쪽에서 들어오고,
// 손을 놓으면 이동할 상태가 되면 진한 파랑으로 채워지며, 다음 화면은 그쪽에서
// 들어온다. 화면 가장자리에서 시작하는 스와이프는 브라우저 자체 제스처에
// 맡기고(홈 화면 앱에는 그것이 없으므로 예외), 팝업이 열려 있을 때와 텍스트
// 상자나 가로로 스크롤되는 곳 위의 스와이프도 맡긴다.

const storageKey = "uniconnect:history-end"

// App이 이 탭에서 마지막으로 푸시한 항목의 인덱스. 앞으로 스와이프가 갈 화면이
// 있는지 알게 한다. App이 항목을 푸시할 때마다 부른다.
export function noteHistoryEnd(index: number) {
  try {
    sessionStorage.setItem(storageKey, String(index))
  } catch {
    // 저장소가 없으면 앞으로 스와이프는 꺼진 채로 둔다.
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

// 팝업은 열려 있는 동안 제스처를 유지하고, 텍스트 상자와 손가락 밑에서 가로로
// 스크롤되는 곳도 그렇다.
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

// 화면을 옮기려면 손가락이나 트랙패드 스크롤이 움직여야 하는 거리.
const touchDistance = 90
const wheelDistance = 220

// 이를 멈추는 함수를 돌려준다.
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

  // 루트의 data-swiped는 다음 화면이 스와이프해 온 쪽에서 들어오게 한다
  // (index.css의 "Motion").\n|지금 보이는 화면이 먼저 미끄러져
  // 나가고(data-swipe-out), 그다음 화면이 들어온다. 모션 줄이기가 켜져 있으면
  // 곧바로 옮긴다.
  let arrived = 0
  let leaving = 0
  const outMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160
  const move = (direction: Direction) => {
    hide()
    window.clearTimeout(arrived)
    window.clearTimeout(leaving)
    root.dataset.swipeOut = direction
    leaving = window.setTimeout(() => {
      delete root.dataset.swipeOut
      root.dataset.swiped = direction
      arrived = window.setTimeout(() => delete root.dataset.swiped, 700)
      if (direction === "back") history.back()
      else history.forward()
    }, outMs)
  }

  // 터치: 손가락 하나로, 대부분 옆으로, 닿자마자 곧 움직일 때 (길게 누르면
  // 텍스트를 선택하는 것이다). 홈 화면 앱에는 자체 가장자리 제스처가 없으므로
  // 거기서는 가장자리도 센다.
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

  // 트랙패드: 두 손가락 가로 스와이프는 wheel 이벤트로 들어오며, 손가락이
  // 오른쪽으로 움직이면 deltaX가 음수다. 제스처(멈출 때까지의 wheel 이벤트들)가
  // 스와이프인지는 첫 이벤트로 정한다. 스와이프의 이벤트는 모두 가로채서
  // 브라우저 자체 스와이프가 두 번 움직이지 않게 하고, 한 번에 한 화면까지만
  // 움직인다. 그 밖의 것(스크롤, Shift나 핀치 줌, 갈 곳이 없는 경우)은
  // 브라우저에 맡긴다.
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
