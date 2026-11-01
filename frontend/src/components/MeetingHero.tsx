import { useRef } from "react"

import { useHeroInset } from "../hooks/useHeroInset"
import { LayersGradient } from "../scenes/LayersGradient"
import { ANTIPODE } from "../scenes/shaders"
import { t } from "../i18n"
import { AnimatedNumber } from "./AnimatedNumber"
import { Icon } from "./Icon"
import { Lines } from "./Lines"
import { Pill } from "./Pill"
import { RevealTitle } from "./RevealText"

export type HeroStat = { value: string; label: string }

// A dashboard's opening screen, and the introduction's: Stride's hero from
// getlayers.ai (the copy over a full-bleed scene that insets into a rounded
// card as the page scrolls on) over getlayers.ai's Antipode gradient — a
// deep blue mass and a silver one leaning against each other, brightest
// where they touch.
export function MeetingHero({
  eyebrow,
  lines,
  stats,
  lead,
  insight,
  detail,
  primary,
  secondary,
  onInstall,
}: {
  eyebrow: string
  // The headline's lines, short enough to stay on the dark side; the
  // second is in the point blue.
  lines: string[]
  // The figures under the headline, or, on the introduction, a line of copy.
  stats?: HeroStat[]
  lead?: string
  insight: string
  detail: string
  primary: { label: string; onClick: () => void }
  // A text link beside the main action, when the page has one.
  secondary?: { label: string; onClick: () => void }
  // 앱 다운로드, for the site opened in a browser (none inside the app).
  onInstall?: () => void
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
          <RevealTitle accent={1} className="hero-title" lines={lines} />
          <div className="hero-band">
            {stats ? (
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
            ) : (
              <p className="hero-lead"><Lines text={lead ?? ""} /></p>
            )}
            <div className="hero-insight">
              <p className="insight-title"><Lines text={insight} /></p>
              <p className="insight-detail"><Lines text={detail} /></p>
              <div className="hero-cta">
                <Pill onClick={primary.onClick} variant="white">
                  {primary.label}
                </Pill>
                {secondary && (
                  <button className="underline-link" onClick={secondary.onClick} type="button">
                    {secondary.label}
                  </button>
                )}
                {onInstall && (
                  <Pill className="hero-install" onClick={onInstall} variant="outline-light">
                    <Icon name="download" size={16} />
                    {t("앱 다운로드")}
                  </Pill>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
