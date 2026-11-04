import type { IconName } from "../components/Icon"
import { t } from "../i18n"
import type { MeasureMethod, MethodKind, MethodSide, MetricKind, VenueCounts } from "../types"

// 행사에서 협찬을 확인할 수 있는 방식(협찬 확인 방식)을 전자계약서가 나열하는
// 대로. 순서까지 backend/src/lib/methods.ts의 methodKinds와 같아야 한다
// (lib/lists.sync.test.ts가 검사한다).
export const methodKinds: MethodKind[] = [
  "qr",
  "coupon",
  "visit",
  "sampling",
  "booth",
  "sns",
  "survey",
  "purchase",
  "giveaway",
  "raffle",
  "signup",
  "experience",
]

// 각 방식의 설명: 무엇인지, 무엇을 세는지, 보통 어느 쪽이 확인하는지. QR과 그
// 쿠폰은 참여자의 휴대폰에서 집계되고(auto: 그쪽이 운영한다), 매장 방문은
// 브랜드의 매장에서만(fixed), 샘플이나 물품 상자는 개수로 센다(bulk). 쿠폰은
// QR이 필요하고(needs), 매장 방문은 쿠폰이 필요하다.
export const methodInfo: Record<
  MethodKind,
  {
    label: string
    detail: string
    icon: IconName
    metric: MetricKind
    side: MethodSide
    auto?: true
    fixed?: true
    bulk?: true
    needs?: MethodKind
  }
> = {
  qr: {
    label: "QR 체크인",
    detail: "참여자가 행사장 QR을 휴대폰으로 찍으면 자동으로 세요.",
    icon: "scan",
    metric: "scans",
    side: "group",
    auto: true,
  },
  coupon: {
    label: "쿠폰 발급",
    detail: "QR을 찍은 참여자가 휴대폰으로 쿠폰을 받으면 자동으로 세요.",
    icon: "file",
    metric: "coupons",
    side: "brand",
    auto: true,
    needs: "qr",
  },
  visit: {
    label: "매장 방문",
    detail: "매장 직원이 참여자의 쿠폰 번호로 방문을 확인해요.",
    icon: "store",
    metric: "visits",
    side: "brand",
    fixed: true,
    needs: "coupon",
  },
  sampling: {
    label: "샘플링 · 시음",
    detail: "부스에서 나눠 준 샘플이나 시음 수량을 세요.",
    icon: "spark",
    metric: "samples",
    side: "brand",
    bulk: true,
  },
  booth: {
    label: "부스 방문 · 스탬프",
    detail: "부스나 체험존에 들른 참여자를 한 명씩 확인해요.",
    icon: "check",
    metric: "stamps",
    side: "group",
  },
  sns: {
    label: "SNS 인증",
    detail: "참여자가 올린 인증 게시물을 확인해요.",
    icon: "share",
    metric: "posts",
    side: "group",
  },
  survey: {
    label: "설문 응답",
    detail: "참여자의 설문 응답을 확인해요.",
    icon: "edit",
    metric: "surveys",
    side: "group",
  },
  purchase: {
    label: "현장 구매 · 영수증",
    detail: "부스나 매장에서 산 참여자를 영수증으로 확인해요.",
    icon: "won",
    metric: "purchases",
    side: "brand",
  },
  giveaway: {
    label: "굿즈 · 사은품 지급",
    detail: "나눠 준 굿즈나 사은품 수량을 세요.",
    icon: "inbox",
    metric: "giveaways",
    side: "brand",
    bulk: true,
  },
  raffle: {
    label: "경품 응모 · 추첨",
    detail: "경품 이벤트에 응모한 참여자를 확인해요.",
    icon: "bell",
    metric: "raffles",
    side: "group",
  },
  signup: {
    label: "회원 가입 · 앱 설치",
    detail: "브랜드 회원으로 가입하거나 앱을 설치한 참여자를 확인해요.",
    icon: "users",
    metric: "signups",
    side: "brand",
  },
  experience: {
    label: "체험 · 시연 참여",
    detail: "제품 체험이나 시연에 참여한 사람을 확인해요.",
    icon: "pin",
    metric: "experiences",
    side: "brand",
  },
}

// QR, 그 쿠폰, 매장 방문 외에 현장 페이지가 손으로 세는 방식.
export const isVenueMethod = (kind: MethodKind) => !methodInfo[kind].auto && kind !== "visit"

// 양쪽이 전자계약서를 확정하기 전까지 협찬을 확인하는 방식.
export const defaultMethods: MeasureMethod[] = [
  { kind: "qr", side: "group" },
  { kind: "coupon", side: "brand" },
  { kind: "visit", side: "brand" },
]

// 단위가 붙은 현장 집계. 예: "샘플 35개".
const venueUnits: Record<keyof VenueCounts, (count: string) => string> = {
  samples: (count) => t("샘플 {count}개", { count }),
  stamps: (count) => t("스탬프 {count}명", { count }),
  posts: (count) => t("SNS 인증 {count}건", { count }),
  surveys: (count) => t("설문 {count}건", { count }),
  purchases: (count) => t("구매 {count}건", { count }),
  giveaways: (count) => t("사은품 {count}개", { count }),
  raffles: (count) => t("응모 {count}건", { count }),
  signups: (count) => t("가입 {count}명", { count }),
  experiences: (count) => t("체험 {count}명", { count }),
}

// 어떤 방식들이 센 현장 집계. 예: "샘플 35개 · SNS 인증 1건", 여전히 0인 것은
// 뺀다.
export function venueSummary(counts: Partial<Record<MetricKind, number>>) {
  return (Object.keys(venueUnits) as (keyof VenueCounts)[])
    .filter((metric) => (counts[metric] ?? 0) > 0)
    .map((metric) => venueUnits[metric]((counts[metric] ?? 0).toLocaleString("ko-KR")))
    .join(" · ")
}

// 정해진 쪽과 함께, 나열된 순서대로 정리한 방식들.
export const sortedMethods = (methods: MeasureMethod[]) =>
  methodKinds.flatMap((kind) => methods.filter((method) => method.kind === kind))
