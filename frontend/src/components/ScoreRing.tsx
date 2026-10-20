const ringRadius = 16
const ringCircumference = 2 * Math.PI * ringRadius

// Ring color by score band, so neighboring scores read differently.
function scoreTone(score: number) {
  if (score >= 95) return "#3eab5e"
  if (score >= 90) return "#83b83f"
  if (score >= 85) return "#ebaa1f"
  if (score >= 80) return "#ef852e"
  return "#e05b4a"
}

export function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="match-score-ring"
      role="img"
      aria-label={`매칭 일치율 ${score}%`}
    >
      <svg aria-hidden="true" viewBox="0 0 36 36">
        <circle className="ring-track" cx="18" cy="18" r={ringRadius} />
        <circle
          className="ring-value"
          cx="18"
          cy="18"
          r={ringRadius}
          stroke={scoreTone(score)}
          strokeDasharray={`${(score / 100) * ringCircumference} ${ringCircumference}`}
        />
      </svg>
      <strong>{score}%</strong>
      <span>일치</span>
    </div>
  )
}
