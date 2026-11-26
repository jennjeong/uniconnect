import { todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Database, PaymentKind, PromoCode } from "../types.js"

// 프로모션 코드(#346). 운영자가 콘솔에서 만들고(routes/adminMore.ts), 회원이 결제 창에서
// 넣으면 주문의 공급가액에서 빼고 그 위에 부가세를 붙인다(lib/billing.ts orderFor).
// - 횟수는 그 코드를 쓴 대기 중이거나 결제된 주문으로 센다. 취소되거나 기한이 지난 주문은
//   횟수를 돌려준다. 한 계정은 한 코드를 한 번만 쓴다.
// - 할인 뒤에도 공급가액 1,000원은 남긴다(0원 결제를 만들지 않는다).
// - 결제 직전(/billing/confirm)과 늦은 입금 확인(reopenExpired)이 다시 값을 매길 때도
//   같은 기준을 쓰고, 그사이 코드가 끝났으면 할인 없는 금액으로 바뀐다.

export const promoLimits = { codes: 200, minSupply: 1_000, maxPercent: 90, maxUses: 10_000 }

// 지금 파는 상품만 고를 수 있다. 판매를 멈춘 수수료와 상세 리포트(feeSales.ts, reportSales.ts)는 뺐다.
export const promoKinds: PaymentKind[] = ["pro", "ad", "local", "program"]

export const normalizeCode = (value: unknown) => (typeof value === "string" ? value.trim().toUpperCase() : "")

export const promoCodesOf = (database: Database) => (database.promoCodes ??= [])

// 코드를 쓴 주문(대기 중이거나 결제된 것). except는 지금 값을 매기는 주문 자신이다.
export const promoUses = (database: Database, code: string, except?: string) =>
  (database.payments ?? []).filter(
    (payment) => payment.promo?.code === code && payment.id !== except && (payment.status === "pending" || payment.status === "paid"),
  )

const promoState = (promo: PromoCode, today: string) =>
  promo.disabledAt ? "disabled" : today < promo.startsOn ? "scheduled" : today > promo.endsOn ? "ended" : "active"

// 공급가액에서 뺄 금액. 쓸 수 없으면 이유와 함께 400 · 409로 답한다.
export function promoDiscount(
  database: Database,
  account: Account,
  kind: PaymentKind,
  supply: number,
  rawCode: unknown,
  except?: string,
  today = todayInKorea(),
) {
  const code = normalizeCode(rawCode)
  const promo = promoCodesOf(database).find((item) => item.code === code)
  if (!promo) throw new HttpError(404, "없는 프로모션 코드예요.")
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 프로모션 코드를 쓸 수 없어요.")
  const state = promoState(promo, today)
  if (state === "disabled" || state === "ended") throw new HttpError(409, "기간이 끝난 프로모션 코드예요.")
  if (state === "scheduled") throw new HttpError(409, "아직 쓸 수 없는 프로모션 코드예요.")
  if (promo.kinds.length > 0 && !promo.kinds.includes(kind)) throw new HttpError(409, "이 상품에는 쓸 수 없는 프로모션 코드예요.")
  const uses = promoUses(database, code, except)
  if (uses.some((payment) => payment.accountId === account.id)) throw new HttpError(409, "이미 쓴 프로모션 코드예요.")
  if (uses.length >= promo.maxUses) throw new HttpError(409, "사용 횟수가 다 찬 프로모션 코드예요.")
  const raw = promo.percent ? Math.floor((supply * promo.percent) / 100 / 10) * 10 : (promo.amountOff ?? 0)
  const discount = Math.max(0, Math.min(raw, supply - promoLimits.minSupply))
  if (discount <= 0) throw new HttpError(409, "이 주문에는 할인할 금액이 없어요.")
  return { code, discount }
}

const dateOf = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "")

// 운영자가 보낸 새 코드를 검사한다.
export function parsePromo(database: Database, body: Record<string, unknown>, now = new Date()): PromoCode {
  const code = normalizeCode(body.code)
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) throw new HttpError(400, "코드는 영문 대문자 · 숫자 · 하이픈 4~20자로 적어 주세요.")
  if (promoCodesOf(database).some((item) => item.code === code)) throw new HttpError(409, "같은 코드가 이미 있어요.")
  if (promoCodesOf(database).length >= promoLimits.codes) throw new HttpError(409, "프로모션 코드는 200개까지 만들 수 있어요.")
  const percent = body.percent === undefined || body.percent === null || body.percent === "" ? undefined : Number(body.percent)
  const amountOff = body.amountOff === undefined || body.amountOff === null || body.amountOff === "" ? undefined : Number(body.amountOff)
  if ((percent === undefined) === (amountOff === undefined)) throw new HttpError(400, "할인은 비율이나 금액 중 하나로 정해 주세요.")
  if (percent !== undefined && (!Number.isInteger(percent) || percent < 1 || percent > promoLimits.maxPercent)) {
    throw new HttpError(400, "할인 비율은 1~90% 사이의 정수로 적어 주세요.")
  }
  if (amountOff !== undefined && (!Number.isInteger(amountOff) || amountOff < 100 || amountOff > 10_000_000)) {
    throw new HttpError(400, "할인 금액은 100원부터 1,000만 원까지 적어 주세요.")
  }
  const kinds = Array.isArray(body.kinds) ? [...new Set(body.kinds.filter((kind): kind is PaymentKind => promoKinds.includes(kind as PaymentKind)))] : []
  const startsOn = dateOf(body.startsOn)
  const endsOn = dateOf(body.endsOn)
  if (!startsOn || !endsOn || endsOn < startsOn) throw new HttpError(400, "시작일과 종료일을 바르게 적어 주세요.")
  const maxUses = Number(body.maxUses)
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > promoLimits.maxUses) throw new HttpError(400, "사용 횟수는 1~10,000회로 적어 주세요.")
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 60) : ""
  return {
    code,
    ...(note ? { note } : {}),
    ...(percent !== undefined ? { percent } : { amountOff }),
    kinds,
    startsOn,
    endsOn,
    maxUses,
    createdAt: now.toISOString(),
  }
}

// 콘솔이 보는 코드 목록: 상태와 쓴 횟수, 할인한 합계(결제된 것), 최근 것부터.
export function promoRows(database: Database, today = todayInKorea()) {
  return [...promoCodesOf(database)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((promo) => {
      const uses = promoUses(database, promo.code)
      return {
        ...promo,
        state: promoState(promo, today),
        used: uses.length,
        paid: uses.filter((payment) => payment.status === "paid").length,
        discounted: uses.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + (payment.promo?.discount ?? 0), 0),
      }
    })
}
