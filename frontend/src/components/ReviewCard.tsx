import type { ReactNode } from "react"

import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { Review } from "../types"
import { Icon } from "./Icon"
import { Stars } from "./Stars"

// 리뷰 하나. 작성자와 대상 행사, 별점과 태그, 코멘트, 그 아래 리뷰를 받은 쪽의
// 답글, 그리고 (협약 페이지에서는) 작성자 본인의 버튼을 보여 준다.
export function ReviewCard({
  review,
  title,
  actions,
  reply,
}: {
  review: Review
  title?: string
  actions?: ReactNode
  // 여기서 보이는 답글. 읽는 쪽에는 ReviewReply, 협약 페이지에서 답하는 쪽에는
  // 편집기를 보여 준다.
  reply?: ReactNode
}) {
  return (
    <article className="review-card">
      {title && <span className="review-card-title">{title}</span>}
      <div className="review-card-head">
        <Stars rating={review.rating} />
        <strong>{review.authorName}</strong>
        <span>
          {review.eventName} · {formatFullDate(review.createdAt.slice(0, 10))}
        </span>
      </div>
      {review.tags.length > 0 && (
        <ul className="review-tags">
          {review.tags.map((tag) => (
            <li key={tag}>{t(tag)}</li>
          ))}
        </ul>
      )}
      {review.comment && <p>{review.comment}</p>}
      {actions && <div className="review-card-actions">{actions}</div>}
      {reply}
    </article>
  )
}

// 리뷰 아래에 읽는 사람용으로 보이는 리뷰 받은 쪽의 답글. 이름, 시각, 본문,
// (회원에게는) 신고 버튼이 있다. 운영진이 내렸으면 아무것도 보이지 않는다.
export function ReviewReply({
  review,
  name,
  onReport,
}: {
  review: Review
  // 답글을 쓴 리스팅의 이름.
  name: string
  onReport?: () => void
}) {
  const reply = review.reply
  if (!reply?.text || reply.hidden) return null
  return (
    <div className="review-reply">
      <span className="review-reply-head">
        <Icon name="chat" size={13} />
        {t("{name}의 답글", { name })} · {formatFullDate(reply.createdAt.slice(0, 10))}
      </span>
      <p>{reply.text}</p>
      {onReport && (
        <button className="subtle-link" onClick={onReport} type="button">
          {t("답글 신고")}
        </button>
      )}
    </div>
  )
}
