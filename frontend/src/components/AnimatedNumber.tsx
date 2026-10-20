import { useEffect, useRef, useState } from "react"

const durationMs = 700

// Counts the number in a value such as "₩1,480K", "219%" or "1,240명" up
// from 0 when it appears, and from the old number when it changes. Text
// without a number shows as is.
export function AnimatedNumber({ value }: { value: string }) {
  const parts = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value)
  const target = parts ? Number(parts[2].replace(/,/g, "")) : Number.NaN
  const decimals = parts?.[2].split(".")[1]?.length ?? 0
  const [shown, setShown] = useState(0)
  const current = useRef(0)

  useEffect(() => {
    if (Number.isNaN(target)) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target
      setShown(target)
      return
    }
    const from = current.current
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / durationMs)
      // Ease out: fast at first, settling on the final number.
      current.current = from + (target - from) * (1 - (1 - progress) ** 3)
      setShown(current.current)
      if (progress < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target])

  if (!parts || Number.isNaN(target)) return <>{value}</>
  const number = shown.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return (
    <>
      {parts[1]}
      {number}
      {parts[3]}
    </>
  )
}
