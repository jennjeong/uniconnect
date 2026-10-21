import { useEffect, useRef, useState, type CSSProperties } from "react"

import wordmark from "../assets/brand/uniconnect_wordmark.svg"
import { finishIntro, shouldPlayIntro } from "../lib/intro"

// When the circle starts opening, when the page is let go (its own
// entrance starts while the circle grows), and when the screen is gone, in
// ms. The drawing before it is timed in index.css ("Start screen").
const OPEN_AT = 1650
const RELEASE_AT = 1800
const DONE_AT = 2500

// The start screen, the logo's mark drawn as a link: the school (student
// groups) and the shop (brands) appear, each reaches down its half of the
// U, and the halves click together at the bottom with a pulse; the name
// slides in beside them; then a circle ringed in deep blue opens from the
// point where they met and the page shows through it. It plays once per
// browser session and never with reduced motion; the page holds still
// under it, and the header and hero wait for it (intro-playing in
// index.css).
export function Loader() {
  const [play] = useState(shouldPlayIntro)
  const [stage, setStage] = useState<"drawing" | "opening" | "gone">(play ? "drawing" : "gone")
  const [origin, setOrigin] = useState<CSSProperties>({})
  const meetRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    if (!play) {
      finishIntro()
      return
    }
    const root = document.documentElement
    root.classList.add("scroll-locked", "intro-playing")
    const release = () => root.classList.remove("scroll-locked", "intro-playing")
    const timers = [
      window.setTimeout(() => {
        const box = meetRef.current?.getBoundingClientRect()
        if (box) {
          setOrigin({ "--x": `${box.left + box.width / 2}px`, "--y": `${box.top + box.height / 2}px` } as CSSProperties)
        }
        setStage("opening")
      }, OPEN_AT),
      window.setTimeout(() => {
        release()
        finishIntro()
      }, RELEASE_AT),
      window.setTimeout(() => setStage("gone"), DONE_AT),
    ]
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      release()
    }
  }, [play])

  if (stage === "gone") return null
  return (
    <div aria-hidden="true" className={stage === "opening" ? "page-loader opening" : "page-loader"} style={origin}>
      <svg className="intro-logo" viewBox="0 0 273.4 64">
        <defs>
          <linearGradient id="intro-silver" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#a9b4c8" />
            <stop offset="1" stopColor="#6d7b97" />
          </linearGradient>
        </defs>
        <g className="intro-mark">
          <g className="intro-school">
            <path d="M7 19.5 L18.6 11 L30.2 19.5 Z" />
            <rect height="6.6" rx=".6" width="3.6" x="10.1" y="21" />
            <rect height="6.6" rx=".6" width="3.6" x="16.8" y="21" />
            <rect height="6.6" rx=".6" width="3.6" x="23.5" y="21" />
            <rect height="2.8" rx="1" width="21.2" x="8" y="28.4" />
          </g>
          <g className="intro-shop">
            <rect fill="url(#intro-silver)" height="20.7" rx="2.6" width="19" x="36" y="10.5" />
            <g fill="#fff">
              <rect height="4" rx=".6" width="4" x="40" y="15" />
              <rect height="4" rx=".6" width="4" x="47" y="15" />
              <rect height="4" rx=".6" width="4" x="40" y="22" />
              <rect height="4" rx=".6" width="4" x="47" y="22" />
            </g>
          </g>
          <path className="intro-arc school" d="M18.6 35.5 V40 A13.4 13.4 0 0 0 32 53.4" pathLength={1} />
          <path
            className="intro-arc shop"
            d="M45.5 35.5 V40 A13.5 13.4 0 0 1 32 53.4"
            pathLength={1}
            stroke="url(#intro-silver)"
          />
          <circle className="intro-pulse" cx="32" cy="53.4" r="5" ref={meetRef} />
          <circle className="intro-pulse late" cx="32" cy="53.4" r="5" />
        </g>
        <image className="intro-name" height="64" href={wordmark} width="273.4" />
      </svg>
      <span className="intro-ring" />
    </div>
  )
}
