// 몇 가지 매칭 점수에서의 링 색: 60%의 은빛 파랑에서 96% 이상의 포인트
// 진파랑까지. 매칭이 가까울수록 파랑이 진해진다. 그 사이 점수는 이웃한 두 색을
// 섞어서 모든 점수가 자기 색을 갖는다.
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

// 흰 배경에 대한 WCAG 대비율.
function contrastWithWhite(rgb: number[]) {
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05)
}

// 점수의 링 색과, 숫자에는 같은 색에서 흰색 위 대비 3.6:1에 이르는 더 어두운 색
// (숫자는 크고 굵다).
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
