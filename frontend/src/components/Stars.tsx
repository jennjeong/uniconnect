import type { CSSProperties } from "react"

import { t } from "../i18n"

// 별 하나. 리뷰 작성 폼의 별 버튼도 이것으로 그린다.
export const starPath = "M12 2.8l2.78 5.64 6.22.9-4.5 4.39 1.06 6.2L12 17.0l-5.56 2.93 1.06-6.2L3 9.34l6.22-.9z"

function Row() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((index) => (
        <svg aria-hidden="true" key={index} viewBox="0 0 24 24">
          <path d={starPath} />
        </svg>
      ))}
    </>
  )
}

// 리뷰나 평균의 별 다섯 개. 은색 별 위에 별점만큼 짙은 파랑 별을 겹치고
// (평균이면 일부만), 숫자로 읽어 준다.
export function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span
      aria-label={t("별점 {rating}점", { rating })}
      className="stars"
      role="img"
      style={{ "--star": `${size}px`, "--filled": `${(Math.max(0, Math.min(5, rating)) / 5) * 100}%` } as CSSProperties}
    >
      <span className="stars-base">
        <Row />
      </span>
      <span className="stars-fill">
        <Row />
      </span>
    </span>
  )
}
