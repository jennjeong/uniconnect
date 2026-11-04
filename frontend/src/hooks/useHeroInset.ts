import { useEffect, type RefObject } from "react"

// getlayers.ai의 Stride 히어로. 페이지를 스크롤해 지나가면 화면을 가득 채운
// 히어로가 둥근 카드로 줄어들고 (각 가장자리에서 24px, 모서리 24px) 화면 0.6개
// 길이에 걸쳐 카피가 조금 물러난다. 매 프레임 스크롤이 가리키는 값으로 완만하게
// 따라간다. 동작 줄이기 설정에서는 멈춰 있다.
export function useHeroInset(
  section: RefObject<HTMLElement | null>,
  clip: RefObject<HTMLElement | null>,
  overlay: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let p = 0
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const element = section.current
      if (!element) return
      const top = element.getBoundingClientRect().top
      if (top > window.innerHeight) return
      const target = Math.min(1, Math.max(0, -top / (window.innerHeight * 0.6)))
      if (Math.abs(target - p) < 0.0005) return
      p += (target - p) * 0.18
      if (clip.current) clip.current.style.clipPath = `inset(${p * 24}px round ${p * 24}px)`
      if (overlay.current) overlay.current.style.transform = `scale(${1 - p * 0.1})`
    })
    return () => cancelAnimationFrame(frame)
  }, [section, clip, overlay])
}
