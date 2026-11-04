import type { IconName } from "../components/Icon"
import type { MetricKind } from "../types"

// 체크인 QR이 세는 것을 깔때기 순서대로, 각각 목표와 함께.
export type CheckInKind = "scans" | "coupons" | "visits"

export const metricKinds: CheckInKind[] = ["scans", "coupons", "visits"]

export const isCheckInKind = (kind: MetricKind): kind is CheckInKind => (metricKinds as MetricKind[]).includes(kind)

// 확인 방식(data/methods.ts)으로 현장 직원이 세는 것.
export const venueKinds: MetricKind[] = [
  "samples",
  "stamps",
  "posts",
  "surveys",
  "purchases",
  "giveaways",
  "raffles",
  "signups",
  "experiences",
]

export const metricInfo: Record<MetricKind, { label: string; icon: IconName }> = {
  scans: { label: "QR 스캔", icon: "scan" },
  coupons: { label: "쿠폰 수령", icon: "file" },
  visits: { label: "매장 방문", icon: "store" },
  samples: { label: "샘플 · 시음", icon: "spark" },
  stamps: { label: "부스 스탬프", icon: "check" },
  posts: { label: "SNS 인증", icon: "share" },
  surveys: { label: "설문 응답", icon: "edit" },
  purchases: { label: "현장 구매", icon: "won" },
  giveaways: { label: "굿즈 · 사은품", icon: "inbox" },
  raffles: { label: "경품 응모", icon: "bell" },
  signups: { label: "회원 가입 · 앱 설치", icon: "users" },
  experiences: { label: "체험 참여", icon: "pin" },
}
