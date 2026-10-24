import { starPath } from "./Stars"

// A figure on a profile tab's tinted card: the number (with a star for an
// average rating), what it is and a line under it.
export type ProfileFigure = { value: string; label: string; note?: string; star?: boolean }

// The tinted card of figures at the top of a profile tab (MatchDetailPage),
// each read as its number, then what it is.
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

// Rows under the card: a label, a bar filled to its share (0 to 1) and the
// share as a percentage.
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
