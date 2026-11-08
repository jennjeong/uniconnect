// 화면 이동의 스크롤 정책. App의 go(새 이동)와 popstate(뒤로·앞으로)만 부르고,
// 화면이 그려진 직후 App이 applyPendingScroll을 부른다. 같은 화면 안의 조작(찜,
// 비교, 필터, 탭, 달력, 팝업)은 이곳을 거치지 않으므로 위치가 그대로다.
//
// - 새 화면: 맨 위에서 시작하고, 본문으로 키보드 초점을 옮긴다(스크롤 없이).
// - 뒤로·앞으로: 그 항목에서 떠날 때의 위치로 돌아간다. 지연 로딩이나 데이터로
//   문서가 아직 짧으면, 높이가 자랄 때마다 다시 맞추다가 닿으면 멈춘다. 사용자가
//   먼저 스크롤하거나 누르면 늦은 복원은 그만둔다.
//
// 페이지의 html은 scroll-behavior: smooth라, 그냥 scrollTo를 부르면 애니메이션이
// 되고 그사이 새 화면으로 바뀌면 중간에 끊겨 이전 화면의 아래쪽에 머물렀다. 여기의
// 이동은 모두 즉시 한다.

type Pending = { kind: "top" } | { kind: "restore"; y: number }

let pending: Pending | null = null
let stopRestore: (() => void) | null = null

// 항목(history.state의 index)마다 마지막 스크롤 위치. 떠날 때 저장할 틈이 없는
// 뒤로·앞으로에서도 위치를 알 수 있게 스크롤할 때마다 적어 둔다.
const positions = new Map<number, number>()
let currentIndex = 0

export function trackScroll(index: number) {
  currentIndex = index
  const remember = () => positions.set(currentIndex, window.scrollY)
  window.addEventListener("scroll", remember, { passive: true })
  return () => window.removeEventListener("scroll", remember)
}

// 즉시 이동한다(smooth를 잠시 끈다).
export function jumpTo(y: number) {
  const root = document.documentElement
  const before = root.style.scrollBehavior
  root.style.scrollBehavior = "auto"
  window.scrollTo(0, y)
  root.style.scrollBehavior = before
}

// 새 화면으로 간다: 다음 그림에서 맨 위로.
export function queueTop(index: number) {
  currentIndex = index
  positions.set(index, 0)
  pending = { kind: "top" }
}

// 같은 화면 안의 변화로 새 항목이 생겼다: 위치는 그대로, 그 항목의 위치로 적는다.
export function keepPosition(index: number) {
  currentIndex = index
  positions.set(index, window.scrollY)
}

// 뒤로·앞으로: 그 항목의 마지막 위치(없으면 history.state에 적어 둔 위치)로.
export function queueRestore(index: number, saved?: number) {
  currentIndex = index
  pending = { kind: "restore", y: positions.get(index) ?? saved ?? 0 }
}

const userInput = ["wheel", "touchstart", "pointerdown", "keydown"] as const

export function applyPendingScroll(focusTarget?: HTMLElement | null) {
  const next = pending
  pending = null
  if (!next) return
  stopRestore?.()
  if (next.kind === "top") {
    jumpTo(0)
    focusTarget?.focus({ preventScroll: true })
    return
  }
  const target = next.y
  const reach = () => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    jumpTo(Math.min(target, max))
    return max >= target
  }
  if (reach()) return
  // 아직 짧다: 문서가 자랄 때마다 다시 맞춘다. 닿거나, 사용자가 움직이거나, 더
  // 자라지 않으면(상한) 멈춘다.
  const observer = new ResizeObserver(() => {
    if (reach()) stop()
  })
  const limit = window.setTimeout(() => stop(), 5000)
  const stop = () => {
    observer.disconnect()
    window.clearTimeout(limit)
    for (const name of userInput) window.removeEventListener(name, stop)
    if (stopRestore === stop) stopRestore = null
  }
  observer.observe(document.body)
  for (const name of userInput) window.addEventListener(name, stop, { passive: true })
  stopRestore = stop
}
