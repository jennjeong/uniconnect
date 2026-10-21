import { useRef } from "react"

import { useHeroInset } from "../hooks/useHeroInset"
import { LayersGradient } from "../scenes/LayersGradient"
import { ANTIPODE } from "../scenes/shaders"
import { AnimatedNumber } from "./AnimatedNumber"
import { Pill } from "./Pill"
import { RevealTitle } from "./RevealText"

export type HeroStat = { value: string; label: string }

// A dashboard's opening screen: Stride's hero from getlayers.ai (the copy
// over a full-bleed scene that insets into a rounded card as the page
// scrolls on) over getlayers.ai's Antipode gradient — a deep blue mass and
// a silver one leaning against each other, brightest where they touch.
export function MeetingHero({
  eyebrow,
  lines,
  stats,
  insight,
  detail,
  primary,
  secondary,
}: {
  eyebrow: string
  // The headline's lines, short enough to stay on the dark side.
  lines: string[]
  stats: HeroStat[]
  insight: string
  detail: string
  primary: { label: string; onClick: () => void }
  secondary: { label: string; onClick: () => void }
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  useHeroInset(sectionRef, clipRef, overlayRef)

  return (
    <section className="meeting-hero" ref={sectionRef}>
      <div className="hero-clip" ref={clipRef}>
        <LayersGradient shader={ANTIPODE} />
        <div className="hero-overlay" ref={overlayRef}>
          <span className="hero-eyebrow">{eyebrow}</span>
          <RevealTitle className="hero-title" lines={lines} ramp />
          <div className="hero-band">
            <ul className="hero-stats">
              {stats.map((stat) => (
                <li key={stat.label}>
                  <strong>
                    <AnimatedNumber value={stat.value} />
                  </strong>
                  <span>{stat.label}</span>
                </li>
              ))}
            </ul>
            <div className="hero-insight">
              <p className="insight-title">{insight}</p>
              <p className="insight-detail">{detail}</p>
              <div className="hero-cta">
                <Pill onClick={primary.onClick} variant="white">
                  {primary.label}
                </Pill>
                <button className="underline-link" onClick={secondary.onClick} type="button">
                  {secondary.label}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
