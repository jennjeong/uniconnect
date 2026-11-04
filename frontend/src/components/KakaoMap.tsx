import { useEffect, useRef, useState } from "react"
import { t } from "../i18n"

// 이 지도가 쓰는 Kakao Maps SDK의 부분.
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

// 고른 가게의 이름표를 옆이나 핀 아래로 옮겨, 지도 가장자리 근처에서도 지도
// 안에 머물게 한다.
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
    // 핀들 아래에 두어, 중심 옆에 있는 핀도 누를 수 있게 한다.
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
      // 핀의 뾰족한 끝이 그 지점에 오도록 한다.
      overlays.push(new maps.CustomOverlay({ position, content: dot, yAnchor: 1, zIndex: selected === pin.id ? 2 : 1, clickable: true }))
    }
    for (const overlay of overlays) overlay.setMap(map)
    // Kakao가 오버레이를 배치한 뒤에 한 번 측정한다.
    const picked = name
    const frame = picked ? requestAnimationFrame(() => keepInside(picked, box.current)) : 0
    return () => {
      cancelAnimationFrame(frame)
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

  return (
    <div aria-label={label} className="kakao-map" role="group">
      <div className="kakao-map-ground" ref={box} />
      {!ready && <span className="kakao-map-loading">{t("지도를 불러오는 중이에요")}</span>}
    </div>
  )
}
