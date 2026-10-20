import type { Metrics } from "../types"

export function downloadReport(metrics: Metrics) {
  const text = [
    "UniConnect 성과 리포트",
    "행사: 가을 버스킹 데이",
    `QR 스캔: ${metrics.scans}`,
    `쿠폰 수령: ${metrics.coupons}`,
    `매장 방문: ${metrics.visits}`,
    "추정 ROAS: 243%",
  ].join("\n")
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  )
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "uniconnect-performance-report.txt"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoking right after click() can cancel the download in Safari and Firefox.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
