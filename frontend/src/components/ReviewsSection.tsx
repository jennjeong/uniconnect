import { useEffect, useState } from "react"

import { api } from "../api"
import { reviewTags } from "../data/reviews"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { Review, ReviewSummary, Role } from "../types"
import { Icon } from "./Icon"
import { ProfileBars, ProfileFigures } from "./ProfileStats"
import { ReviewCard } from "./ReviewCard"
import { Stars } from "./Stars"

// The tag that says a partner would sponsor together again, shown as its
// own figure rather than one of the bars.
const againTag = "다시 함께하고 싶어요"

// A brand's or group's reviews, the detail page's 파트너 후기 tab: the
// average and how many would sponsor together again on the tinted card,
// how many picked each other tag as bars, the latest review, and the rest
// on request. Partners write them on a sponsorship's agreement after the
// event.
export function ReviewsSection({
  id,
  role,
  onReport,
}: {
  id: string
  role: Role
  // Members can report a review to the operators.
  onReport?: (review: Review) => void
}) {
  const [data, setData] = useState<{ summary: ReviewSummary; reviews: Review[] }>()
  const [all, setAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.reviews(id).then(
      (result) => {
        if (!cancelled) setData(result)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [id])

  if (!data) return null
  const { summary, reviews } = data
  if (summary.count === 0) {
    return (
      <div className="profile-panel">
        <p className="profile-empty">
          <Icon name="chat" size={22} />
          {t("아직 후기가 없어요. 협찬을 마친 학생단체와 브랜드가 서로 남겨요.")}
        </p>
      </div>
    )
  }

  const picked = (tag: string) => summary.tags.find((item) => item.tag === tag)?.count ?? 0
  const again = picked(againTag)
  const [latest, ...rest] = reviews
  return (
    <div className="profile-panel">
      <ProfileFigures
        figures={[
          {
            value: summary.average.toFixed(1),
            star: true,
            label: t("전체 평점"),
            note: t("후기 {count}", { count: summary.count }),
          },
          {
            value: `${Math.round((again / summary.count) * 100)}%`,
            label: t("재협찬 의향"),
            note: t("후기 {count}개 중 {picked}개", { count: summary.count, picked: again }),
          },
        ]}
      />
      <ProfileBars
        rows={reviewTags[role]
          .filter((tag) => tag !== againTag)
          .map((tag) => ({ label: t(tag), share: picked(tag) / summary.count }))}
      />

      <h3 className="profile-heading">{t("최근 후기")}</h3>
      <article className="profile-review">
        <span aria-hidden="true" className="profile-review-mark">
          {latest.authorName.slice(0, 1)}
        </span>
        <div>
          <h4>{latest.eventName}</h4>
          <Stars rating={latest.rating} size={14} />
          {latest.comment && <p>“{latest.comment}”</p>}
          <small>
            {latest.authorName} · {formatFullDate(latest.createdAt.slice(0, 10))}
          </small>
          {onReport && (
            <button className="subtle-link" onClick={() => onReport(latest)} type="button">
              {t("후기 신고")}
            </button>
          )}
        </div>
      </article>

      {rest.length > 0 && all && (
        <div className="reviews-list">
          {rest.map((review) => (
            <ReviewCard
              actions={
                onReport && (
                  <button className="subtle-link" onClick={() => onReport(review)} type="button">
                    {t("후기 신고")}
                  </button>
                )
              }
              key={review.key}
              review={review}
            />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <button aria-expanded={all} className="profile-more" onClick={() => setAll(!all)} type="button">
          {all ? t("후기 접기") : t("후기 모두 보기 ({count})", { count: summary.count })}
        </button>
      )}
    </div>
  )
}
