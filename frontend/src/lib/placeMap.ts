// Where a shop sits on the schematic map of the shops around a campus: the
// campus in the middle, north up, the search radius at the edge.

type Point = { lat: number; lng: number }

const metresPerDegreeLat = 111_320

// Metres east and north of `from`, flat-earth, which is close enough within
// a couple of kilometres.
export function offsetMetres(from: Point, to: Point) {
  const east = (to.lng - from.lng) * metresPerDegreeLat * Math.cos((from.lat * Math.PI) / 180)
  const north = (to.lat - from.lat) * metresPerDegreeLat
  return { east, north }
}

// The point as left and top percentages of a square map whose edge is
// `radiusM` from the middle; a point past the edge sits on it.
export function mapPosition(center: Point, point: Point, radiusM: number) {
  const { east, north } = offsetMetres(center, point)
  const distance = Math.hypot(east, north)
  const scale = distance > radiusM ? radiusM / distance : 1
  return {
    left: 50 + ((east * scale) / radiusM) * 50,
    top: 50 - ((north * scale) / radiusM) * 50,
  }
}

// The map's scales: how far its edge is, and how far apart its rings.
const scales = [
  { radius: 300, step: 100 },
  { radius: 600, step: 200 },
  { radius: 900, step: 300 },
  { radius: 1500, step: 500 },
]

// The smallest scale that holds the farthest point with a little room, so
// shops close by don't crowd the middle of an empty map.
export function mapScale(center: Point, points: Point[]) {
  const farthest = Math.max(0, ...points.map((point) => {
    const { east, north } = offsetMetres(center, point)
    return Math.hypot(east, north)
  }))
  return scales.find((scale) => scale.radius >= farthest * 1.1) ?? scales[scales.length - 1]
}

// The rings drawn on the map, in metres, out to its edge.
export function mapRings({ radius, step }: { radius: number; step: number }) {
  const rings: number[] = []
  for (let ring = step; ring <= radius; ring += step) rings.push(ring)
  return rings
}

// Positions moved apart where dots would sit on one another (shops in one
// building), each stepping out on a small spiral around its own place until
// it is `gap` percent from every dot before it, so each can be pressed.
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
