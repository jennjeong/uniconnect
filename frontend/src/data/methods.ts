import type { IconName } from "../components/Icon"
import { t } from "../i18n"
import type { MeasureMethod, MethodKind, MethodSide, MetricKind, VenueCounts } from "../types"

// The ways a sponsorship can be confirmed at the event (협찬 확인 방식), as
// the e-contract lists them. In order they must equal methodKinds in
// backend/src/lib/methods.ts (lib/lists.sync.test.ts checks).
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

// Each method: what it is, what it counts, and the side that usually
// confirms it. The QR and its coupon count from the participants' phones
// (auto: the side runs them), a store visit only at the brand's store
// (fixed); a box of samples or goods is counted by the number (bulk); a
// coupon needs the QR, a store visit the coupon (needs).
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

// The methods the venue pages count by hand, beyond the QR, its coupon and
// the store's visits.
export const isVenueMethod = (kind: MethodKind) => !methodInfo[kind].auto && kind !== "visit"

// How a sponsorship is confirmed until both sides confirm their e-contract.
export const defaultMethods: MeasureMethod[] = [
  { kind: "qr", side: "group" },
  { kind: "coupon", side: "brand" },
  { kind: "visit", side: "brand" },
]

// A venue count with its unit, as "샘플 35개".
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

// The venue counts some methods counted, as "샘플 35개 · SNS 인증 1건",
// leaving out those still at zero.
export function venueSummary(counts: Partial<Record<MetricKind, number>>) {
  return (Object.keys(venueUnits) as (keyof VenueCounts)[])
    .filter((metric) => (counts[metric] ?? 0) > 0)
    .map((metric) => venueUnits[metric]((counts[metric] ?? 0).toLocaleString("ko-KR")))
    .join(" · ")
}

// The methods with each one's side as set, in the listed order.
export const sortedMethods = (methods: MeasureMethod[]) =>
  methodKinds.flatMap((kind) => methods.filter((method) => method.kind === kind))
