import { useEffect, useRef, useState } from "react"
import { t } from "../i18n"

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

// Adds Kakao's SDK once per page (autoload off, so it loads when asked). The
// SDK fetches the rest of itself and only then calls back, so a part that never
// arrives (a blocked script) counts as a failure after loadTimeoutMs.
const loadTimeoutMs = 10_000

function loadKakao(key: string) {
  loading ??= new Promise<KakaoMaps>((resolve, reject) => {
    setTimeout(() => reject(new Error("kakao maps timed out")), loadTimeoutMs)
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

// Moves the picked shop's name label sideways, or under its pin, so it
// stays inside the map near an edge.
function keepInside(name: HTMLElement, box: HTMLElement | null) {
  if (!box) return
  const edge = 8
  const area = box.getBoundingClientRect()
  const label = name.getBoundingClientRect()
  if (label.width === 0) return
  const shift = Math.max(area.left + edge - label.left, 0) + Math.min(area.right - edge - label.right, 0)
  name.style.setProperty("--name-shift", `${Math.round(shift)}px`)
  name.classList.toggle("below", label.top < area.top + edge)
}

// One mark on the map: where it is, its name, the classes that color it
// (place-dot's states), what a screen reader hears, and a short line under
// the name once it is picked.
export type MapPin = { id: string; name: string; lat: number; lng: number; tone: string; label: string; detail?: string }

// Kakao's map as the ground, with uniconnect's own marks on it: the center's
// pin (a campus or a store) and each pin to press, colored and named as on the
// drawing. The points are only drawn, never kept. When the SDK can't load,
// onFail lets the caller draw the sketch instead.
export function KakaoMap({
  appKey,
  centerName,
  center,
  pins,
  selected,
  onSelect,
  onFail,
  label,
}: {
  appKey: string
  centerName: string
  center: { lat: number; lng: number }
  pins: MapPin[]
  selected?: string
  onSelect: (id: string) => void
  onFail: () => void
  label: string
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
    const mark = document.createElement("span")
    mark.className = "kakao-campus"
    mark.textContent = centerName
    // Under the pins, so one beside the center stays in reach.
    const overlays = [new maps.CustomOverlay({ position: home, content: mark, yAnchor: 1, zIndex: 0 })]
    let name: HTMLElement | undefined
    for (const pin of pins) {
      const position = new maps.LatLng(pin.lat, pin.lng)
      const dot = document.createElement("button")
      dot.type = "button"
      dot.className = `place-dot kakao-dot ${pin.tone}`
      dot.title = pin.name
      dot.setAttribute("aria-label", pin.label)
      dot.setAttribute("aria-pressed", String(selected === pin.id))
      dot.addEventListener("click", () => select.current(pin.id))
      if (selected === pin.id) {
        name = document.createElement("span")
        name.className = "place-dot-name"
        name.setAttribute("aria-hidden", "true")
        name.append(pin.name)
        if (pin.detail) {
          const detail = document.createElement("small")
          detail.textContent = pin.detail
          name.append(detail)
        }
        dot.append(name)
      }
      // The pin's tip on the spot.
      overlays.push(new maps.CustomOverlay({ position, content: dot, yAnchor: 1, zIndex: selected === pin.id ? 2 : 1, clickable: true }))
    }
    for (const overlay of overlays) overlay.setMap(map)
    // Measured once Kakao has placed the overlays.
    const picked = name
    const frame = picked ? requestAnimationFrame(() => keepInside(picked, box.current)) : 0
    return () => {
      cancelAnimationFrame(frame)
      for (const overlay of overlays) overlay.setMap(null)
    }
  }, [ready, centerName, center.lat, center.lng, pins, selected])

  // Fit the center and every pin once they first arrive or change, not on each pick.
  useEffect(() => {
    if (!ready || pins.length === 0) return
    const { maps, map } = ready
    const bounds = new maps.LatLngBounds()
    bounds.extend(new maps.LatLng(center.lat, center.lng))
    for (const pin of pins) bounds.extend(new maps.LatLng(pin.lat, pin.lng))
    map.relayout()
    map.setBounds(bounds, 40, 40, 40, 40)
  }, [ready, center.lat, center.lng, pins])

  return (
    <div aria-label={label} className="kakao-map" role="group">
      <div className="kakao-map-ground" ref={box} />
      {!ready && <span className="kakao-map-loading">{t("지도를 불러오는 중이에요")}</span>}
    </div>
  )
}
