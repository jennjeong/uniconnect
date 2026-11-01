import { useEffect, useRef, useState } from "react"
import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import { walkMinutes } from "../lib/placeMap"
import type { NearbyPlace } from "../types"
import { placeState, placeStateLabels } from "./PlaceMap"

// The parts of Kakao's Maps SDK this map uses.
type LatLng = object
type KakaoOverlay = { setMap(map: KakaoMapObject | null): void }
type KakaoMapObject = { setBounds(bounds: object, ...padding: number[]): void; relayout(): void }
type KakaoMaps = {
  load(done: () => void): void
  LatLng: new (lat: number, lng: number) => LatLng
  LatLngBounds: new () => { extend(point: LatLng): void }
  Map: new (el: HTMLElement, options: { center: LatLng; level: number }) => KakaoMapObject
  CustomOverlay: new (options: { position: LatLng; content: HTMLElement; yAnchor?: number; zIndex?: number; clickable?: boolean }) => KakaoOverlay
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps }
  }
}

let loading: Promise<KakaoMaps> | undefined

// Adds Kakao's SDK once per page (autoload off, so it loads when asked).
function loadKakao(key: string) {
  loading ??= new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`
    script.async = true
    script.onload = () => {
      const maps = window.kakao?.maps
      if (maps) maps.load(() => resolve(maps))
      else reject(new Error("kakao maps missing"))
    }
    script.onerror = () => reject(new Error("kakao maps failed"))
    document.head.append(script)
  }).catch((error) => {
    loading = undefined
    throw error
  })
  return loading
}

// Kakao's map as the ground, with uniconnect's own marks on it: the campus pin
// and each shop as a pin to press, colored and named as on the drawing. The shops' points
// come with Kakao's live answer and are only drawn, never kept. When the SDK
// can't load, onFail lets PlaceMap draw the sketch instead.
export function KakaoMap({
  appKey,
  campus,
  center,
  places,
  selected,
  onSelect,
  onFail,
}: {
  appKey: string
  campus: string
  center: { lat: number; lng: number }
  places: NearbyPlace[]
  selected?: string
  onSelect: (place: NearbyPlace) => void
  onFail: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState<{ maps: KakaoMaps; map: KakaoMapObject }>()
  const select = useRef(onSelect)
  select.current = onSelect

  useEffect(() => {
    let live = true
    loadKakao(appKey).then(
      (maps) => {
        if (!live || !box.current) return
        const map = new maps.Map(box.current, { center: new maps.LatLng(center.lat, center.lng), level: 5 })
        setReady({ maps, map })
      },
      () => live && onFail(),
    )
    return () => {
      live = false
    }
  }, [appKey, center.lat, center.lng, onFail])

  useEffect(() => {
    if (!ready) return
    const { maps, map } = ready
    const home = new maps.LatLng(center.lat, center.lng)
    const pin = document.createElement("span")
    pin.className = "kakao-campus"
    pin.textContent = campus
    const overlays = [new maps.CustomOverlay({ position: home, content: pin, yAnchor: 1, zIndex: 3 })]
    for (const place of places) {
      const position = new maps.LatLng(place.lat, place.lng)
      const dot = document.createElement("button")
      dot.type = "button"
      dot.className = `place-dot kakao-dot ${placeState(place)}`
      dot.title = place.name
      dot.setAttribute(
        "aria-label",
        t("{name}, {distance}, {state}", {
          name: place.name,
          distance: formatDistance(place.distanceM / 1000),
          state: t(placeStateLabels[placeState(place)]),
        }),
      )
      dot.setAttribute("aria-pressed", String(selected === place.id))
      dot.addEventListener("click", () => select.current(place))
      if (selected === place.id) {
        const name = document.createElement("span")
        name.className = "place-dot-name"
        name.setAttribute("aria-hidden", "true")
        const walk = document.createElement("small")
        walk.textContent = t("도보 {minutes}분", { minutes: walkMinutes(place.distanceM) })
        name.append(place.name, walk)
        dot.append(name)
      }
      // The pin's tip on the spot.
      overlays.push(new maps.CustomOverlay({ position, content: dot, yAnchor: 1, zIndex: selected === place.id ? 2 : 1, clickable: true }))
    }
    for (const overlay of overlays) overlay.setMap(map)
    return () => {
      for (const overlay of overlays) overlay.setMap(null)
    }
  }, [ready, campus, center.lat, center.lng, places, selected])

  // Fit the campus and every shop once they first arrive or change, not on each pick.
  useEffect(() => {
    if (!ready || places.length === 0) return
    const { maps, map } = ready
    const bounds = new maps.LatLngBounds()
    bounds.extend(new maps.LatLng(center.lat, center.lng))
    for (const place of places) bounds.extend(new maps.LatLng(place.lat, place.lng))
    map.relayout()
    map.setBounds(bounds, 40, 40, 40, 40)
  }, [ready, center.lat, center.lng, places])

  return (
    <div aria-label={t("{campus} 주변 가게 지도", { campus })} className="kakao-map" role="group">
      <div className="kakao-map-ground" ref={box} />
      {!ready && <span className="kakao-map-loading">{t("지도를 불러오는 중이에요")}</span>}
    </div>
  )
}
