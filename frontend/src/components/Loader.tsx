import { useEffect, useRef, useState } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { finishIntro, shouldPlayIntro } from "../lib/intro"

// Stride's preloader timing from getlayers.ai: the bar fills for 1.9s, then
// the panel slides away over 0.95s; the page's own entrance starts partway
// through the slide so there is no dead pause.
const LOAD = 1900
const EXIT = 950
const TOTAL = LOAD + EXIT
const A = LOAD / TOTAL
const DONE_AT = A + (1 - A) * 0.6
// The bar is a strip this tall while it fills.
const BAR_PX = 64

const easeOutQuart = (t: number) => 1 - (1 - t) ** 4
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

// Stride's white preloader: the logo in the middle, a percentage that rides
// the edge of a silver-to-deep-blue bar along the bottom, then the bar grows
// to fill the screen as the whole panel slides up. It plays once per
// browser session and never with reduced motion; the page holds still
// under it, and the header and hero wait for it (intro-playing in index.css).
export function Loader() {
  const [play] = useState(shouldPlayIntro)
  const [gone, setGone] = useState(!play)
  const panelRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLDivElement>(null)
  const numberRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!play) {
      finishIntro()
      return
    }
    const root = document.documentElement
    root.classList.add("scroll-locked", "intro-playing")
    const start = performance.now()
    let released = false
    let frame = requestAnimationFrame(function tick(now) {
      const v = clamp01((now - start) / TOTAL)
      const fill = easeOutQuart(clamp01(v / A))
      const exit = easeInOutQuart(clamp01((v - A) / (1 - A)))
      const thin = clamp01(BAR_PX / window.innerHeight)
      if (panelRef.current) panelRef.current.style.transform = `translateY(${-exit * 100}%)`
      if (counterRef.current) counterRef.current.style.left = `${Math.max(fill, 0.16) * 100}%`
      if (numberRef.current) numberRef.current.textContent = `${Math.round(fill * 100)}%`
      if (barRef.current) barRef.current.style.transform = `scaleY(${thin + (1 - thin) * exit})`
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${fill})`
      if (!released && v >= DONE_AT) {
        released = true
        root.classList.remove("scroll-locked", "intro-playing")
        finishIntro()
      }
      if (v < 1) frame = requestAnimationFrame(tick)
      else setGone(true)
    })
    return () => {
      cancelAnimationFrame(frame)
      root.classList.remove("scroll-locked", "intro-playing")
    }
  }, [play])

  if (gone) return null
  return (
    <div aria-hidden="true" className="page-loader" ref={panelRef}>
      <div className="loader-logo">
        <img alt="" height={34} src={logo} width={146} />
      </div>
      <div className="loader-counter" ref={counterRef}>
        <span ref={numberRef}>0%</span>
      </div>
      <div className="loader-bar" ref={barRef}>
        <div className="loader-fill" ref={fillRef} />
      </div>
    </div>
  )
}
