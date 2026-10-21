import { useEffect, type RefObject } from "react"

// Stride's hero from getlayers.ai: as the page scrolls past it, the
// full-bleed hero insets into a rounded card (24px from each edge, 24px
// corners) over 0.6 of a screen, and its copy recedes a little. Eased
// toward where the scroll says, every frame. Still with reduced motion.
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
