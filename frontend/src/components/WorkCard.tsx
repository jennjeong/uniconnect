import { useState, type ReactNode } from "react"

import { t } from "../i18n"
import { formatDistance, shownTags } from "../lib/distance"
import type { Match } from "../types"
import { BrandMark } from "./BrandMark"
import { DateLine } from "./DateLine"
import { Icon } from "./Icon"
import { SaveHeart } from "./SaveHeart"
import { ScoreBadge } from "./ScoreBadge"
import { Stars } from "./Stars"

// getlayers.ai의 Stride 은색 카드 같은 브랜드나 학생단체 카드. 맨 위에는 그것이
// 무엇인지와 페이지를 여는 둥근 배지가 있고, 가운데에는 흰 빛 위에 큰 마크가
// 놓인다. 그 아래에 이름과 제안, 옆에 '추천 지수 90' 배지가 붙는다. 그룹이면
// 행사 날짜, (두 위치를 모두 알면) 거리, (있으면) 리뷰 별점, 태그, 맨 아래의
// 카드 동작이 이어진다. 카드는 마우스를 올리면 살짝 뜬다. 페이지가 찜을
// 제공하면 배지 옆에 하트가 놓인다.
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
  // 왼쪽 위의 줄. 카테고리 같은 것.
  meta: ReactNode
  // 인기 탭의 순위.
  rank?: number
  // 그룹의 다음 행사. 태그 위에 한 줄로 놓는다.
  date?: string
  // 제안 아래의 태그. 지정하지 않으면 매치 자체의 태그를 쓴다.
  tags?: ReactNode
  onOpenDetail: () => void
  // 찜: 저장됐는지와, 저장하거나 해제하는 하트.
  saved?: boolean
  onToggleSave?: () => void
  // 비교: 비교에 담겼는지와, 담거나 빼는 버튼 (components/CompareTray.tsx).
  compared?: boolean
  onToggleCompare?: () => void
  // 아래쪽의 동작. 제안 버튼 같은 것.
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
          <ScoreBadge score={match.score} />
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
          {match.ad && (
            <span className="tag-ad" title={t("상단 광고")}>
              AD
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
