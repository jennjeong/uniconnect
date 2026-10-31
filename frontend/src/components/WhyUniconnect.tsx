import type { CSSProperties } from "react"

import { useSiteState } from "../hooks/useSiteState"
import { locale, t } from "../i18n"
import { Icon, type IconName } from "./Icon"
import { RevealTitle } from "./RevealText"

export type Pillar = {
  icon: IconName
  title: string
  // How it works, in a sentence.
  text: string
  // What it ends in, short (shown as a chip).
  proof: string
}

// Members on both sides from which the counts are worth showing; fewer
// would say the service is empty rather than that it is used.
export const countsShownFrom = 10

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// What sets uniconnect apart, for the side looking: how a sponsorship went
// before and how it goes here, side by side, then the four things only it
// does, then how many members are on it (GET /api/site, members only, once
// there are enough to say so).
export function WhyUniconnect({
  heading,
  before,
  after,
  pillars,
}: {
  heading: string
  before: string[]
  after: string[]
  pillars: Pillar[]
}) {
  const counts = useSiteState()?.counts
  const shown = counts && counts.groups + counts.brands >= countsShownFrom
  return (
    <section aria-label={heading} className="why-section">
      <div className="section-head centered">
        <span className="eyebrow" data-reveal>
          Why uniconnect
        </span>
        <RevealTitle as="h2" className="section-display">
          {heading}
        </RevealTitle>
      </div>

      <div className="why-compare">
        <div className="why-before" data-reveal>
          <span className="why-label">{t("지금까지는")}</span>
          <h3>{t("이렇게 해 왔어요")}</h3>
          <ul>
            {before.map((line) => (
              <li key={line}>
                <span aria-hidden="true" className="why-mark">
                  <Icon name="close" size={12} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <span aria-hidden="true" className="why-arrow">
          <Icon name="arrow" size={18} />
        </span>
        <div className="why-after" data-reveal style={delay(0.12)}>
          <span className="why-label">{t("uniconnect에서는")}</span>
          <h3>{t("이렇게 바뀌어요")}</h3>
          <ul>
            {after.map((line) => (
              <li key={line}>
                <span aria-hidden="true" className="why-mark">
                  <Icon name="check" size={12} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="why-only">
        <h3 data-reveal>{t("uniconnect에만 있는 것")}</h3>
        <ol className="why-pillars">
          {pillars.map((pillar, index) => (
            <li data-reveal key={pillar.title} style={delay(index * 0.08)}>
              <span aria-hidden="true" className="why-pillar-icon">
                <Icon name={pillar.icon} size={20} />
              </span>
              <strong>{pillar.title}</strong>
              <p>{pillar.text}</p>
              <span className="why-proof">{pillar.proof}</span>
            </li>
          ))}
        </ol>
      </div>

      {shown && (
        <div className="why-counts" data-reveal>
          <p>{t("이미 학생단체와 브랜드가 함께하고 있어요")}</p>
          <dl>
            <div>
              <dt>{t("학생단체")}</dt>
              <dd>{t("{count}곳", { count: counts.groups.toLocaleString(locale) })}</dd>
            </div>
            <div>
              <dt>{t("대학")}</dt>
              <dd>{t("{count}곳", { count: counts.schools.toLocaleString(locale) })}</dd>
            </div>
            <div>
              <dt>{t("브랜드")}</dt>
              <dd>{t("{count}곳", { count: counts.brands.toLocaleString(locale) })}</dd>
            </div>
            <div>
              <dt>{t("성사된 협찬")}</dt>
              <dd>{t("{count}건", { count: counts.sponsorships.toLocaleString(locale) })}</dd>
            </div>
          </dl>
          <small>{t("가입한 회원만 세요. 예시 계정은 빼요.")}</small>
        </div>
      )}
    </section>
  )
}
