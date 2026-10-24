import { useEffect, useState } from "react"

import { api } from "../api"
import { t } from "../i18n"
import type { Review, ReviewSummary } from "../types"
import { RevealTitle } from "./RevealText"
import { ReviewCard } from "./ReviewCard"
import { Stars } from "./Stars"

// A brand's or group's reviews on its detail page: the average and how
// many, the tags picked most as badges, then the latest reviews. Partners
// write them on a sponsorship's agreement after the event.
export function ReviewsSection({ id }: { id: string }) {
  const [data, setData] = useState<{ summary: ReviewSummary; reviews: Review[] }>()

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
  return (
    <section className="service-section reviews-section">
      <span className="eyebrow">{t("협찬 후기")}</span>
      <RevealTitle as="h2" className="section-display">
        {t("함께한 파트너의 후기")}
      </RevealTitle>
      {summary.count === 0 ? (
        <p className="field-hint">{t("아직 후기가 없어요. 협찬을 마친 학생단체와 브랜드가 서로 남겨요.")}</p>
      ) : (
        <>
          <div className="reviews-summary">
            <strong>{summary.average.toFixed(1)}</strong>
            <Stars rating={summary.average} size={20} />
            <span>{t("후기 {count}", { count: summary.count })}</span>
            {summary.tags.length > 0 && (
              <ul aria-label={t("많이 고른 태그")} className="review-badges">
                {summary.tags.map((item) => (
                  <li key={item.tag}>
                    {t(item.tag)} <em>{item.count}</em>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="reviews-list">
            {reviews.map((review) => (
              <ReviewCard key={`${review.authorName}-${review.createdAt}`} review={review} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
