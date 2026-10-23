import { useId, useRef, useState, type CSSProperties } from "react"

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
        <Stepper current={current} steps={steps} />
      </section>
    </div>
  )
}

const phase = (index: number, current: number) =>
  index < current ? "done" : index === current ? "current" : "next"

const phaseLabel = { done: "지난 단계", current: "지금 단계", next: "다음 단계" }

// The steps as a stepper: numbered dots on one line, filled in deep blue up
// to the step under way, whose dot glows with a turning gradient (getlayers'
// Interference blues) while a light runs along the line toward it. A press
// on a dot shows that step's details below; the current one shows first.
function Stepper({ steps, current }: { steps: JourneyStep[]; current: number }) {
  // The step whose details show: the current one until a dot is pressed
  // (the current step can move once the account's data arrives).
  const [picked, setPicked] = useState<number | null>(null)
  const open = picked ?? current
  const panelId = useId()
  const shown = steps[open] ?? steps[current]
  const progress = steps.length > 1 ? Math.min(current, steps.length - 1) / (steps.length - 1) : 0

  return (
    <div className="stepper" data-reveal style={{ "--progress": progress, "--steps": steps.length } as CSSProperties}>
      <ol aria-label="협찬 단계" className="stepper-track">
        {steps.map((step, index) => {
          const state = phase(index, current)
          return (
            <li className={`stepper-step ${state}`} key={step.label}>
              <button
                aria-controls={panelId}
                aria-current={index === current ? "step" : undefined}
                aria-pressed={index === open}
                className={index === open ? "stepper-dot open" : "stepper-dot"}
                onClick={() => setPicked(index)}
                type="button"
              >
                <span aria-hidden="true">{state === "done" ? "✓" : index + 1}</span>
                <span className="sr-only">
                  {index + 1}단계 {step.label}, {phaseLabel[state]}
                </span>
              </button>
              <strong aria-hidden="true">{step.label}</strong>
              <small aria-hidden="true">{step.status}</small>
            </li>
          )
        })}
      </ol>

      <div aria-live="polite" className={`stepper-detail ${phase(open, current)}`} id={panelId} key={open}>
        <span className="stepper-detail-index">
          {pad(open + 1)} · {phaseLabel[phase(open, current)]}
        </span>
        <strong>{shown.label}</strong>
        <p>{shown.detail}</p>
        <small>{shown.status}</small>
      </div>
    </div>
  )
}
