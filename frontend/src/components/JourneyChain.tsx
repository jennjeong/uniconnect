import { useRef, type CSSProperties } from "react"

import { ChromeScene } from "../scenes/ChromeScene"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import { Pill } from "./Pill"
import { RevealTitle } from "./RevealText"

export type JourneyStep = {
  label: string
  status: string
  detail: string
}

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// Stride's layered pinned reveal from getlayers.ai: a chrome chain turning
// over the deep blue mesh holds the screen, falling into place and spinning
// with the scroll, while the sponsorship's steps scroll up over it on
// white — the step under way in deep blue.
export function JourneyChain({
  intro,
  heading,
  steps,
  current,
  scheduleLabel,
  onOpenSchedule,
}: {
  // The paragraph at the bottom of the chain panel.
  intro: string
  heading: string
  steps: JourneyStep[]
  // Index of the step under way.
  current: number
  scheduleLabel: string
  onOpenSchedule: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  return (
    <div className="chain-wrap" ref={wrapRef}>
      <section className="chain-stage">
        <MeshBackdrop seed={3.7} />
        <ChromeScene anchor={wrapRef} kind="chain" mode="pinned" scrollSpin />
        <div className="chain-overlay">
          <span className="eyebrow light">Sponsorship flow</span>
          <RevealTitle accent={1} as="h2" className="chain-title" lines={["끊기지 않는", "협찬의 고리"]} />
          <div className="chain-bottom">
            <p>{intro}</p>
            <p aria-hidden="true" className="chain-aside">
              함께라서 더 단단하게
            </p>
          </div>
        </div>
      </section>

      <section className="journey">
        <div className="section-head centered">
          <span className="eyebrow" data-reveal>
            Journey
          </span>
          <RevealTitle as="h2" className="section-display">
            {heading}
          </RevealTitle>
          <div data-reveal style={delay(0.15)}>
            <Pill arrow="right" onClick={onOpenSchedule}>
              {scheduleLabel}
            </Pill>
          </div>
        </div>
        <ol className="journey-bento">
          {steps.map((step, index) => (
            <li
              aria-current={index === current ? "step" : undefined}
              className={index === current ? "journey-card current" : index < current ? "journey-card done" : "journey-card"}
              data-reveal
              key={step.label}
              style={delay(index * 0.08)}
            >
              <span className="journey-index">{pad(index + 1)}</span>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
              <small>{step.status}</small>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
