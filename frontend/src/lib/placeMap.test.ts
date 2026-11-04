import { describe, expect, test } from "vitest"

import { catalogScale, mapPosition, mapRings, mapScale, offsetMetres, offsetPosition, spreadPositions, walkMinutes } from "./placeMap"

const campus = { lat: 37.64201, lng: 127.10562 }

describe("the schematic map of the shops around a campus", () => {
  test("says how many minutes a distance is on foot, at least one", () => {
    expect([walkMinutes(0), walkMinutes(30), walkMinutes(500), walkMinutes(1500)]).toEqual([1, 1, 7, 22])
  })

  test("measures metres east and north", () => {
    const north = offsetMetres(campus, { lat: campus.lat + 0.001, lng: campus.lng })
    expect(north.north).toBeCloseTo(111.3, 1)
    expect(north.east).toBeCloseTo(0)
    // 경도 1도는 이만큼 북쪽에서는 위도 1도보다 짧다.
    const east = offsetMetres(campus, { lat: campus.lat, lng: campus.lng + 0.001 })
    expect(east.east).toBeCloseTo(88.2, 0)
  })

  test("puts the campus in the middle, north up and east right", () => {
    expect(mapPosition(campus, campus, 1500)).toEqual({ left: 50, top: 50 })
    const north = mapPosition(campus, { lat: campus.lat + 750 / 111_320, lng: campus.lng }, 1500)
    expect(north.left).toBeCloseTo(50)
    expect(north.top).toBeCloseTo(25)
    const east = offsetMetres(campus, { lat: campus.lat, lng: campus.lng + 0.01 }).east
    const right = mapPosition(campus, { lat: campus.lat, lng: campus.lng + 0.01 }, 1500)
    expect(right.left).toBeCloseTo(50 + (east / 1500) * 50)
    expect(right.top).toBeCloseTo(50)
  })

  test("keeps a point past the radius on the edge, in its direction", () => {
    const far = mapPosition(campus, { lat: campus.lat - 0.05, lng: campus.lng }, 1500)
    expect(far.left).toBeCloseTo(50)
    expect(far.top).toBeCloseTo(100)
  })

  test("fits its scale to the farthest shop, with a little room", () => {
    const north = (metres: number) => ({ lat: campus.lat + metres / 111_320, lng: campus.lng })
    expect(mapScale(campus, [])).toEqual({ radius: 300, step: 100 })
    expect(mapScale(campus, [north(120), north(260)])).toEqual({ radius: 300, step: 100 })
    expect(mapScale(campus, [north(120), north(450)])).toEqual({ radius: 600, step: 200 })
    expect(mapScale(campus, [north(1400)])).toEqual({ radius: 1500, step: 500 })
    // 어느 눈금보다도 멀다: 가장 큰 눈금이며 점은 가장자리에 놓인다.
    expect(mapScale(campus, [north(4000)])).toEqual({ radius: 1500, step: 500 })
  })

  test("draws its rings out to the edge", () => {
    expect(mapRings({ radius: 1500, step: 500 })).toEqual([500, 1000, 1500])
    expect(mapRings({ radius: 600, step: 200 })).toEqual([200, 400, 600])
  })

  test("moves dots on top of one another apart, and leaves the others", () => {
    const lone = { left: 20, top: 20 }
    const same = Array.from({ length: 6 }, () => ({ left: 60, top: 60 }))
    const spread = spreadPositions([lone, ...same])
    expect(spread[0]).toEqual(lone)
    expect(spread[1]).toEqual({ left: 60, top: 60 })
    for (let a = 0; a < spread.length; a += 1) {
      for (let b = a + 1; b < spread.length; b += 1) {
        expect(Math.hypot(spread[a].left - spread[b].left, spread[a].top - spread[b].top)).toBeGreaterThanOrEqual(3.4 - 1e-9)
      }
    }
    // 각각 제자리에 가깝게 머문다.
    for (const point of spread.slice(1)) expect(Math.hypot(point.left - 60, point.top - 60)).toBeLessThan(12)
  })

  test("draws catalog listings by their offsets on a scale in kilometres", () => {
    expect(catalogScale([])).toEqual({ radius: 1000, step: 250 })
    expect(catalogScale([{ east: 3000, north: 4000 }])).toEqual({ radius: 10000, step: 2500 })
    expect(catalogScale([{ east: 900_000, north: 0 }]).radius).toBe(50000)
    expect(offsetPosition({ east: 0, north: 0 }, 1000)).toEqual({ left: 50, top: 50 })
    expect(offsetPosition({ east: 500, north: 500 }, 1000)).toEqual({ left: 75, top: 25 })
    // 가장자리를 넘으면 가장자리 위에.
    const far = offsetPosition({ east: 0, north: -5000 }, 1000)
    expect(far.left).toBeCloseTo(50)
    expect(far.top).toBeCloseTo(100)
  })
})
