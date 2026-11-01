import { useId, useRef, useState, type CSSProperties } from "react"

import { t } from "../i18n"
import { ChromeScene } from "../scenes/ChromeScene"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import { Lines } from "./Lines"
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
  tour = false,
}: {
  // The paragraph at the bottom of the chain panel.
  intro: string
  heading: string
  steps: JourneyStep[]
  // Index of the step under way.
  current: number
  scheduleLabel: string
  onOpenSchedule: () => void
  // An example dashboard for visitors: the glow and the line follow the
  // pressed step, to show the flow.
  tour?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  return (
    <div className="chain-wrap" ref={wrapRef}>
      <section className="chain-stage">
        <MeshBackdrop seed={3.7} />
        <ChromeScene anchor={wrapRef} kind="chain" mode="pinned" scrollSpin />
        <div className="chain-overlay">
          <span className="eyebrow light">Sponsorship Flow</span>
          <RevealTitle accent={1} as="h2" className="chain-title" lines={[t("끊기지 않는"), t("협찬의 고리")]} />
          <div className="chain-bottom">
            <p><Lines text={intro} /></p>
            <p aria-hidden="true" className="chain-aside">
              {t("함께라서 더 단단하게")}
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
        <Stepper current={current} steps={steps} tour={tour} />
      </section>
    </div>
  )
}

const phase = (index: number, current: number) =>
  index < current ? "done" : index === current ? "current" : "next"

const phaseLabel = { done: t("지난 단계"), current: t("지금 단계"), next: t("다음 단계") }

// The steps as a stepper: numbered dots on one line, filled in deep blue up
// to the step under way, whose dot glows with a turning gradient (getlayers'
// Interference blues) while a light runs along the line. A press on a dot
// shows that step's details below; the current one shows first. In the
// example dashboards (`tour`) the glow and the line follow the pressed dot
// instead: the line runs on from the last pick to the new one like a
// loading bar, each dot it passes turning deep blue as the line reaches it
// (or back to silver as it pulls away).
function Stepper({ steps, current, tour }: { steps: JourneyStep[]; current: number; tour: boolean }) {
  // The step whose details show: the current one until a dot is pressed
  // (the current step can move once the account's data arrives).
  const [picked, setPicked] = useState<number | null>(null)
  // The last move from one pick to the next, numbered so that the parity of
  // `run` swaps the animations' names and each move plays them again.
  const [move, setMove] = useState<{ from: number; run: number } | null>(null)
  const last = steps.length - 1
  const open = Math.min(picked ?? current, last)
  // The step the glow and the line reach.
  const lit = tour ? open : Math.min(current, last)
  const from = tour && move ? Math.min(move.from, last) : lit
  const span = Math.abs(lit - from)
  const panelId = useId()
  const shown = steps[open] ?? steps[current]
  const style = {
    "--progress": last > 0 ? lit / last : 0,
    "--steps": steps.length,
    "--fill-time": `${span === 0 ? 0 : Math.max(0.35, span * 0.3)}s`,
  } as CSSProperties
  const run = move && span > 0 ? (move.run % 2 ? " run-a" : " run-b") : ""

  // A dot the moving line passes: when it gets there, as a share of the way.
  const passing = (index: number) => {
    if (span === 0) return ""
    if (lit > from && index > from && index <= lit) return " arrive"
    if (lit < from && index > lit && index <= from) return " leave"
    return ""
  }
  const at = (index: number) => (span === 0 ? 0 : Math.abs(index - from) / span)

  return (
    <div className="stepper" data-reveal style={style}>
      <ol aria-label={t("협찬 단계")} className={`stepper-track${run}`}>
        {steps.map((step, index) => {
          const state = phase(index, current)
          const reached = index <= lit ? " reached" : ""
          const glow = index === lit ? " glow" : ""
          return (
            <li
              className={`stepper-step ${state}${reached}${glow}${passing(index)}`}
              key={step.label}
              style={{ "--at": at(index) } as CSSProperties}
            >
              <button
                aria-controls={panelId}
                aria-current={index === current ? "step" : undefined}
                aria-pressed={index === open}
                className={index === open ? "stepper-dot open" : "stepper-dot"}
                onClick={() => {
                  if (index === open) return
                  if (tour) setMove((before) => ({ from: lit, run: (before?.run ?? 0) + 1 }))
                  setPicked(index)
                }}
                type="button"
              >
                <span aria-hidden="true">{state === "done" ? "✓" : index + 1}</span>
                <span className="sr-only">
                  {t("{step}단계 {label}, {phase}", { step: index + 1, label: step.label, phase: phaseLabel[state] })}
                </span>
              </button>
              <strong aria-hidden="true">{step.label}</strong>
              <small aria-hidden="true">{step.status}</small>
            </li>
          )
        })}
      </ol>

      <div
        aria-live="polite"
        className={`stepper-detail ${open === lit ? "current" : phase(open, current)}`}
        id={panelId}
        key={open}
      >
        <span className="stepper-detail-index">
          {pad(open + 1)} · {phaseLabel[phase(open, current)]}
        </span>
        <strong>{shown.label}</strong>
        <p><Lines text={shown.detail} /></p>
        <small>{shown.status}</small>
      </div>
    </div>
  )
}
