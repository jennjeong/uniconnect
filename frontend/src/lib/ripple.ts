// 누른 곳에서 부드러운 물결이 퍼지는 버튼.
const rippleTargets = [
  ".pill",
  ".primary-button",
  ".detail-button",
  ".proposal-button",
  ".cancel-button",
  ".decline-button",
  ".match-tab",
  ".industry-chip",
  ".header-link",
  ".role-button",
  "button.nav-pill",
  ".calendar-today",
  ".value-point-action",
  ".profile-hero-stats button",
  ".row-button",
  ".kpi-card",
].join(", ")

// 페이지 어디서든 누름을 듣는다. 듣기를 멈추는 함수를 돌려준다.
export function installRipple() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

  const press = (event: PointerEvent) => {
    if (reducedMotion.matches || event.button !== 0) return
    const host = (event.target as Element | null)?.closest<HTMLElement>(rippleTargets)
    if (!host || host.matches(":disabled")) return

    // 물결은 버튼 모양으로 잘린 레이어에 놓이며 라벨 뒤에 있다. React가 이
    // 버튼들의 클래스를 정하므로(탭은 누르면 활성이 된다), 레이어는 버튼에
    // 인라인 position과 isolation만 있으면 된다.
    if (getComputedStyle(host).position === "static") host.style.position = "relative"
    host.style.isolation = "isolate"
    const box = host.getBoundingClientRect()
    const size = Math.hypot(box.width, box.height) * 2
    const layer = document.createElement("span")
    layer.className = "ripple-layer"
    const ripple = document.createElement("span")
    ripple.className = "ripple"
    ripple.style.width = `${size}px`
    ripple.style.height = `${size}px`
    ripple.style.left = `${event.clientX - box.left - size / 2}px`
    ripple.style.top = `${event.clientY - box.top - size / 2}px`
    ripple.addEventListener("animationend", () => layer.remove())
    layer.append(ripple)
    host.append(layer)
  }

  document.addEventListener("pointerdown", press)
  return () => document.removeEventListener("pointerdown", press)
}
