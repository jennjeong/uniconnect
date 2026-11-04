import { useEffect, useRef, type RefObject } from "react"

import { liteScenes, whenIdle, whenNearView } from "../lib/lite"
import type { ChromeKind } from "./chromeModels"

// three.js와 모델은 페이지의 모든 장면이 함께 쓰도록 한 번만 가져온다.
let models: Promise<typeof import("./chromeModels")> | undefined
const loadModels = () => (models ??= import("./chromeModels"))

// 모델이 프레임을 통과해 떨어지는 위치 (0은 위, 0.5는 가운데, 1은 아래).
// Stride에서 가져왔다.
// - "pinned": 앵커가 고정(sticky) 섹션과 그 위로 스크롤되는 내용을 감싼다.
// 모델이 떨어져 들어와 고정된 동안 가운데에 머물다가 떠난다.
// - "enter": 앵커가 화면에 들어오면 모델이 가운데로 떨어져 들어오고, 앵커
// 전체가 보이면(또는 화면을 채우면) 자리 잡는다.
function fallOf(mode: "pinned" | "enter", anchor: HTMLElement) {
  const vh = window.innerHeight
  const top = anchor.getBoundingClientRect().top
  if (mode === "enter") {
    const span = Math.max(1, Math.min(vh, anchor.offsetHeight))
    return 0.5 * Math.min(1, Math.max(0, (vh - top) / span))
  }
  const pinDistance = Math.max(1, anchor.offsetHeight - vh)
  return top > 0 ? 0.5 * (1 - Math.min(top / vh, 1)) : 0.5 + 0.5 * Math.min(-top / pinDistance, 1)
}

// 부모를 가득 채우는 Stride 크롬 모델 (scenes/chromeModels.ts). three.js는 첫
// 화면을 본 뒤 페이지가 한가해지면 내려받으므로, 누군가 장면까지 스크롤할
// 때쯤엔 준비되어 있다 (근처에 왔을 때만 가져오면 너무 늦어서 체인과 반지를
// 보여 주기 전에 지나쳐 버렸다). 장면 자체는 근처에 오면 시작한다. 라이트
// 모드(lib/lite.ts)에서는 둘 다 하지 않는다. WebGL이 없으면 부모가 혼자 보인다.
export function ChromeScene({
  kind,
  mode,
  anchor,
  scrollSpin = false,
  spinDirection = 1,
}: {
  kind: ChromeKind
  mode: "pinned" | "enter"
  anchor: RefObject<HTMLElement | null>
  scrollSpin?: boolean
  spinDirection?: 1 | -1
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    let fall = 0
    // Stride가 저역 통과 필터를 거는 것처럼 매 프레임 목표 쪽으로 완만하게
    // 따라간다.
    const progress = () => {
      const element = anchor.current
      if (!element) return fall
      fall += (fallOf(mode, element) - fall) * 0.12
      return fall
    }
    const container = containerRef.current
    if (!container || liteScenes()) return
    const stopPrefetch = whenIdle(() => void loadModels().catch(() => {}))
    const stopWatching = whenNearView(container, () => {
      loadModels()
        .then(({ createChrome }) => {
          const canvas = canvasRef.current
          if (cancelled || !canvas) return
          try {
            dispose = createChrome(container, canvas, { kind, progress, scrollSpin, spinDirection })
          } catch {
            // WebGL이 없으면 패널은 그대로 둔다.
          }
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
      stopPrefetch()
      stopWatching()
      dispose?.()
    }
  }, [kind, mode, anchor, scrollSpin, spinDirection])

  return (
    <div aria-hidden="true" className="chrome-scene" ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  )
}
