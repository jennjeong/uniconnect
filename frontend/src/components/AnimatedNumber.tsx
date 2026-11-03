import { useEffect, useState, type CSSProperties } from "react"

// A number in a value such as "1,480,000원", "219%" or "1,240명" rolls up
// like an odometer when it appears, each digit turning from 0 to its own
// (the right-hand digits a moment later), and turns again when the value
// changes. The digits stay in the text as they are, so readers and screen
// readers get the number itself; each one's turning strip is drawn by CSS
// (.odometer-digit). Text without a number shows as is. What follows the
// number ("원", "곳") is its own span (.number-unit), so a layout can size it
// apart; it says which figure it follows (data-after), for spacing after a
// narrow "1".
export function AnimatedNumber({ value }: { value: string }) {
  const parts = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value)
  // At 0 for the first frame, so the digits roll in from there.
  const [rolled, setRolled] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRolled(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (!parts) return <>{value}</>
  const number = parts[2]
  let place = 0
  return (
    <>
      {parts[1]}
      <span className="odometer" data-rolled={rolled}>
        {[...number].map((char, index) => {
          if (!/\d/.test(char)) return char
          place += 1
          const style = { "--d": char, "--place": place } as CSSProperties
          return (
            <span className="odometer-digit" key={index} style={style}>
              {char}
            </span>
          )
        })}
      </span>
      {parts[3] && (
        <span className="number-unit" data-after={number.slice(-1)}>
          {parts[3]}
        </span>
      )}
    </>
  )
}
