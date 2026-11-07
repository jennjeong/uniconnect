import { lang } from "../i18n"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { useIntroDone } from "../hooks/useIntroDone"
import { splitLines } from "./Lines"

type Tag = "h1" | "h2" | "h3" | "p" | "span"

// getlayers.ai의 Stride 캐스케이드. 전체 1.4초이며 마지막 조각이 55% 지점에서
// 시작하므로 각 조각은 나머지 45%를 쓴다 (CSS의 easeOutQuart).
const SPREAD = 0.55

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

// 요소가 화면에 들어오면(그리고 인트로 로더가 사라지면) 시작한다.
function useShown() {
  const ref = useRef<HTMLElement>(null)
  const ready = useIntroDone()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!ready || !element || shown) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ready, shown])

  return { ref, shown }
}

// 전체 캐스케이드에 대한 비율로 나타낸, `total`개 중 i번째 조각이 시작하는
// 지점.
const startOf = (i: number, total: number) => (total > 1 ? (i / (total - 1)) * SPREAD : 0)

// Stride의 제목 등장 효과. 글자가 8px 블러에서 16px 올라오며 제목을 따라 차례로
// 나타난다. 단어 안에서는 줄이 바뀌지 않는다. `lines`를 주면 줄바꿈을 직접
// 정하고, `accent`를 주면 그중 한 줄을 포인트 파랑으로 칠한다. 숫자가 들어간
// 제목은 움직이지 않으며 (Stride의 규칙), 동작 줄이기 설정에서는 모두 멈춘다.
// 스크린 리더는 일반 텍스트를 읽는다.
export function RevealTitle({
  as = "h1",
  className,
  lines,
  children,
  accent,
}: {
  as?: Tag
  className?: string
  lines?: string[]
  children?: string
  // 포인트 파랑으로 칠할 줄의 인덱스.
  accent?: number
}) {
  const { ref, shown } = useShown()
  const Tag = as
  // 제목은 쉬어 가는 곳, 곧 쉼표나 마침표 뒤에서 줄을 바꾼다.
  const rows = lines ?? splitLines(children ?? "")
  const text = rows.join(" ")
  const still = reducedMotion() || /\d/.test(text)
  const classes = ["reveal-title", className, still || shown ? "is-shown" : ""].filter(Boolean).join(" ")

  if (still) {
    return (
      <Tag className={classes}>
        {rows.map((row, index) => (
          <span className={index === accent ? "reveal-line accent" : "reveal-line"} key={index}>
            {row}
          </span>
        ))}
      </Tag>
    )
  }

  const total = text.replace(/\s/g, "").length
  let index = 0
  return (
    <Tag className={classes} ref={ref as never}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {rows.map((row, line) => (
          <span className={line === accent ? "reveal-line accent" : "reveal-line"} key={line}>
            {row.split(" ").map((word, w) => (
              <span key={w}>
                {w > 0 && " "}
                <span className="reveal-word">
                  {[...word].map((letter, l) => (
                    <span className="reveal-letter" key={l} style={{ "--s": startOf(index++, total) } as CSSProperties}>
                      {letter}
                    </span>
                  ))}
                </span>
              </span>
            ))}
          </span>
        ))}
      </span>
    </Tag>
  )
}

// 긴 문장을 위한 단어 단위의 같은 캐스케이드.
export function RevealWords({
  as = "p",
  className,
  children,
}: {
  as?: Tag
  className?: string
  children: string
}) {
  const { ref, shown } = useShown()
  const Tag = as
  const still = reducedMotion()
  const words = children.split(/\s+/).filter(Boolean)
  const classes = ["reveal-title", "reveal-words", className, still || shown ? "is-shown" : ""]
    .filter(Boolean)
    .join(" ")
  if (still) return <Tag className={classes}>{children}</Tag>
  return (
    <Tag className={classes} ref={ref as never}>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <span key={index}>
            {index > 0 && " "}
            <span
              className="reveal-letter"
              style={{ "--s": startOf(index, words.length) } as CSSProperties}
            >
              {word}
            </span>
          </span>
        ))}
      </span>
    </Tag>
  )
}

// Stride의 About 문장. 앞 구절, 둥근 아이콘 칩, 흐린 구절, 두 번째 칩이 하나의
// 캐스케이드로 이어지고, 칩은 나타나면서 30%에서 커진다.
export function RevealStatement({
  lead,
  firstChip,
  muted,
  secondChip,
  className,
  breaks,
}: {
  lead: string
  firstChip: ReactNode
  muted: string
  secondChip: ReactNode
  className?: string
  // 한국어일 때 앞 구절과 흐린 구절을 각각 몇 낱말 뒤에서 한 번 더 줄 바꿀지.
  breaks?: [number, number]
}) {
  const { ref, shown } = useShown()
  const still = reducedMotion()
  const classes = ["reveal-title", "statement", className, still || shown ? "is-shown" : ""]
    .filter(Boolean)
    .join(" ")
  // 쉼표로 끝나는 앞 구절은 거기서 줄을 끝내고 쉼표는 뺀다.
  const lineBreak = /,\s*$/.test(lead)
  const leadText = lineBreak ? lead.replace(/,\s*$/, "") : lead
  const korean = lang === "ko"
  const leadLetters = leadText.replace(/\s/g, "").length
  const total = leadLetters + 1 + muted.replace(/\s/g, "").length + 1
  let index = 0
  const chip = (content: ReactNode, tone: string) => (
    <span className={`statement-chip ${tone}`} style={{ "--s": startOf(index++, total) } as CSSProperties}>
      {content}
    </span>
  )
  // 칩은 구절의 마지막 단어에 얹혀서 따로 한 줄로 넘어가지 않게 한다.
  const run = (text: string, tone: string, content: ReactNode, chipTone: string, breakAt?: number) => {
    const words = text.split(" ")
    return words.map((word, w) => (
      <span key={`${tone}-${w}`}>
        {w > 0 && (w === breakAt ? <br /> : " ")}
        <span className={`reveal-word ${tone}`}>
          {[...word].map((letter, l) => (
            <span className="reveal-letter" key={l} style={{ "--s": startOf(index++, total) } as CSSProperties}>
              {letter}
            </span>
          ))}
          {w === words.length - 1 && (
            <>
              {" "}
              {chip(content, chipTone)}
            </>
          )}
        </span>
      </span>
    ))
  }

  return (
    <h2 className={classes} ref={ref as never}>
      <span className="sr-only">
        {lead} {muted}
      </span>
      <span aria-hidden="true">
        <span className="statement-line">{run(leadText, "lead", firstChip, "blue", korean ? breaks?.[0] : undefined)}</span>
        {lineBreak ? <br /> : " "}
        <span className="statement-line">{run(muted, "muted", secondChip, "silver", korean ? breaks?.[1] : undefined)}</span>
      </span>
    </h2>
  )
}
