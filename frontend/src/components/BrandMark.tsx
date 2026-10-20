import { useState, type CSSProperties } from "react"

import type { Industry, Match } from "../types"
import { IndustryArt } from "./IndustryArt"

// Light tint of each mark's main color, used as its tile background.
const tileTints: Record<Industry, string> = {
  cafe: "#fff1e4",
  photo: "#e9f4ff",
  wellness: "#e8f8ee",
  performance: "#ffedf5",
  content: "#f1eeff",
  sports: "#e6f8f7",
  beauty: "#fff0f0",
  education: "#eef1ff",
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
