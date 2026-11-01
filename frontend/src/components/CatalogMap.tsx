import { useState, type ReactNode } from "react"

import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import { catalogScale, mapRings, offsetPosition, spreadPositions } from "../lib/placeMap"
import type { Match } from "../types"

// A catalog drawn by direction and distance from the account browsing (its
// campus or store) in the middle, north up, rings out to the farthest
// (lib/placeMap.ts), as 가까운 순's sketch: each listing a dot to press,
// whose card shows beside the map. The same search and filters as the list
// give the listings; those without a place are named under the map.
export function CatalogMap({
  center,
  matches,
  renderCard,
  noPlace,
}: {
  // What sits in the middle: 우리 학교 or 내 매장.
  center: string
  matches: Match[]
  renderCard: (match: Match) => ReactNode
  // Said instead of the map when no listing could be placed.
  noPlace: string
}) {
  const [selected, setSelected] = useState<string>()
  const placed = matches.filter((match) => match.mapOffset)
  const unplaced = matches.filter((match) => !match.mapOffset)
  const current = matches.find((match) => match.id === selected) ?? placed[0] ?? matches[0]
  const scale = catalogScale(placed.map((match) => match.mapOffset!))
  const rings = mapRings(scale)
  const positions = spreadPositions(placed.map((match) => offsetPosition(match.mapOffset!, scale.radius)))
  const currentAt = placed.findIndex((match) => match.id === current?.id)

  return (
    <div className="nearby-map catalog-map">
      {placed.length > 0 ? (
        <div className="place-map-wrap">
          <div aria-label={t("{center} 기준 지도", { center })} className="place-map" role="group">
            <svg aria-hidden="true" className="place-map-rings" viewBox="0 0 100 100">
              <line x1="50" x2="50" y1="0" y2="100" />
              <line x1="0" x2="100" y1="50" y2="50" />
              {rings.map((ring) => (
                <circle cx="50" cy="50" key={ring} r={(ring / scale.radius) * 50 - 0.4} />
              ))}
              {currentAt >= 0 && (
                <line
                  className="place-map-route"
                  key={current?.id}
                  x1="50"
                  x2={positions[currentAt].left}
                  y1="50"
                  y2={positions[currentAt].top}
                />
              )}
            </svg>
            {rings.map((ring) => (
              <span aria-hidden="true" className="place-map-ring" key={ring} style={{ top: `${50 + (ring / scale.radius) * 50}%` }}>
                {formatDistance(ring / 1000)}
              </span>
            ))}
            <span aria-hidden="true" className="place-map-north">
              N
            </span>
            <span aria-hidden="true" className="place-map-campus">
              <span>{center}</span>
            </span>
            {placed.map((match, index) => {
              const { left, top } = positions[index]
              return (
                <button
                  aria-label={t("{name}, {distance}", { name: match.name, distance: formatDistance(match.distanceKm ?? 0) })}
                  aria-pressed={current?.id === match.id}
                  className="place-dot joined"
                  key={match.id}
                  onClick={() => setSelected(match.id)}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={match.name}
                  type="button"
                >
                  {current?.id === match.id && (
                    <span aria-hidden="true" className="place-dot-name">
                      {match.name}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="day-empty">{noPlace}</p>
      )}
      <div aria-live="polite" className="nearby-map-card">
        {current && renderCard(current)}
      </div>
      {unplaced.length > 0 && placed.length > 0 && (
        <div className="catalog-map-unplaced">
          <p>{t("위치를 몰라 지도에 없는 곳 {count}", { count: unplaced.length })}</p>
          <ul>
            {unplaced.map((match) => (
              <li key={match.id}>
                <button aria-pressed={current?.id === match.id} onClick={() => setSelected(match.id)} type="button">
                  {match.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export type Layout = "list" | "map"

// 목록 · 지도 over a catalog, as 가까운 순 has it.
export function LayoutSwitch({ value, onChange }: { value: Layout; onChange: (layout: Layout) => void }) {
  return (
    <div aria-label={t("보기 방식")} className="nearby-layout" role="group">
      {(["list", "map"] as const).map((item) => (
        <button aria-pressed={value === item} key={item} onClick={() => onChange(item)} type="button">
          {t(item === "list" ? "목록" : "지도")}
        </button>
      ))}
    </div>
  )
}
