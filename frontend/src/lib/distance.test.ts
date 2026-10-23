import { describe, expect, test } from "vitest"

import { formatDistance, nearestFirst } from "./distance"

describe("distances", () => {
  test("read in metres under a kilometre, else in kilometres", () => {
    expect(formatDistance(0.04)).toBe("40m")
    expect(formatDistance(0.8)).toBe("800m")
    expect(formatDistance(0)).toBe("10m")
    expect(formatDistance(3.5)).toBe("3.5km")
    expect(formatDistance(12)).toBe("12km")
  })

  test("sort nearest first, with the unplaced after in their own order", () => {
    const list = [
      { id: "online", distanceKm: undefined },
      { id: "far", distanceKm: 4.2 },
      { id: "anywhere", distanceKm: undefined },
      { id: "near", distanceKm: 0.8 },
    ]
    expect(nearestFirst(list).map((item) => item.id)).toEqual(["near", "far", "online", "anywhere"])
  })
})
