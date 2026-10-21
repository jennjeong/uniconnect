// Ring colors at a few match scores, from silver blue at 60% to the point's
// deep blue from 96% up: the closer the match, the deeper the blue. Scores
// in between blend their two neighbors, so every point gets its own shade.
const stops: [number, string][] = [
  [60, "#a7b4cd"],
  [70, "#8599c4"],
  [80, "#5b7cc6"],
  [88, "#3563c8"],
  [96, "#1f49a6"],
  [100, "#1b3f8f"],
]

const channels = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))

const toHex = (rgb: number[]) =>
  `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`

// WCAG contrast ratio against a white background.
function contrastWithWhite(rgb: number[]) {
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05)
}

// The score's ring color, and for its number a darker shade of the same
// color that reaches 3.6:1 on white (the numbers are large and bold).
export function scoreColors(score: number) {
  const value = Math.min(Math.max(score, stops[0][0]), stops[stops.length - 1][0])
  const upper = Math.max(1, stops.findIndex(([at]) => at >= value))
  const [fromScore, fromColor] = stops[upper - 1]
  const [toScore, toColor] = stops[upper]
  const t = (value - fromScore) / (toScore - fromScore)
  const to = channels(toColor)
  const ring = channels(fromColor).map((channel, index) => channel + (to[index] - channel) * t)

  let dim = 1
  while (dim > 0 && contrastWithWhite(ring.map((channel) => channel * dim)) < 3.6) dim -= 0.02
  return { ring: toHex(ring), text: toHex(ring.map((channel) => channel * dim)) }
}
