import type { CSSProperties } from "react"

import { t } from "../i18n"
import { Icon, type IconName } from "./Icon"
import { Lines } from "./Lines"
import { RevealTitle } from "./RevealText"

export type ValuePoint = {
  icon: IconName
  // 그것이 해결하는 필요. 짧게 쓴다.
  need: string
  title: string
  // uniconnect가 그것을 해결하는 방법을 한 문장으로.
  text: string
  // 그것에 대한 계정 자신의 수치. 실시간이다.
  figure: string
  figureLabel: string
  action: string
  onClick: () => void
}

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// 이쪽을 위해 uniconnect가 하는 일을 해결하는 필요 세 가지로 보여 준다. 각각
// 방법, 계정 자신의 수치, 기능으로 가는 길을 담는다. 대시보드의 히어로 다음 두
// 번째 블록으로, 서비스가 무엇이고 계정이 각 부분에서 어디에 있는지 보여 준다.
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
            <p><Lines text={point.text} /></p>
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
