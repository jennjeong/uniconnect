import type { IconName } from "../components/Icon"
import type { MetricKind } from "../types"

export const metricKinds: MetricKind[] = ["scans", "coupons", "visits"]

export const metricInfo: Record<MetricKind, { label: string; icon: IconName }> = {
  scans: { label: "QR 스캔", icon: "scan" },
  coupons: { label: "쿠폰 수령", icon: "file" },
  visits: { label: "매장 방문", icon: "store" },
}
