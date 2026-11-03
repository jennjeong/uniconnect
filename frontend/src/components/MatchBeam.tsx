import { t } from "../i18n"
import type { Match } from "../types"
import { BrandMark } from "./BrandMark"

type Side = { name: string; mark: Pick<Match, "industry" | "logo"> }

// The two sides of a match joined by a line a beam of light runs along
// (after Magic UI's Animated Beam, drawn in this app's own CSS), the
// match between them: the account browsing on the left, the listing on the
// right.
export function MatchBeam({ from, to, score }: { from: Side; to: Side; score: number }) {
  return (
    <figure aria-label={t("{from}와 {to}의 일치율 {score}%", { from: from.name, to: to.name, score })} className="match-beam">
      <span aria-hidden="true" className="match-beam-side">
        <BrandMark match={from.mark} />
        <small>{from.name}</small>
      </span>
      <span aria-hidden="true" className="match-beam-line" />
      <strong aria-hidden="true" className="match-beam-score">
        {score}
        <em>%</em>
      </strong>
      <span aria-hidden="true" className="match-beam-side">
        <BrandMark match={to.mark} />
        <small>{to.name}</small>
      </span>
    </figure>
  )
}
