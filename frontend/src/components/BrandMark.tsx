import { useState, type CSSProperties } from "react"

import type { Industry, Match } from "../types"
import { IndustryArt } from "./IndustryArt"

// Each mark's main color, faint, as its tile background on blue banners and
// silver cards alike.
const tileTints: Record<Industry, string> = {
  cafe: "rgba(255, 155, 82, 0.16)",
  photo: "rgba(90, 174, 255, 0.16)",
  wellness: "rgba(52, 199, 123, 0.16)",
  performance: "rgba(240, 89, 156, 0.16)",
  content: "rgba(155, 135, 255, 0.18)",
  sports: "rgba(63, 207, 200, 0.16)",
  beauty: "rgba(255, 92, 108, 0.16)",
  education: "rgba(95, 116, 255, 0.18)",
}

export function BrandMark({
  match,
  large = false,
}: {
  match: Pick<Match, "industry" | "logo">
  large?: boolean
}) {
  const [logoFailed, setLogoFailed] = useState(false)
  const className = large ? "match-logo large" : "match-logo"

  if (match.logo && !logoFailed) {
    return (
      <div className={`${className} has-logo`}>
        <img alt="" src={match.logo} onError={() => setLogoFailed(true)} />
      </div>
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`${className} industry`}
      style={{ "--tile": tileTints[match.industry] } as CSSProperties}
    >
      <IndustryArt industry={match.industry} />
    </div>
  )
}
