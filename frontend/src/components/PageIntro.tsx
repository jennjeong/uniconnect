import type { ReactNode } from "react"

import { t } from "../i18n"
import { Icon } from "./Icon"
import { Lines } from "./Lines"
import { RevealTitle } from "./RevealText"

// 페이지의 맨 위. Stride의 섹션 제목을 본떴다. 아이콘 라벨, 글자가 올라와 자리
// 잡는 큰 Bold 제목, 설명 한 줄, 오른쪽에 그 페이지 자체의 동작이 온다. 다른
// 페이지에서 열린 페이지에는 라벨 위에 뒤로 가기 버튼이 붙는다.
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
          <button aria-label={t("뒤로")} className="back-pill" onClick={onBack} type="button">
            <Icon name="chevron" size={16} />
            <span>{t("뒤로")}</span>
          </button>
        )}
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <div className="intro-row">
        <div className="intro-copy">
          {/* 제목이 바뀌면 등장 애니메이션을 다시 재생한다. */}
          <RevealTitle className="intro-title" key={title}>
            {title}
          </RevealTitle>
          {description && <p className="intro-description">{typeof description === "string" ? <Lines text={description} /> : description}</p>}
        </div>
        {actions && <div className="intro-actions">{actions}</div>}
      </div>
    </header>
  )
}
