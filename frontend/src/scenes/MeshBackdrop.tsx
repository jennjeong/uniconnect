import { useEffect, useRef } from "react"

import { meshGradient } from "./meshGradient"

// Stride's blue mesh, retinted from its electric blue to the deep blue of
// index.css, with a silver-white glow and a navy (not blue-black) mass.
export const meshColors = { base: "#1d3f99", light: "#e9eef8", deep: "#0c1d4b" }

// Stride's mesh gradient behind a panel (scenes/meshGradient.ts): drawn
// once for the panel's size and redrawn when it changes size. Without WebGL
// the panel's own background shows. `seed` rearranges the blobs.
export function MeshBackdrop({ seed = 0, className }: { seed?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let cancelled = false
    let timer = 0
    const draw = () => {
      const box = element.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return
      meshGradient(box.width, box.height, { ...meshColors, seed }).then((url) => {
        if (!cancelled && url) element.style.backgroundImage = `url(${url})`
      })
    }
    draw()
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(draw, 180)
    })
    observer.observe(element)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [seed])

  return <div aria-hidden="true" className={className ? `mesh-backdrop ${className}` : "mesh-backdrop"} ref={ref} />
}
