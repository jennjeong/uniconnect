import { useState } from "react"

import type { Industry, Match } from "../types"
import { Icon, type IconName } from "./Icon"

// Graphic shown in place of a logo, picked by industry.
const industryMarks: Record<
  Industry,
  { icon: IconName; background: string; color: string }
> = {
  cafe: { icon: "coffee", background: "#ffe3b5", color: "#a8661c" },
  photo: { icon: "camera", background: "#dfeaff", color: "#3f6fc4" },
  wellness: { icon: "leaf", background: "#dcf5e3", color: "#33905a" },
  performance: { icon: "music", background: "#ffe3ee", color: "#c24a77" },
  content: { icon: "play", background: "#ebe6ff", color: "#6650c4" },
  sports: { icon: "trophy", background: "#d9f3f4", color: "#1f8a91" },
}

export function BrandMark({ match, large = false }: { match: Match; large?: boolean }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const className = large ? "match-logo large" : "match-logo"

  if (match.logo && !logoFailed) {
    return (
      <div className={`${className} has-logo`}>
        <img alt="" src={match.logo} onError={() => setLogoFailed(true)} />
      </div>
    )
  }

  const mark = industryMarks[match.industry]
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ backgroundColor: mark.background, color: mark.color }}
    >
      <Icon name={mark.icon} size={large ? 28 : 22} />
    </div>
  )
}
