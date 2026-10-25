import type { IconName } from "../components/Icon"
import type { MetricKind } from "../types"

// What the check-in QR counts, in funnel order, each with a goal.
export type CheckInKind = "scans" | "coupons" | "visits"

export const metricKinds: CheckInKind[] = ["scans", "coupons", "visits"]

export const isCheckInKind = (kind: MetricKind): kind is CheckInKind => (metricKinds as MetricKind[]).includes(kind)

// What the venue's staff confirm by the measurement methods (data/methods.ts).
export const venueKinds: MetricKind[] = ["samples", "stamps", "posts"]

export const metricInfo: Record<MetricKind, { label: string; icon: IconName }> = {
  scans: { label: "QR 스캔", icon: "scan" },
  coupons: { label: "쿠폰 수령", icon: "file" },
  visits: { label: "매장 방문", icon: "store" },
  samples: { label: "샘플 · 시음", icon: "spark" },
  stamps: { label: "부스 스탬프", icon: "check" },
  posts: { label: "SNS 인증 · 설문", icon: "share" },
}
