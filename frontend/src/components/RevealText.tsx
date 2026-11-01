import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { useIntroDone } from "../hooks/useIntroDone"
import { splitLines } from "./Lines"

type Tag = "h1" | "h2" | "h3" | "p" | "span"

// Stride's cascade from getlayers.ai: 1.4s in all, the last piece starting
// at 55% of it, so each piece takes the remaining 45% (easeOutQuart in CSS).
const SPREAD = 0.55

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

// Starts once the element scrolls into view (and the intro loader has gone).
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

// Where piece i of `total` starts, as a share of the whole cascade.
const startOf = (i: number, total: number) => (total > 1 ? (i / (total - 1)) * SPREAD : 0)

// Stride's heading reveal: letters rise 16px out of an 8px blur and fade in
// one after another across the heading, words never breaking inside. Give
// `lines` to set the line breaks yourself, and `accent` to color one of
// them in the point blue. Headings with a digit stay still (Stride's rule),
// and so does everything with reduced motion. Screen readers get the plain
// text.
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
  // Index of the line in the point blue.
  accent?: number
}) {
  const { ref, shown } = useShown()
  const Tag = as
  // A heading breaks where it pauses, after a comma or a full stop.
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

// The same cascade word by word, for longer statements.
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

// Stride's About statement: a lead run, a round icon chip, a muted run and a
// second chip, all in one cascade; the chips grow from 30% as they arrive.
export function RevealStatement({
  lead,
  firstChip,
  muted,
  secondChip,
  className,
}: {
  lead: string
  firstChip: ReactNode
  muted: string
  secondChip: ReactNode
  className?: string
}) {
  const { ref, shown } = useShown()
  const still = reducedMotion()
  const classes = ["reveal-title", "statement", className, still || shown ? "is-shown" : ""]
    .filter(Boolean)
    .join(" ")
  // A lead ending in a comma ends its line there, without the comma.
  const breaks = /,\s*$/.test(lead)
  const leadText = breaks ? lead.replace(/,\s*$/, "") : lead
  const leadLetters = leadText.replace(/\s/g, "").length
  const total = leadLetters + 1 + muted.replace(/\s/g, "").length + 1
  let index = 0
  const chip = (content: ReactNode, tone: string) => (
    <span className={`statement-chip ${tone}`} style={{ "--s": startOf(index++, total) } as CSSProperties}>
      {content}
    </span>
  )
  // The chip rides on the run's last word, so it never wraps onto a line
  // of its own.
  const run = (text: string, tone: string, content: ReactNode, chipTone: string) => {
    const words = text.split(" ")
    return words.map((word, w) => (
      <span key={`${tone}-${w}`}>
        {w > 0 && " "}
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
        {run(leadText, "lead", firstChip, "blue")}
        {breaks ? <br /> : " "}
        {run(muted, "muted", secondChip, "silver")}
      </span>
    </h2>
  )
}
