import { useState } from "react"

import type { Match } from "../types"
import { IndustryArt } from "./IndustryArt"

// 흰 바탕 위의 파트너 로고. 로고가 없으면 옅은 파란 타일 위에 업종 마크를
// 놓는다.
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
