import type { ReactNode } from "react"

import type { Match } from "../types"
import { BrandMark } from "./BrandMark"
import { Icon } from "./Icon"
import { ScoreRing } from "./ScoreRing"

// A brand or student group as one of Stride's silver cards from
// getlayers.ai: what it is at the top with a round badge that opens its
// page, its mark large on a white glow in the middle, then the name, the
// offer, tags and the card's actions along the bottom. The card lifts a
// little on hover.
export function WorkCard({
  match,
  meta,
  rank,
  tags,
  onOpenDetail,
  children,
}: {
  match: Match
  // The line at the top left, such as the category or school.
  meta: ReactNode
  // Ranking on the 인기 tab.
  rank?: number
  // Tags under the offer; the match's own tags when left out.
  tags?: ReactNode
  onOpenDetail: () => void
  // Actions at the bottom, such as the proposal button.
  children: ReactNode
}) {
  return (
    <article className="work-card">
      <div className="work-meta">
        <span>
          {rank !== undefined && <b className={rank <= 3 ? "work-rank top" : "work-rank"}>#{rank}</b>}
          {meta}
        </span>
        <button
          aria-label={`${match.name} 상세 정보`}
          className="work-badge"
          onClick={onOpenDetail}
          type="button"
        >
          <Icon name="arrowUpRight" size={18} />
        </button>
      </div>

      <div aria-hidden="true" className="work-mark">
        <BrandMark match={match} large />
      </div>

      <div className="work-bottom">
        <div className="work-title">
          <h3>
            <button onClick={onOpenDetail} type="button">
              {match.name}
            </button>
          </h3>
          <ScoreRing score={match.score} />
        </div>
        <p>{match.offer}</p>
        <div className="work-tags">
          {tags ??
            match.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
        </div>
        <div className="work-actions">{children}</div>
      </div>
    </article>
  )
}
