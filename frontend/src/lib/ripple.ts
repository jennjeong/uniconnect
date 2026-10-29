// Buttons that show a soft ripple spreading from where they are pressed.
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

// Listens for presses anywhere on the page; returns a function that stops it.
export function installRipple() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

  const press = (event: PointerEvent) => {
    if (reducedMotion.matches || event.button !== 0) return
    const host = (event.target as Element | null)?.closest<HTMLElement>(rippleTargets)
    if (!host || host.matches(":disabled")) return

    // The ripple sits in a layer clipped to the button's shape, behind its
    // label. React sets these buttons' classes (tabs turn active on press),
    // so the layer needs only inline position and isolation on the button.
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
