import { useEffect, useRef, type ReactNode } from "react"

// Each row repeats its set this many times, so it never runs out.
const COPIES = 6
const ONE_SET = 100 / COPIES

export type MarqueeItem = { key: string; mark: ReactNode; label: string }

// Stride's logo marquee from getlayers.ai: two rows that move with the
// scroll, not on their own — the first to the left and the second to the
// right, each eased toward where the scroll says it should be. Here the
// rows carry the two sides of a sponsorship, passing each other.
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
