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

// getlayers.ai의 Stride가 쓰는 겹친 고정 연출. 짙은 파랑 메시 위에서 크롬
// 체인이 돌며 화면을 붙잡고, 스크롤에 맞춰 제자리로 떨어지며 회전한다. 그 위로
// 협찬의 단계들이 흰 바탕으로 올라오고, 진행 중인 단계는 짙은 파랑으로 보인다.
export function JourneyChain({
  intro,
  heading,
  steps,
  current,
  scheduleLabel,
  onOpenSchedule,
  tour = false,
}: {
  // 체인 패널 맨 아래의 문단.
  intro: string
  heading: string
  steps: JourneyStep[]
  // 진행 중인 단계의 인덱스.
  current: number
  scheduleLabel: string
  onOpenSchedule: () => void
  // 방문자용 예시 대시보드. 누른 단계를 따라 빛과 선이 움직여 흐름을 보여 준다.
  tour?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  return (
    <div className="chain-wrap" ref={wrapRef}>
      <section className="chain-stage">
        <MeshBackdrop seed={3.7} />
        <ChromeScene anchor={wrapRef} kind="chain" mode="pinned" scrollSpin />
        <div className="chain-overlay">
          <span className="eyebrow light" data-reveal="rise">
            Sponsorship Flow
          </span>
          <RevealTitle accent={1} as="h2" className="chain-title" lines={[t("끊기지 않는"), t("협찬의 고리")]} />
          <div className="chain-bottom" data-reveal="rise" style={{ "--reveal-delay": "0.25s" } as CSSProperties}>
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

// 단계를 스테퍼로 보여 준다. 번호가 붙은 점이 한 줄로 늘어서고, 진행 중인
// 단계까지 짙은 파랑으로 채워진다. 그 단계의 점은 돌아가는
// 그라디언트(getlayers의 Interference 파랑)로 빛나고, 선을 따라 빛이 달린다.
// 점을 누르면 그 단계의 세부 내용이 아래에 나타나며, 처음에는 현재 단계가
// 보인다. 예시 대시보드(`tour`)에서는 대신 누른 점을 따라 빛과 선이 움직인다.
// 선은 마지막으로 고른 점에서 새로 고른 점까지 로딩 바처럼 이어지고, 선이 닿은
// 점은 짙은 파랑이 되며 (선이 멀어지면 다시 은색이 된다).
function Stepper({ steps, current, tour }: { steps: JourneyStep[]; current: number; tour: boolean }) {
  // 세부 내용을 보여 줄 단계. 점을 누르기 전까지는 현재 단계다 (계정 데이터가
  // 도착하면 현재 단계가 바뀔 수 있다).
  const [picked, setPicked] = useState<number | null>(null)
  // 한 선택에서 다음 선택으로의 마지막 이동. `run`의 홀짝에 따라 애니메이션
  // 이름이 바뀌도록 번호를 매겨, 이동할 때마다 애니메이션이 다시 재생된다.
  const [move, setMove] = useState<{ from: number; run: number } | null>(null)
  const last = steps.length - 1
  const open = Math.min(picked ?? current, last)
  // 빛과 선이 닿을 단계.
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

  // 움직이는 선이 지나가는 점. 선이 닿는 시점을 전체 길이에 대한 비율로
  // 나타낸다.
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
