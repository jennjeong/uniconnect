import type { ReactNode } from "react"

import { Icon } from "./Icon"
import { RevealTitle } from "./RevealText"

// The top of a page, after Stride's section headings: an eyebrow, a large
// Bold title whose letters rise into place, a line of description, and the
// page's own actions at the right. Pages opened from another one get a back
// button over the eyebrow.
export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  onBack,
}: {
  eyebrow: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  onBack?: () => void
}) {
  return (
    <header className="page-intro">
      <div className="intro-top">
        {onBack && (
          <button aria-label="뒤로" className="back-pill" onClick={onBack} type="button">
            <Icon name="chevron" size={16} />
            <span>뒤로</span>
          </button>
        )}
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <div className="intro-row">
        <div className="intro-copy">
          {/* A new title replays its entrance. */}
          <RevealTitle className="intro-title" key={title}>
            {title}
          </RevealTitle>
          {description && <p className="intro-description">{description}</p>}
        </div>
        {actions && <div className="intro-actions">{actions}</div>}
      </div>
    </header>
  )
}
