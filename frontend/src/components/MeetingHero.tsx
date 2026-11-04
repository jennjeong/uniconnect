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

// 대시보드와 소개 페이지의 첫 화면. getlayers.ai의 Stride 히어로(화면을 가득
// 채운 장면 위에 카피를 얹고, 스크롤하면 둥근 카드로 줄어든다)를 getlayers.ai의
// Antipode 그라디언트 위에 올린 것이다. 짙은 파랑 덩어리와 은색 덩어리가 서로
// 기대어 있고 맞닿은 곳이 가장 밝다.
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
  // 헤드라인의 줄들. 어두운 쪽에 머물 만큼 짧게 하고, 둘째 줄은 포인트 파랑으로
  // 쓴다.
  lines: string[]
  // 헤드라인 아래의 수치들. 소개 페이지에서는 카피 한 줄.
  stats?: HeroStat[]
  lead?: string
  insight: string
  detail: string
  primary: { label: string; onClick: () => void }
  // 페이지에 있다면 주요 동작 옆에 두는 텍스트 링크.
  secondary?: { label: string; onClick: () => void }
  // 앱 다운로드. 브라우저에서 연 사이트를 위한 것이다 (앱 안에서는 없다).
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
