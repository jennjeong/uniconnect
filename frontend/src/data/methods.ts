import type { IconName } from "../components/Icon"
import { t } from "../i18n"
import type { ChatSide, MeasureMethod, MethodKind, MetricKind } from "../types"

// The ways a sponsorship can be measured at the event, as the agreement
// lists them. In order they must equal methodKinds in
// backend/src/lib/methods.ts (lib/lists.sync.test.ts checks).
export const methodKinds: MethodKind[] = ["coupon", "sampling", "booth", "sns"]

// Each method: what it is, what the venue counts by it (beyond the check-in
// QR's coupons and visits), and the side that usually confirms it. Store
// visits are confirmed at the brand's store, so the coupon is the brand's.
export const methodInfo: Record<
  MethodKind,
  { label: string; detail: string; icon: IconName; metric?: MetricKind; side: ChatSide; fixed?: true }
> = {
  coupon: {
    label: "QR 체크인 · 쿠폰 · 매장 방문",
    detail: "참여자가 현장 QR을 찍고 쿠폰을 받으면, 매장 직원이 쿠폰 번호로 방문을 확인해요.",
    icon: "scan",
    side: "brand",
    fixed: true,
  },
  sampling: {
    label: "샘플링 · 시음 수량",
    detail: "부스에서 나눠 준 샘플이나 시음 수량을 현장 담당자가 세요.",
    icon: "spark",
    metric: "samples",
    side: "brand",
  },
  booth: {
    label: "부스 방문 · 스탬프",
    detail: "부스나 체험존에 들른 참여자를 담당자가 한 명씩 확인해요.",
    icon: "check",
    metric: "stamps",
    side: "group",
  },
  sns: {
    label: "SNS 인증 · 설문",
    detail: "참여자가 올린 인증 게시물이나 설문 응답을 담당자가 확인해요.",
    icon: "share",
    metric: "posts",
    side: "group",
  },
}

// The venue counts some of these methods measure, as "샘플 35개 · SNS 인증
// 1건", leaving out those still at zero.
export function venueSummary(counts: Partial<Record<MetricKind, number>>) {
  return [
    counts.samples ? t("샘플 {count}개", { count: counts.samples.toLocaleString("ko-KR") }) : "",
    counts.stamps ? t("스탬프 {count}명", { count: counts.stamps.toLocaleString("ko-KR") }) : "",
    counts.posts ? t("SNS 인증 {count}건", { count: counts.posts.toLocaleString("ko-KR") }) : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

// The methods with each one's side as set, in the listed order.
export const sortedMethods = (methods: MeasureMethod[]) =>
  methodKinds.flatMap((kind) => methods.filter((method) => method.kind === kind))
