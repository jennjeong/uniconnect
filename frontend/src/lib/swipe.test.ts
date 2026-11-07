import { describe, expect, it } from "vitest"
import { wantsWheelSwipe } from "./swipe"

describe("wantsWheelSwipe", () => {
  it("listens for trackpad swipes on a Mac and other computers", () => {
    expect(wantsWheelSwipe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", 0)).toBe(true)
    expect(wantsWheelSwipe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36", 0)).toBe(true)
  })

  it("leaves scrolling alone on iPhone and iPad, where touch swipes move between screens", () => {
    expect(wantsWheelSwipe("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", 5)).toBe(false)
    // iPadOS의 Safari는 터치 지점이 있는 Mac으로 보인다.
    expect(wantsWheelSwipe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", 5)).toBe(false)
  })
})
