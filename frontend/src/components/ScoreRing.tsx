import type { CSSProperties } from "react"

import { scoreColors } from "../lib/score"

const radius = 15.5
const circumference = 2 * Math.PI * radius

// Match score as a ring filling clockwise from 12 o'clock in the score's
// own shade of blue, over a silver track, with the number on white in the
// middle.
export function ScoreRing({ score }: { score: number }) {
  const colors = scoreColors(score)
  const value = Math.min(Math.max(score, 0), 100)

  return (
    <div
      className="match-score-ring"
      role="img"
      aria-label={`매칭 일치율 ${score}%`}
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
      <span>일치율</span>
    </div>
  )
}
