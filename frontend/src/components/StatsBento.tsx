import type { CSSProperties, ReactNode } from "react"

import { MeshBackdrop } from "../scenes/MeshBackdrop"
import { AnimatedNumber } from "./AnimatedNumber"
import { Icon } from "./Icon"

export type BentoStat = {
  label: string
  value: string
  note: ReactNode
  onClick: () => void
}

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// Stride's stats bento from getlayers.ai: a tall deep blue card with the
// number on a white inset, a tall silver card with a row of marks and a
// line of words, and a column of a blue card over a slate one. Every card
// opens the page behind its number.
export function StatsBento({
  stats,
  marks,
}: {
  stats: [BentoStat, BentoStat, BentoStat, BentoStat]
  // Partner marks stacked on the silver card.
  marks: ReactNode
}) {
  const [lead, second, third, fourth] = stats
  return (
    <section aria-label="숫자로 보는 협찬" className="stats-bento">
      <button className="bento-card bento-blue" data-reveal onClick={lead.onClick} type="button">
        <MeshBackdrop seed={2.4} />
        <span className="bento-brand">UNICONNECT</span>
        <span aria-hidden="true" className="bento-icon">
          <Icon name="chart" size={20} />
        </span>
        <span className="bento-inner">
          <span className="bento-label">{lead.label}</span>
          <strong>
            <AnimatedNumber value={lead.value} />
          </strong>
          <span className="bento-note">{lead.note}</span>
        </span>
      </button>

      <button className="bento-card bento-silver" data-reveal onClick={second.onClick} style={delay(0.08)} type="button">
        <span className="bento-label">{second.label}</span>
        <strong>
          <AnimatedNumber value={second.value} />
        </strong>
        <span className="bento-marks">{marks}</span>
        <span className="bento-quote">{second.note}</span>
      </button>

      <div className="bento-column">
        <button className="bento-card bento-deep" data-reveal onClick={third.onClick} style={delay(0.16)} type="button">
          <span className="bento-label">{third.label}</span>
          <strong>
            <AnimatedNumber value={third.value} />
          </strong>
          <span className="bento-note">{third.note}</span>
        </button>
        <button className="bento-card bento-slate" data-reveal onClick={fourth.onClick} style={delay(0.24)} type="button">
          <span className="bento-label">
            {fourth.label}
            <small>{fourth.note}</small>
          </span>
          <strong>
            <AnimatedNumber value={fourth.value} />
          </strong>
        </button>
      </div>
    </section>
  )
}
