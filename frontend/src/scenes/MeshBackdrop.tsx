import { useEffect, useRef } from "react"

import { meshGradient } from "./meshGradient"

// Stride의 파란 메시를 전기 파랑에서 index.css의 짙은 파랑으로 다시 물들이고,
// 은백색 빛과 (청흑색이 아닌) 남색 덩어리를 더했다.
export const meshColors = { base: "#1d3f99", light: "#e9eef8", deep: "#0c1d4b" }

// 패널 뒤에 놓는 Stride의 메시 그라디언트 (scenes/meshGradient.ts). 패널 크기에
// 맞춰 한 번 그리고 크기가 바뀌면 다시 그린다. WebGL이 없으면 패널 자체의
// 배경이 보인다. `seed`는 덩어리의 배치를 바꾼다.
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
