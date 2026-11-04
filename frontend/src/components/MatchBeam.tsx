import { t } from "../i18n"
import type { Match } from "../types"
import { BrandMark } from "./BrandMark"

type Side = { name: string; mark: Pick<Match, "industry" | "logo"> }

// 매치의 양쪽을 빛줄기가 달리는 선으로 잇는다 (Magic UI의 Animated Beam을 본떠
// 이 앱의 CSS로 그렸다). 왼쪽은 둘러보는 계정, 오른쪽은 리스팅이고 그 사이가
// 매치다.
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
