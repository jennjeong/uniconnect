import { useState } from "react"

import type { Match } from "../types"
import { IndustryArt } from "./IndustryArt"

// A partner's logo on white, or without one its industry's mark on a faint
// blue tile.
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
    <div aria-hidden="true" className={`${className} industry`}>
      <IndustryArt industry={match.industry} />
    </div>
  )
}
