// Whether to leave out the WebGL scenes and keep their CSS backgrounds:
// for visitors who asked to save data, or on a slow connection, where the
// 3D library (about 180KB) and the drawing cost more than they give.
export function liteScenes() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  if (connection?.saveData) return true
  if (connection?.effectiveType && ["slow-2g", "2g", "3g"].includes(connection.effectiveType)) return true
  return window.matchMedia?.("(prefers-reduced-data: reduce)").matches ?? false
}

// Runs `task` once the browser is idle after the page's first work (or after
// a moment where idle callbacks are missing), so it never holds up the first
// view. Returns a function that cancels it.
export function whenIdle(task: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: 4000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = setTimeout(task, 1500)
  return () => clearTimeout(handle)
}

// Calls `load` once the element comes within a screen's height of view, so a
// scene further down the page downloads only when someone scrolls toward it.
export function whenNearView(element: Element, load: () => void) {
  if (!("IntersectionObserver" in window)) {
    load()
    return () => {}
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      load()
    },
    { rootMargin: "100% 0px" },
  )
  observer.observe(element)
  return () => observer.disconnect()
}
