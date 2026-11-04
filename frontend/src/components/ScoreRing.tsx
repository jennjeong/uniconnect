import type { CSSProperties } from "react"

import { t } from "../i18n"
import { scoreColors } from "../lib/score"

const radius = 15.5
const circumference = 2 * Math.PI * radius

// 매치 점수를 링으로 나타낸다. 링은 12시 방향에서 시계 방향으로 점수에 맞는
// 파랑으로 차오르고, 바탕은 은색 트랙이며 가운데에 흰 바탕의 숫자가 놓인다.
export function ScoreRing({ score }: { score: number }) {
  const colors = scoreColors(score)
  const value = Math.min(Math.max(score, 0), 100)

  return (
    <div
      className="match-score-ring"
      role="img"
      aria-label={t("매칭 일치율 {score}%", { score })}
      style={{ "--ring-color": colors.ring, "--ring-text": colors.text } as CSSProperties}
    >
      <svg aria-hidden="true" viewBox="0 0 36 36">
        <circle className="ring-fill" cx="18" cy="18" r="13.5" />
        <circle className="ring-track" cx="18" cy="18" r={radius} />
        <circle
          className="ring-value"
          cx="18"
          cy="18"
          r={radius}
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <strong>
        {score}
        <small>%</small>
      </strong>
      <span>{t("일치율")}</span>
    </div>
  )
}
