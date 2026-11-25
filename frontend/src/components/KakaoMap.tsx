import { useEffect, useRef, useState } from "react"
import { t } from "../i18n"
import { namePlace, pinShifts } from "../lib/placeMap"

// 이 지도가 쓰는 Kakao Maps SDK의 부분.
type LatLng = object
type KakaoPoint = { x: number; y: number }
type KakaoOverlay = { setMap(map: KakaoMapObject | null): void; setPosition(position: LatLng): void }
type KakaoMapObject = {
  setBounds(bounds: object, ...padding: number[]): void
  relayout(): void
  getLevel(): number
  getProjection(): {
    containerPointFromCoords(position: LatLng): KakaoPoint
    coordsFromContainerPoint(point: KakaoPoint): LatLng
  }
}
type KakaoMaps = {
  load(done: () => void): void
  LatLng: new (lat: number, lng: number) => LatLng
  Point: new (x: number, y: number) => KakaoPoint
  LatLngBounds: new () => { extend(point: LatLng): void }
  Map: new (el: HTMLElement, options: { center: LatLng; level: number }) => KakaoMapObject
  event: {
    addListener(target: KakaoMapObject, type: string, handler: () => void): void
    removeListener(target: KakaoMapObject, type: string, handler: () => void): void
  }
  CustomOverlay: new (options: { position: LatLng; content: HTMLElement; yAnchor?: number; zIndex?: number; clickable?: boolean }) => KakaoOverlay
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps }
  }
}

let loading: Promise<KakaoMaps> | undefined

// Kakao SDK를 페이지당 한 번만 붙인다 (autoload를 꺼서 요청할 때 불러온다).
// SDK는 나머지를 스스로 내려받은 뒤에야 콜백을 부르므로, 끝내 도착하지 않는
// 부분(막힌 스크립트)은 loadTimeoutMs가 지나면 실패로 센다.
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

// 가운데 이름표 아래의 뾰족한 끝(kakao-campus의 margin-bottom)과, 핀이 이름표에서
// 떨어질 여백.
const campusPointer = 10
const campusGap = 2

// 고른 가게의 이름표를 지도 안에 두고 가운데 이름(`campus`)을 덮지 않게 한다
// (lib/placeMap.ts의 namePlace).
function placeName(name: HTMLElement, box: HTMLElement | null, campus: HTMLElement | undefined) {
  if (!box || !name.parentElement) return
  name.classList.remove("below")
  name.style.removeProperty("--name-shift")
  const label = name.getBoundingClientRect()
  if (label.width === 0) return
  const place = namePlace(
    label,
    name.parentElement.getBoundingClientRect(),
    box.getBoundingClientRect(),
    campus?.getBoundingClientRect(),
  )
  name.style.setProperty("--name-shift", `${Math.round(place.shift)}px`)
  name.classList.toggle("below", place.below)
}

// 지도 위의 마크 하나. 위치, 이름, 색을 정하는 클래스(place-dot의 상태), 스크린
// 리더가 읽는 내용, 고르면 이름 아래에 뜨는 짧은 줄을 가진다.
export type MapPin = { id: string; name: string; lat: number; lng: number; tone: string; label: string; detail?: string }

// Kakao 지도를 바탕으로 깔고 그 위에 uniconnect 자체의 마크를 얹는다. 가운데
// 핀(캠퍼스나 매장)과 누를 수 있는 각 핀이며, 스케치와 같은 색과 이름으로 보여
// 준다. 좌표는 화면에 그리기만 하고 저장하지 않는다. SDK를 불러올 수 없으면
// onFail로 호출한 쪽이 스케치를 대신 그린다.
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
  const placed = useRef<{ overlay: KakaoOverlay; position: LatLng }[]>([])
  const campus = useRef<HTMLElement>(undefined)
  const picked = useRef<HTMLElement>(undefined)
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
    campus.current = mark
    // 핀들 아래에 두어, 중심 옆에 있는 핀도 누를 수 있게 한다.
    const overlays = [new maps.CustomOverlay({ position: home, content: mark, yAnchor: 1, zIndex: 0 })]
    picked.current = undefined
    placed.current = []
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
        const name = document.createElement("span")
        name.className = "place-dot-name"
        name.setAttribute("aria-hidden", "true")
        name.append(pin.name)
        if (pin.detail) {
          const detail = document.createElement("small")
          detail.textContent = pin.detail
          name.append(detail)
        }
        dot.append(name)
        picked.current = name
      }
      // 핀의 뾰족한 끝이 그 지점에 오도록 한다.
      const overlay = new maps.CustomOverlay({ position, content: dot, yAnchor: 1, zIndex: selected === pin.id ? 2 : 1, clickable: true })
      overlays.push(overlay)
      placed.current.push({ overlay, position })
    }
    for (const overlay of overlays) overlay.setMap(map)
    return () => {
      for (const overlay of overlays) overlay.setMap(null)
    }
  }, [ready, centerName, center.lat, center.lng, pins, selected])

  // 중심과 모든 핀이 처음 도착하거나 바뀔 때 맞추고, 핀을 고를 때마다 맞추지는
  // 않는다.
  useEffect(() => {
    if (!ready || pins.length === 0) return
    const { maps, map } = ready
    const bounds = new maps.LatLngBounds()
    bounds.extend(new maps.LatLng(center.lat, center.lng))
    for (const pin of pins) bounds.extend(new maps.LatLng(pin.lat, pin.lng))
    map.relayout()
    map.setBounds(bounds, 40, 40, 40, 40)
  }, [ready, center.lat, center.lng, pins])

  // 가까운 핀끼리, 또는 가운데 이름을 덮지 않도록 벌린다. 겹침은 배율에만
  // 달려 있으므로 배율이 바뀔 때 다시 재고, 고른 가게의 이름표는 Kakao가 핀을
  // 배치한 뒤에 맞춘다.
  useEffect(() => {
    if (!ready) return
    const { maps, map } = ready
    let level: number | undefined
    let frame = 0
    const spread = () => {
      cancelAnimationFrame(frame)
      // 동작 줄이기에서는 0.01ms 전환 때문에 옮긴 자리가 한 프레임 늦게 보인다.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (picked.current) placeName(picked.current, box.current, campus.current)
        })
      })
      const mark = campus.current
      // 아직 화면에 놓이지 않아 잴 수 없으면 다음 idle에서 다시 잰다.
      const measured = mark && mark.offsetWidth > 0
      if (level === map.getLevel()) return
      if (measured) level = map.getLevel()
      const projection = map.getProjection()
      const points = placed.current.map(({ position }) => projection.containerPointFromCoords(position))
      const home = projection.containerPointFromCoords(new maps.LatLng(center.lat, center.lng))
      const keepOut = measured
        ? {
            left: home.x - mark.offsetWidth / 2 - campusGap,
            right: home.x + mark.offsetWidth / 2 + campusGap,
            top: home.y - mark.offsetHeight - campusPointer - campusGap,
            bottom: home.y,
          }
        : undefined
      const shifts = pinShifts(points, keepOut)
      placed.current.forEach(({ overlay, position }, index) => {
        const { x, y } = shifts[index]
        const moved = new maps.Point(points[index].x + x, points[index].y + y)
        overlay.setPosition(x === 0 && y === 0 ? position : projection.coordsFromContainerPoint(moved))
      })
    }
    spread()
    maps.event.addListener(map, "idle", spread)
    return () => {
      cancelAnimationFrame(frame)
      maps.event.removeListener(map, "idle", spread)
    }
  }, [ready, centerName, center.lat, center.lng, pins, selected])

  return (
    <div aria-label={label} className="kakao-map" role="group">
      <div className="kakao-map-ground" ref={box} />
      {!ready && <span className="kakao-map-loading">{t("지도를 불러오는 중이에요")}</span>}
    </div>
  )
}
