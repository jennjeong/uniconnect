import { useEffect, useRef, type RefObject } from "react"

import { liteScenes, whenIdle, whenNearView } from "../lib/lite"
import type { ChromeKind } from "./chromeModels"

// three.js and the models, fetched once for every scene on the page.
let models: Promise<typeof import("./chromeModels")> | undefined
const loadModels = () => (models ??= import("./chromeModels"))

// Where the model is in its fall through the frame (0 above, 0.5 centred,
// 1 below), from Stride:
// - "pinned": the anchor wraps a sticky section and the content scrolling
//   over it; the model drops in, holds the centre while pinned, then leaves.
// - "enter": the model drops in to the centre as the anchor scrolls into
//   view, settling once all of it shows (or it fills the screen).
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

// A Stride chrome model (scenes/chromeModels.ts) filling its parent. three.js
// downloads once the page is idle after its first view, so it is ready by
// the time someone scrolls to a scene (fetched only near view, it came too
// late and the chain and rings were scrolled past before they showed); the
// scene itself starts near view. Neither happens in lite mode (lib/lite.ts).
// Without WebGL the parent shows on its own.
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
    // Eased toward its target every frame, as Stride low-passes it.
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
            // No WebGL: the panel stays as it is.
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
