import { addDaysIso, toIsoDate } from "./date"

// 이 휴대폰의 쿠폰함(#352). 참여자가 행사 QR로 받은 쿠폰은 행사마다
// localStorage의 `uniconnect-checkin-<code>`에 남는다(CheckInPage). 쿠폰함(/coupons)은
// 그 기록을 모두 모아 보여 주고, 쿠폰마다 이미지로 저장하게 한다.
// Apple · Google 지갑 패스는 개발자 계정과 서명 인증서가 있어야 해서 아직 만들지 않는다.

// 받은 쿠폰 하나. number · visited · expiresAt은 서버의 답이고, 나머지는 받을 때
// 화면에 있던 것을 함께 둔다(쿠폰함이 서버에 묻지 않고 그릴 수 있게).
export type TakenCoupon = {
  number: string
  visited?: boolean
  expiresAt?: string
  store?: string
  title?: string
  takenAt?: string
  // 쿠폰함에서 지운 쿠폰. 서버는 여전히 알고 있어 다시 받아 오므로 지우지 않고 숨긴다.
  hidden?: true
}

// 행사 하나에서 이 휴대폰이 한 일. 새로고침해도 두 번 세지 않도록 저장해 둔다.
// `pass`는 서버가 쿠폰을 한 번씩만 세게 하고, `coupons`는 쿠폰 id별(스폰서마다 하나)이다.
// 선택 설문을 이 휴대폰에서 보냈거나 건너뛰면 `surveyed`.
export type CheckIn = {
  participant: string
  pass?: string
  coupons?: Record<string, TakenCoupon>
  surveyed?: true
  eventName?: string
  groupName?: string
}

const prefix = "uniconnect-checkin-"
export const storageKey = (code: string) => `${prefix}${code}`

// 행사 쿠폰은 받은 날부터 7일 동안 쓴다. 상시 쿠폰은 서버가 expiresAt을 준다.
export const couponDays = 7

export function readCheckIn(code: string): CheckIn | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey(code)) ?? "null")
  } catch {
    return null
  }
}

export function writeCheckIn(code: string, checkIn: CheckIn | null) {
  try {
    if (checkIn) localStorage.setItem(storageKey(code), JSON.stringify(checkIn))
    else localStorage.removeItem(storageKey(code))
  } catch {
    // 저장소가 없으면 새로고침 때 다시 셀 수 있다. 방문 자체는 동작한다.
  }
}

// 서버가 답한 쿠폰 상태에 이 휴대폰이 받을 때 적어 둔 것(가게, 내용, 받은 때)을 붙인다.
export function mergeTaken(
  saved: Record<string, TakenCoupon> | undefined,
  server: Record<string, { number?: string | null; visited?: boolean; expiresAt?: string }>,
) {
  return Object.fromEntries(
    Object.entries(server).flatMap(([id, coupon]) =>
      coupon.number ? [[id, { ...saved?.[id], number: coupon.number, visited: coupon.visited, expiresAt: coupon.expiresAt }]] : [],
    ),
  ) as Record<string, TakenCoupon>
}

export type CouponState = "ready" | "used" | "expired"

export type WalletCoupon = TakenCoupon & {
  code: string
  id: string
  eventName?: string
  groupName?: string
  // 쓸 수 있는 마지막 날. 서버 값이 없으면 받은 날부터 7일, 그것도 없으면 모른다.
  until?: string
  state: CouponState
}

// 쓸 수 있는 마지막 날(이 휴대폰의 날짜). UTC로 자르면 한국의 오전에는 하루 이르다.
export function couponUntil(coupon: TakenCoupon) {
  const moment = coupon.expiresAt ?? coupon.takenAt
  const date = moment ? new Date(moment) : undefined
  if (!date || Number.isNaN(date.getTime())) return undefined
  return coupon.expiresAt ? toIsoDate(date) : addDaysIso(toIsoDate(date), couponDays)
}

// 서버가 준 기한은 그 시각까지, 행사 쿠폰은 마지막 날이 끝날 때까지 쓸 수 있다.
export function couponState(coupon: TakenCoupon, now = new Date()): CouponState {
  if (coupon.visited) return "used"
  if (coupon.expiresAt) return new Date(coupon.expiresAt).getTime() < now.getTime() ? "expired" : "ready"
  const until = couponUntil(coupon)
  return until && until < toIsoDate(now) ? "expired" : "ready"
}

const order: Record<CouponState, number> = { ready: 0, used: 1, expired: 2 }

// 저장된 체크인들에서 쿠폰을 모은다: 쓸 수 있는 것, 쓴 것, 기한 지난 것 순서로,
// 같은 상태에서는 최근에 받은 것부터.
export function walletCoupons(entries: [string, CheckIn | null][], now = new Date()): WalletCoupon[] {
  return entries
    .flatMap(([code, checkIn]) =>
      Object.entries(checkIn?.coupons ?? {})
        .filter(([, coupon]) => coupon?.number && !coupon.hidden)
        .map(([id, coupon]) => ({
          ...coupon,
          code,
          id,
          eventName: checkIn?.eventName,
          groupName: checkIn?.groupName,
          until: couponUntil(coupon),
          state: couponState(coupon, now),
        })),
    )
    .sort((a, b) => order[a.state] - order[b.state] || (b.takenAt ?? "").localeCompare(a.takenAt ?? ""))
}

// 이 브라우저에 저장된 모든 행사의 체크인.
export function savedCheckIns(): [string, CheckIn | null][] {
  try {
    const codes: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(prefix)) codes.push(key.slice(prefix.length))
    }
    return codes.map((code) => [code, readCheckIn(code)])
  } catch {
    return []
  }
}

// 쓴 쿠폰이나 기한 지난 쿠폰을 쿠폰함에서 숨긴다. 패스와 번호는 남겨 같은 행사에서
// 다시 세지 않고, 행사 페이지에는 그대로 보인다.
export function hideCoupon(code: string, id: string) {
  const checkIn = readCheckIn(code)
  const coupon = checkIn?.coupons?.[id]
  if (!checkIn || !coupon) return
  writeCheckIn(code, { ...checkIn, coupons: { ...checkIn.coupons, [id]: { ...coupon, hidden: true } } })
}
