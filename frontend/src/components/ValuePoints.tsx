import type { CSSProperties } from "react"

import { t } from "../i18n"
import { Icon, type IconName } from "./Icon"
import { RevealTitle } from "./RevealText"

export type ValuePoint = {
  icon: IconName
  // The need it answers, short.
  need: string
  title: string
  // How uniconnect does it, in a sentence.
  text: string
  // The account's own figure for it, live.
  figure: string
  figureLabel: string
  action: string
  onClick: () => void
}

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// What uniconnect does for this side, as three needs it answers: each
// with how, the account's own figure for it and the way into the feature.
// The dashboards' second block, after the hero: what the service is about
// and where the account stands in each part of it.
export function ValuePoints({ eyebrow, heading, points }: { eyebrow: string; heading: string; points: ValuePoint[] }) {
  return (
    <section aria-label={heading} className="value-points">
      <div className="section-head centered">
        <span className="eyebrow" data-reveal>
          {eyebrow}
        </span>
        <RevealTitle as="h2" className="section-display">
          {heading}
        </RevealTitle>
      </div>
      <ol className="value-point-list">
        {points.map((point, index) => (
          <li className={index === 0 ? "value-point lead" : "value-point"} data-reveal key={point.title} style={delay(index * 0.1)}>
            <span className="value-point-need">
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {point.need}
            </span>
            <span aria-hidden="true" className="value-point-icon">
              <Icon name={point.icon} size={22} />
            </span>
            <h3>{point.title}</h3>
            <p>{point.text}</p>
            <div className="value-point-figure">
              <strong>{point.figure}</strong>
              <small>{point.figureLabel}</small>
            </div>
            <button className="value-point-action" onClick={point.onClick} type="button">
              {point.action}
              <Icon name="arrowUpRight" size={15} />
            </button>
          </li>
        ))}
      </ol>
      <p className="value-points-note" data-reveal>
        {t("학생단체는 무료, 브랜드는 성사될 때만 수수료를 내요.")}
      </p>
    </section>
  )
}
