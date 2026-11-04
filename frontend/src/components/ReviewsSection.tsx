import { useEffect, useState } from "react"

import { api } from "../api"
import { reviewTags } from "../data/reviews"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { Review, ReviewSummary, Role } from "../types"
import { Icon } from "./Icon"
import { ProfileBars, ProfileFigures } from "./ProfileStats"
import { ReviewCard, ReviewReply } from "./ReviewCard"
import { Stars } from "./Stars"

// 파트너가 다시 함께 협찬하겠다고 말하는 태그. 막대 중 하나가 아니라 별도의
// 수치로 보여 준다.
const againTag = "다시 함께하고 싶어요"

// 브랜드나 그룹의 리뷰. 상세 페이지의 파트너 후기 탭이다. 색 입힌 카드에 평균과
// 다시 협찬하겠다는 응답 수, 다른 태그를 고른 수를 막대로, 최신 리뷰, 요청하면
// 나머지를 보여 주며, 각각 아래에 리스팅의 답글이 붙는다. 파트너는 행사가 끝난
// 뒤 협찬 협약 페이지에서 리뷰를 쓰고, 리스팅은 거기서 답한다.
export function ReviewsSection({
  id,
  name,
  role,
  onReport,
  onReportReply,
}: {
  id: string
  // 답글에 쓸 리스팅 이름.
  name: string
  role: Role
  // 회원은 리뷰나 그 답글을 운영진에게 신고할 수 있다.
  onReport?: (review: Review) => void
  onReportReply?: (review: Review) => void
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
          <ReviewReply name={name} onReport={onReportReply && (() => onReportReply(latest))} review={latest} />
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
              reply={<ReviewReply name={name} onReport={onReportReply && (() => onReportReply(review))} review={review} />}
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
