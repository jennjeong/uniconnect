// WebGL 장면을 빼고 CSS 배경을 유지할지 여부: 데이터 절약을 요청했거나 연결이
// 느린 방문자, 3D 라이브러리(약 180KB)와 그리기 비용이 얻는 것보다 큰 경우,
// 그리고 브라우저가 그래픽 처리 장치 없이 WebGL을 그릴 곳이다.
export function liteScenes() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  if (connection?.saveData) return true
  if (connection?.effectiveType && ["slow-2g", "2g", "3g"].includes(connection.effectiveType)) return true
  if (window.matchMedia?.("(prefers-reduced-data: reduce)").matches) return true
  return !hardwareWebGL()
}

// 그래픽 처리 장치가 없거나(PageSpeed의 테스트 머신처럼 드라이버가 막힌 경우)
// 브라우저는 WebGL을 CPU로 그리며, 이때 셰이더가 페이지를 몇 초씩 붙잡는다.
// 이런 곳에서는 failIfMajorPerformanceCaveat로 요청한 컨텍스트를 브라우저가
// 거부하므로, 곧바로 버리는 캔버스에서 한 번 요청해 본다.
let hardware: boolean | undefined

export function hardwareWebGL() {
  if (hardware !== undefined) return hardware
  try {
    const canvas = document.createElement("canvas")
    const gl: WebGLRenderingContext | WebGL2RenderingContext | null =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ??
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true })
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
    hardware = gl !== null
  } catch {
    hardware = false
  }
  return hardware
}

// 페이지의 첫 작업이 끝나 브라우저가 한가해지면 `task`를 실행한다 (idle 콜백이
// 없으면 잠시 뒤). 그래서 첫 화면을 붙잡지 않는다. 이를 취소하는 함수를
// 돌려준다.
export function whenIdle(task: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: 4000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = setTimeout(task, 1500)
  return () => clearTimeout(handle)
}

// 요소가 화면 높이 안으로 들어오면 `load`를 부른다. 페이지 아래쪽 장면은 누군가
// 그쪽으로 스크롤할 때만 내려받는다.
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
