import { useEffect, useRef, type ReactNode } from "react"

// 각 행은 세트를 이 횟수만큼 반복해 끊기지 않게 한다.
const COPIES = 6
const ONE_SET = 100 / COPIES

export type MarqueeItem = { key: string; mark: ReactNode; label: string }

// getlayers.ai의 Stride가 쓰는 로고 마퀴. 두 행이 스스로 흐르지 않고 스크롤에
// 맞춰 움직인다. 첫 행은 왼쪽으로, 둘째 행은 오른쪽으로 가며, 각각 스크롤이
// 가리키는 위치로 완만하게 따라간다. 여기서는 두 행이 협찬의 양쪽을 나타내며
// 서로 스쳐 지나간다.
export function LogoMarquee({ rows, label }: { rows: [MarqueeItem[], MarqueeItem[]]; label: string }) {
  const tracks = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const speeds = [0.005, 0.0038]
    const eased = [0, 0]
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      tracks.current.forEach((track, index) => {
        if (!track) return
        const target = window.scrollY * speeds[index]
        eased[index] += (target - eased[index]) * 0.08
        const m = ((eased[index] % ONE_SET) + ONE_SET) % ONE_SET
        const offset = index === 0 ? -m : -(ONE_SET - m)
        track.style.transform = `translate3d(${offset}%, 0, 0)`
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <section aria-label={label} className="logo-marquee">
      {rows.map((items, row) => (
        <div className="marquee-row" key={row}>
          <div
            className="marquee-track"
            ref={(element) => {
              tracks.current[row] = element
            }}
          >
            {Array.from({ length: COPIES }, (_, copy) =>
              items.map((item) => (
                <span aria-hidden={copy > 0 || undefined} className="marquee-item" key={`${copy}-${item.key}`}>
                  {item.mark}
                  {item.label}
                </span>
              )),
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
