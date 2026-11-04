import { useEffect, useRef, useState, type CSSProperties } from "react"

import wordmark from "../assets/brand/uniconnect_wordmark.svg"
import { finishIntro, shouldPlayIntro } from "../lib/intro"

// 원이 열리기 시작하는 때, 페이지를 풀어 주는 때(원이 커지는 동안 페이지 자체의
// 등장이 시작된다), 화면이 사라지는 때. 단위는 ms다. 그 앞의 그림은
// index.css("Start screen")에서 시간을 정한다.
const OPEN_AT = 1650
const RELEASE_AT = 1800
const DONE_AT = 2500

// 시작 화면. 로고의 마크를 링크처럼 그려 낸다. 학교(학생단체)와 가게(브랜드)가
// 나타나 각자 U의 반쪽을 따라 내려오고, 두 반쪽이 아래에서 맞물리며 한 번
// 고동친다. 이름이 옆에서 미끄러져 들어온 뒤, 짙은 파랑 테두리의 원이 둘이 만난
// 지점에서 열리며 그 사이로 페이지가 보인다. 브라우저의 첫 방문에만 재생하고
// 동작 줄이기 설정에서는 재생하지 않는다. 그동안 페이지는 멈춰 있고, 헤더와
// 히어로도 기다린다 (index.css의 intro-playing).
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
