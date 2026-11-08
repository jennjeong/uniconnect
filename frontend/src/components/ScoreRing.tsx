import type { CSSProperties } from "react"

import { t } from "../i18n"
import { scoreColors } from "../lib/score"

const radius = 15.5
const circumference = 2 * Math.PI * radius

// 추천 지수를 링으로 나타낸다(백엔드 lib/matchScore.ts). 업종 적합, 겹치는 태그, 실적,
// 함께한 이력, 응답 준비를 가중해 더한 추천 순서용 값이고 성사 확률이 아니라서, 퍼센트를
// 붙이지 않고 읽는 사람에게도 그렇게 말한다.
export function ScoreRing({ score }: { score: number }) {
  const colors = scoreColors(score)
  const value = Math.min(Math.max(score, 0), 100)

  return (
    <div
      className="match-score-ring"
      role="img"
      aria-label={t("추천 지수 {score}. 성사 확률이 아니라 업종 · 태그 · 실적 · 함께한 이력 · 응답 준비로 매긴 추천 순서예요.", { score })}
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
      <strong>{score}</strong>
      <span>{t("추천 지수")}</span>
    </div>
  )
}
