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
