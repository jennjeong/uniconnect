import type { ReactNode } from "react"

import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { Review } from "../types"
import { Stars } from "./Stars"

// One review: who wrote it and for which event, its stars and tags, its
// comment, and (on the agreement page) the writer's own buttons.
export function ReviewCard({ review, title, actions }: { review: Review; title?: string; actions?: ReactNode }) {
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
    </article>
  )
}
