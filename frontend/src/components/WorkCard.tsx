import { useState, type ReactNode } from "react"

import { t } from "../i18n"
import { formatDistance, shownTags } from "../lib/distance"
import type { Match } from "../types"
import { BrandMark } from "./BrandMark"
import { DateLine } from "./DateLine"
import { Icon } from "./Icon"
import { SaveHeart } from "./SaveHeart"
import { ScoreRing } from "./ScoreRing"
import { Stars } from "./Stars"

// A brand or student group as one of Stride's silver cards from
// getlayers.ai: what it is at the top with a round badge that opens its
// page, its mark large on a white glow in the middle, then the name and the
// offer with the score ring centered beside them, a group's event date, how
// far it is (when both places are known), its reviews' stars (when it has
// any), tags and the card's actions along the bottom. The card lifts a
// little on hover. Where the page offers 찜, a heart sits beside the badge.
export function WorkCard({
  match,
  meta,
  rank,
  date,
  tags,
  onOpenDetail,
  saved,
  onToggleSave,
  compared,
  onToggleCompare,
  children,
}: {
  match: Match
  // The line at the top left, such as the category.
  meta: ReactNode
  // Ranking on the 인기 tab.
  rank?: number
  // A group's next event, on its own line above the tags.
  date?: string
  // Tags under the offer; the match's own tags when left out.
  tags?: ReactNode
  onOpenDetail: () => void
  // 찜: whether it is saved, and the heart that saves or unsaves it.
  saved?: boolean
  onToggleSave?: () => void
  // 비교: whether it is in the comparison, and the button that puts it in
  // or takes it out (components/CompareTray.tsx).
  compared?: boolean
  onToggleCompare?: () => void
  // Actions at the bottom, such as the proposal button.
  children: ReactNode
}) {
  const [burst, setBurst] = useState(0)
  return (
    <article className="work-card">
      <div className="work-meta">
        <span>
          {rank !== undefined && <b className={rank <= 3 ? "work-rank top" : "work-rank"}>{t("{rank}위", { rank })}</b>}
          {meta}
        </span>
        <span className="work-meta-actions">
          {onToggleSave && (
            <button
              aria-label={t("{name} 찜하기", { name: match.name })}
              aria-pressed={saved === true}
              className="save-toggle"
              onClick={() => {
                if (!saved) setBurst(burst + 1)
                onToggleSave()
              }}
              type="button"
            >
              <SaveHeart burst={burst} saved={saved === true} size={18} />
            </button>
          )}
          {onToggleCompare && (
            <button
              aria-label={t("{name} 비교에 담기", { name: match.name })}
              aria-pressed={compared === true}
              className="compare-toggle"
              onClick={onToggleCompare}
              type="button"
            >
              <Icon name={compared ? "check" : "plus"} size={16} />
              <span aria-hidden="true">{t("비교")}</span>
            </button>
          )}
          <button
            aria-label={t("{name} 상세 정보", { name: match.name })}
            className="work-badge"
            onClick={onOpenDetail}
            type="button"
          >
            <Icon name="arrowUpRight" size={18} />
          </button>
        </span>
      </div>

      <div aria-hidden="true" className="work-mark">
        <BrandMark match={match} large />
      </div>

      <div className="work-bottom">
        <div className="work-title">
          <div className="work-name">
            <h3>
              <button onClick={onOpenDetail} type="button">
                {match.name}
              </button>
            </h3>
            <p>{match.offer}</p>
          </div>
          <ScoreRing score={match.score} />
        </div>
        <div className="work-tags">
          {date && <DateLine date={date} />}
          {match.distanceKm !== undefined && (
            <span className="tag-distance">
              <Icon name="pin" size={13} />
              <span className="sr-only">{t("거리")}</span>
              {formatDistance(match.distanceKm)}
            </span>
          )}
          {match.pro && <span className="tag-pro">PARTNERS</span>}
          {match.businessVerified && (
            <span className="tag-verified">
              <Icon name="check" size={12} />
              {t("사업자 확인")}
            </span>
          )}
          {match.reviewCount ? (
            <span className="tag-rating">
              <Stars rating={match.rating ?? 0} size={12} />
              {match.rating?.toFixed(1)}
              <small>{t("후기 {count}", { count: match.reviewCount })}</small>
            </span>
          ) : null}
          {tags ??
            shownTags(match).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
        </div>
        <div className="work-actions">{children}</div>
      </div>
    </article>
  )
}
