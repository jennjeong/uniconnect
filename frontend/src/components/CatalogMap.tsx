import { useCallback, useMemo, useState, type ReactNode } from "react"

import { useSiteState } from "../hooks/useSiteState"
import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import { catalogScale, mapRings, offsetPosition, spreadPositions } from "../lib/placeMap"
import type { Match } from "../types"
import { KakaoMap, type MapPin } from "./KakaoMap"

// 둘러보는 계정(캠퍼스나 매장)을 가운데에 두고 방향과 거리로 카탈로그를 그린다.
// 북쪽이 위이고 가장 먼 곳까지 동심원이 이어지며 (lib/placeMap.ts), 가까운 순의
// 스케치와 같다. 각 리스팅은 누를 수 있는 점이고, 카드는 지도 옆에 뜬다. Kakao
// JavaScript 키가 있으면 같은 핀이 Kakao 지도 위에 놓이고 (KakaoMap.tsx)
// 둘러보는 계정이 가운데에 온다. 키가 없거나 로딩에 실패하면 스케치를 쓴다.
// 목록과 같은 검색과 필터가 리스팅을 정하며, 위치가 없는 것은 지도 아래에
// 이름만 나열한다.
export function CatalogMap({
  center,
  matches,
  renderCard,
  noPlace,
}: {
  // 가운데에 놓이는 것: 우리 학교 또는 내 매장.
  center: string
  matches: Match[]
  renderCard: (match: Match) => ReactNode
  // 배치할 수 있는 항목이 하나도 없을 때 지도 대신 보여 주는 문구.
  noPlace: string
}) {
  const [selected, setSelected] = useState<string>()
  const placed = useMemo(() => matches.filter((match) => match.mapOffset), [matches])
  const unplaced = matches.filter((match) => !match.mapOffset)
  const current = matches.find((match) => match.id === selected) ?? placed[0] ?? matches[0]
  const scale = catalogScale(placed.map((match) => match.mapOffset!))
  const rings = mapRings(scale)
  const positions = spreadPositions(placed.map((match) => offsetPosition(match.mapOffset!, scale.radius)))
  const currentAt = placed.findIndex((match) => match.id === current?.id)
  const kakaoKey = useSiteState()?.maps?.kakao
  const [kakaoFailed, setKakaoFailed] = useState(false)
  const fail = useCallback(() => setKakaoFailed(true), [])
  const pins = useMemo<MapPin[]>(
    () =>
      placed
        .filter((match) => match.mapPoint)
        .map((match) => ({
          id: match.id,
          name: match.name,
          lat: match.mapPoint!.lat,
          lng: match.mapPoint!.lng,
          tone: "joined",
          label: t("{name}, {distance}", { name: match.name, distance: formatDistance(match.distanceKm ?? 0) }),
          detail: formatDistance(match.distanceKm ?? 0),
        })),
    [placed],
  )
  const home = homeOf(placed)

  return (
    <div className="nearby-map catalog-map">
      {placed.length > 0 && kakaoKey && !kakaoFailed && home ? (
        <div className="place-map-wrap">
          <KakaoMap
            appKey={kakaoKey}
            center={home}
            centerName={center}
            label={t("{center} 기준 지도", { center })}
            onFail={fail}
            onSelect={setSelected}
            pins={pins}
            selected={current?.id}
          />
        </div>
      ) : placed.length > 0 ? (
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

// 둘러보는 계정의 위치. 배치된 항목의 좌표에서 오프셋을 뺀 값이다 (lib/geo.ts의
// offsetMetres의 반대 방향).
function homeOf(placed: Match[]) {
  const known = placed.find((match) => match.mapPoint && match.mapOffset)
  if (!known) return undefined
  const metresPerDegree = 111_320
  const lat = known.mapPoint!.lat - known.mapOffset!.north / metresPerDegree
  const lng = known.mapPoint!.lng - known.mapOffset!.east / (metresPerDegree * Math.cos((lat * Math.PI) / 180))
  return { lat, lng }
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
