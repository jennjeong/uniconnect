import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import { mapPosition, mapRings, mapScale, spreadPositions } from "../lib/placeMap"
import type { NearbyPlace } from "../types"

// How a shop stands with uniconnect, for its dot and its name.
export function placeState(place: NearbyPlace) {
  return place.brandId ? "joined" : place.invited ? "invited" : "open"
}

export const placeStateLabels = { joined: "uniconnect 가입", invited: "초대함", open: "협약 전" } as const

// The shops around the campus drawn by direction and distance: the campus in
// the middle, north up, rings out to the farthest shop (lib/placeMap.ts),
// each shop a dot to press (deep blue once it joined, ringed once invited,
// silver before). It is a sketch, not a map service: the points come with
// Kakao's live answer and are drawn only on screen.
export function PlaceMap({
  campus,
  center,
  places,
  selected,
  onSelect,
}: {
  campus: string
  center: { lat: number; lng: number }
  places: NearbyPlace[]
  selected?: string
  onSelect: (place: NearbyPlace) => void
}) {
  const scale = mapScale(center, places)
  const rings = mapRings(scale)
  const positions = spreadPositions(places.map((place) => mapPosition(center, place, scale.radius)))
  return (
    <div className="place-map-wrap">
      <div aria-label={t("{campus} 주변 가게 지도", { campus })} className="place-map" role="group">
        <svg aria-hidden="true" className="place-map-rings" viewBox="0 0 100 100">
          <line x1="50" x2="50" y1="0" y2="100" />
          <line x1="0" x2="100" y1="50" y2="50" />
          {rings.map((ring) => (
            <circle cx="50" cy="50" key={ring} r={(ring / scale.radius) * 50 - 0.4} />
          ))}
        </svg>
        {rings.map((ring) => (
          <span aria-hidden="true" className="place-map-ring" key={ring} style={{ left: `${50 + (ring / scale.radius) * 50}%` }}>
            {formatDistance(ring / 1000)}
          </span>
        ))}
        <span aria-hidden="true" className="place-map-north">
          N
        </span>
        <span aria-hidden="true" className="place-map-campus">
          <span>{campus}</span>
        </span>
        {places.map((place, index) => {
          const { left, top } = positions[index]
          const state = placeState(place)
          return (
            <button
              aria-label={t("{name}, {distance}, {state}", {
                name: place.name,
                distance: formatDistance(place.distanceM / 1000),
                state: t(placeStateLabels[state]),
              })}
              aria-pressed={selected === place.id}
              className={`place-dot ${state}`}
              key={place.id}
              onClick={() => onSelect(place)}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={place.name}
              type="button"
            />
          )
        })}
      </div>
      <ul className="place-map-legend">
        {(Object.keys(placeStateLabels) as (keyof typeof placeStateLabels)[]).map((state) => (
          <li key={state}>
            <span aria-hidden="true" className={`place-dot-key ${state}`} />
            {t(placeStateLabels[state])}
          </li>
        ))}
      </ul>
    </div>
  )
}
