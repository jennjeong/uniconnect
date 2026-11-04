// 인트로 로더(components/Loader.tsx)는 브라우저의 첫 방문에만 재생한다. 다시
// 찾은 사람을 매번 2.5초 기다리게 하지 않는다. 장면들은 로더가 사라진 뒤에 등장하도록 기다리므로, 패널 뒤에서 낭비되지
// 않는다.

const storageKey = "uniconnect:intro-played"
const eventName = "uniconnect:intro-done"
let done = false

// 이번 로드에서 로더를 재생해야 하는지 여부.
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
    // 시크릿 창은 저장소를 거부할 수 있다. 그 경우 로더가 다음에 다시 재생될
    // 뿐이다.
  }
  window.dispatchEvent(new Event(eventName))
}

export function isIntroDone() {
  return done
}

// 인트로가 끝나면 콜백을 부른다 (이미 끝났다면 바로).
export function onIntroDone(callback: () => void) {
  if (done) {
    callback()
    return () => {}
  }
  window.addEventListener(eventName, callback, { once: true })
  return () => window.removeEventListener(eventName, callback)
}
