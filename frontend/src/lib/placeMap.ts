// 캠퍼스 주변 매장의 개략 지도에서 매장이 놓이는 곳: 캠퍼스가 가운데, 북쪽이
// 위, 검색 반경이 가장자리다.

type Point = { lat: number; lng: number }

const metresPerDegreeLat = 111_320

// `from`에서 동쪽·북쪽으로 떨어진 미터. 평평한 지구로 계산하며 수 킬로미터
// 안에서는 충분히 가깝다.
export function offsetMetres(from: Point, to: Point) {
  const east = (to.lng - from.lng) * metresPerDegreeLat * Math.cos((from.lat * Math.PI) / 180)
  const north = (to.lat - from.lat) * metresPerDegreeLat
  return { east, north }
}

// 가운데에서 `radiusM`만큼이 가장자리인 정사각형 지도에서, 점을 왼쪽과 위쪽의
// 퍼센트로 나타낸 값. 가장자리를 넘은 점은 가장자리에 놓인다.
export function mapPosition(center: Point, point: Point, radiusM: number) {
  return offsetPosition(offsetMetres(center, point), radiusM)
}

// 이미 가운데에서 동쪽·북쪽으로 떨어진 미터로 주어진 점(카탈로그 리스팅의
// mapOffset)에 대한 같은 계산.
export function offsetPosition({ east, north }: { east: number; north: number }, radiusM: number) {
  const distance = Math.hypot(east, north)
  const scale = distance > radiusM ? radiusM / distance : 1
  return {
    left: 50 + ((east * scale) / radiusM) * 50,
    top: 50 - ((north * scale) / radiusM) * 50,
  }
}

// 지도의 눈금: 가장자리가 얼마나 멀리 있고 고리들이 얼마씩 떨어져 있는지.
const scales = [
  { radius: 300, step: 100 },
  { radius: 600, step: 200 },
  { radius: 900, step: 300 },
  { radius: 1500, step: 500 },
]

// 가장 먼 점을 약간의 여유와 함께 담는 가장 작은 눈금. 가까운 매장들이 빈 지도
// 한가운데에 몰리지 않게 한다.
export function mapScale(center: Point, points: Point[]) {
  const farthest = Math.max(0, ...points.map((point) => {
    const { east, north } = offsetMetres(center, point)
    return Math.hypot(east, north)
  }))
  return scales.find((scale) => scale.radius >= farthest * 1.1) ?? scales[scales.length - 1]
}

// 시속 4km로 걸었을 때의 도보 분. 고리와 고른 장소에 쓰며 최소 1분이다.
export function walkMinutes(metres: number) {
  return Math.max(1, Math.round(metres / 67))
}

// 지도에 그리는 고리를 미터로, 가장자리까지.
export function mapRings({ radius, step }: { radius: number; step: number }) {
  const rings: number[] = []
  for (let ring = step; ring <= radius; ring += step) rings.push(ring)
  return rings
}

// 점들이 서로 겹칠 곳(한 건물 안의 매장)에서 떨어뜨린 위치. 각 점은 자기
// 자리에서 작은 나선을 그리며 나아가, 앞선 모든 점에서 `gap` 퍼센트 떨어질
// 때까지 움직이므로 모두 누를 수 있다.
export function spreadPositions(positions: { left: number; top: number }[], gap = 3.4) {
  const placed: { left: number; top: number }[] = []
  const crowded = (point: { left: number; top: number }) =>
    placed.some((other) => Math.hypot(other.left - point.left, other.top - point.top) < gap - 1e-9)
  return positions.map((position) => {
    let next = position
    for (let turn = 0; turn < 40 && crowded(next); turn += 1) {
      const angle = turn * 2.39996
      const radius = gap * Math.sqrt(turn + 1) * 0.75
      next = { left: position.left + Math.cos(angle) * radius, top: position.top + Math.sin(angle) * radius }
    }
    placed.push(next)
    return next
  })
}

// 카탈로그 지도의 눈금 (CatalogMap.tsx): 파트너는 한 골목이 아니라 킬로미터
// 단위로 떨어져 있다.
const wideScales = [
  { radius: 1000, step: 250 },
  { radius: 2000, step: 500 },
  { radius: 3000, step: 1000 },
  { radius: 5000, step: 1000 },
  { radius: 10000, step: 2500 },
  { radius: 20000, step: 5000 },
  { radius: 50000, step: 10000 },
]

// 가장 먼 offset을 약간의 여유와 함께 담는 가장 작은 눈금. 더 먼 것은
// 가장자리에 놓인다.
export function catalogScale(offsets: { east: number; north: number }[]) {
  const farthest = Math.max(0, ...offsets.map(({ east, north }) => Math.hypot(east, north)))
  return wideScales.find((scale) => scale.radius >= farthest * 1.1) ?? wideScales[wideScales.length - 1]
}
