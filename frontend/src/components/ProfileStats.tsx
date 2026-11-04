import { starPath } from "./Stars"

// 프로필 탭의 색 입힌 카드 속 수치 하나. 숫자(평균 별점이면 별 포함), 그것이
// 무엇인지, 그 아래 한 줄로 이루어진다.
export type ProfileFigure = { value: string; label: string; note?: string; star?: boolean }

// 프로필 탭 맨 위의 색 입힌 수치 카드 (MatchDetailPage). 각 수치는 숫자를 먼저,
// 그다음 의미를 읽는다.
export function ProfileFigures({ figures }: { figures: ProfileFigure[] }) {
  return (
    <ul className="profile-figures">
      {figures.map((figure) => (
        <li key={figure.label}>
          <strong>
            {figure.value}
            {figure.star && (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d={starPath} />
              </svg>
            )}
          </strong>
          <span>{figure.label}</span>
          {figure.note && <small>{figure.note}</small>}
        </li>
      ))}
    </ul>
  )
}

// 카드 아래의 행. 라벨, 비율(0~1)만큼 채워진 막대, 퍼센트로 나타낸 비율이다.
export function ProfileBars({ rows }: { rows: { label: string; share: number }[] }) {
  return (
    <dl className="profile-bars">
      {rows.map((row) => {
        const percent = Math.round(Math.max(0, Math.min(1, row.share)) * 100)
        return (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <span aria-hidden="true" className="profile-track">
                <i style={{ width: `${percent}%` }} />
              </span>
              <b>{percent}%</b>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
