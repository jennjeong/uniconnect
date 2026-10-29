import type { ReactNode } from "react"

import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { Review } from "../types"
import { Icon } from "./Icon"
import { Stars } from "./Stars"

// One review: who wrote it and for which event, its stars and tags, its
// comment, the reviewed side's reply under it, and (on the agreement page)
// the writer's own buttons.
export function ReviewCard({
  review,
  title,
  actions,
  reply,
}: {
  review: Review
  title?: string
  actions?: ReactNode
  // The reply as it shows here: ReviewReply for readers, its editor for the
  // side that answers on the agreement page.
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

// The reviewed side's reply under a review, for readers: its name, when,
// the text, and (for members) the button to report it. Nothing once the
// operators took it down.
export function ReviewReply({
  review,
  name,
  onReport,
}: {
  review: Review
  // The reviewed listing's name, which replied.
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
