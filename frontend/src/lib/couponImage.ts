import { t } from "../i18n"
import { formatFullDate } from "./date"
import { saveFile } from "./download"

// 쿠폰 한 장을 사진첩에 넣을 수 있는 PNG로 그린다(#352). 지갑 패스 대신, 화면을
// 찾지 않아도 가게에서 번호를 보여 줄 수 있게 한다. 색은 화면 테마와 상관없이 인쇄용처럼 고정한다.
export type CouponPicture = {
  store: string
  title: string
  number: string
  eventName?: string
  until?: string
}

const width = 1080
const height = 1350
const font = (weight: number, size: number) => `${weight} ${size}px "Pretendard Variable", Pretendard, system-ui, sans-serif`

// 줄이 넘치면 글자 단위로 줄인다(한국어는 띄어쓰기 없이도 길다).
function fit(context: CanvasRenderingContext2D, text: string, max: number) {
  if (context.measureText(text).width <= max) return text
  let cut = text
  while (cut.length > 1 && context.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1)
  return `${cut}…`
}

export function drawCoupon(canvas: HTMLCanvasElement, coupon: CouponPicture) {
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return false
  context.fillStyle = "#0b2a6b"
  context.fillRect(0, 0, width, height)
  // 쿠폰 몸통: 흰 카드와 양옆의 반원 홈.
  context.fillStyle = "#ffffff"
  context.beginPath()
  context.roundRect(90, 150, width - 180, height - 300, 48)
  context.fill()
  context.fillStyle = "#0b2a6b"
  for (const x of [90, width - 90]) {
    context.beginPath()
    context.arc(x, 760, 44, 0, Math.PI * 2)
    context.fill()
  }
  context.strokeStyle = "#c7cfdc"
  context.setLineDash([18, 14])
  context.lineWidth = 4
  context.beginPath()
  context.moveTo(160, 760)
  context.lineTo(width - 160, 760)
  context.stroke()
  context.setLineDash([])

  const inner = width - 340
  context.textAlign = "left"
  context.fillStyle = "#475569"
  context.font = font(600, 40)
  context.fillText(fit(context, coupon.store, inner), 170, 290)
  context.fillStyle = "#0f172a"
  context.font = font(700, 76)
  context.fillText(fit(context, coupon.title, inner), 170, 400)
  if (coupon.eventName) {
    context.fillStyle = "#64748b"
    context.font = font(500, 36)
    context.fillText(fit(context, coupon.eventName, inner), 170, 480)
  }
  if (coupon.until) {
    context.fillStyle = "#1d4ed8"
    context.font = font(600, 36)
    context.fillText(fit(context, t("{date}까지 쓸 수 있어요", { date: formatFullDate(coupon.until) }), inner), 170, 640)
  }

  context.textAlign = "center"
  context.fillStyle = "#64748b"
  context.font = font(600, 36)
  context.fillText(t("쿠폰 번호"), width / 2, 880)
  context.fillStyle = "#0f172a"
  context.font = font(800, 120)
  context.fillText(fit(context, coupon.number, inner), width / 2, 1020)
  context.fillStyle = "#475569"
  context.font = font(500, 32)
  context.fillText(t("매장에서 이 번호를 직원에게 보여 주세요."), width / 2, 1110)
  context.fillStyle = "#ffffff"
  context.font = font(900, 40)
  context.fillText("uniconnect", width / 2, height - 70)
  return true
}

export async function saveCouponImage(coupon: CouponPicture) {
  await document.fonts?.ready
  const canvas = document.createElement("canvas")
  if (!drawCoupon(canvas, coupon)) return false
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) return false
  saveFile(`uniconnect-쿠폰-${coupon.store}-${coupon.number}.png`, blob, "image/png")
  return true
}
