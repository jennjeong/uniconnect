import { useCallback, useMemo, useState } from "react"
import { useSiteState } from "../hooks/useSiteState"
import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import { mapPosition, mapRings, mapScale, spreadPositions, walkMinutes } from "../lib/placeMap"
import type { NearbyPlace } from "../types"
import { KakaoMap, type MapPin } from "./KakaoMap"

// uniconnect와 가게의 관계 상태. 점과 이름의 모양을 정한다.
export function placeState(place: NearbyPlace) {
  return place.brandId ? "joined" : place.invited ? "invited" : "open"
}

export const placeStateLabels = { joined: "uniconnect 가입", invited: "초대함", open: "협약 전" } as const

// 캠퍼스 주변 가게를 방향과 거리로 그린다. 캠퍼스가 가운데에 있고 북쪽이
// 위이며, 가장 먼 가게까지 이어지는 동심원(lib/placeMap.ts)이 있다. 각 가게는
// 누를 수 있는 핀이다 (가입했으면 짙은 파랑, 초대했으면 테두리, 그 전에는
// 은색). 고른 가게는 이름이 붙고 캠퍼스에서 선이 이어진다. Kakao JavaScript
// 키가 있으면 (/api/site의 maps.kakao) 같은 핀이 Kakao 지도 위에 놓이고
// (KakaoMap.tsx), 키가 없거나 로딩에 실패하면 이 그림을 쓴다. 좌표는 Kakao의
// 실시간 응답에 딸려 오며 화면에만 그린다.
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
  const kakaoKey = useSiteState()?.maps?.kakao
  const [kakaoFailed, setKakaoFailed] = useState(false)
  const fail = useCallback(() => setKakaoFailed(true), [])
  const pins = useMemo<MapPin[]>(
    () =>
      places.map((place) => ({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        tone: placeState(place),
        label: t("{name}, {distance}, {state}", {
          name: place.name,
          distance: formatDistance(place.distanceM / 1000),
          state: t(placeStateLabels[placeState(place)]),
        }),
        detail: t("도보 {minutes}분", { minutes: walkMinutes(place.distanceM) }),
      })),
    [places],
  )
  const pick = useCallback((id: string) => {
    const place = places.find((item) => item.id === id)
    if (place) onSelect(place)
  }, [places, onSelect])
  if (kakaoKey && !kakaoFailed)
    return (
      <div className="place-map-wrap">
        <KakaoMap
          appKey={kakaoKey}
          center={center}
          centerName={campus}
          label={t("{campus} 주변 가게 지도", { campus })}
          onFail={fail}
          onSelect={pick}
          pins={pins}
          selected={selected}
        />
        <PlaceLegend />
      </div>
    )
  const scale = mapScale(center, places)
  const rings = mapRings(scale)
  const positions = spreadPositions(places.map((place) => mapPosition(center, place, scale.radius)))
  const picked = places.findIndex((place) => place.id === selected)
  return (
    <div className="place-map-wrap">
      <div aria-label={t("{campus} 주변 가게 지도", { campus })} className="place-map" role="group">
        <svg aria-hidden="true" className="place-map-rings" viewBox="0 0 100 100">
          <line x1="50" x2="50" y1="0" y2="100" />
          <line x1="0" x2="100" y1="50" y2="50" />
          {rings.map((ring) => (
            <circle cx="50" cy="50" key={ring} r={(ring / scale.radius) * 50 - 0.4} />
          ))}
          {picked >= 0 && (
            <line
              className="place-map-route"
              key={selected}
              x1="50"
              x2={positions[picked].left}
              y1="50"
              y2={positions[picked].top}
            />
          )}
        </svg>
        {rings.map((ring) => (
          <span aria-hidden="true" className="place-map-ring" key={ring} style={{ top: `${50 + (ring / scale.radius) * 50}%` }}>
            {t("{distance} · 도보 {minutes}분", { distance: formatDistance(ring / 1000), minutes: walkMinutes(ring) })}
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
            >
              {selected === place.id && (
                <span aria-hidden="true" className="place-dot-name">
                  {place.name}
                  <small>{t("도보 {minutes}분", { minutes: walkMinutes(place.distanceM) })}</small>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <PlaceLegend />
    </div>
  )
}

function PlaceLegend() {
  return (
    <ul className="place-map-legend">
      {(Object.keys(placeStateLabels) as (keyof typeof placeStateLabels)[]).map((state) => (
        <li key={state}>
          <span aria-hidden="true" className={`place-dot-key ${state}`} />
          {t(placeStateLabels[state])}
        </li>
      ))}
    </ul>
  )
}
