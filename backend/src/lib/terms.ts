import { addDays, toIsoDate, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { maxValue, minValue } from "./fees.js"
import { sponsorTypes, text } from "./validation.js"
import type { EventItem, ProposalTerms } from "../types.js"

// 제안의 조건(협찬 형태, 금액, 수량, 전달 기한, 제공 혜택, 응답 기한, 일정 조정)을
// 메시지와 따로 받아 검사한다. 모두 선택이고, 비어 있으면 저장하지 않는다(예전
// 제안처럼 조건 없이 메시지만 있는 제안과 같이 읽힌다).
const day = (value: unknown) => {
  const raw = text(value)
  if (!raw) return undefined
  const iso = toIsoDate(raw)
  if (!iso) throw new HttpError(400, "기한과 날짜는 달력의 날짜로 골라 주세요.")
  return iso
}

export function parseTerms(value: unknown, event: EventItem | undefined, today = todayInKorea()): ProposalTerms | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "제안 조건을 확인해 주세요.")
  const body = value as Record<string, unknown>
  const kinds = Array.isArray(body.kinds) ? [...new Set(body.kinds.map(text))] : []
  if (kinds.some((kind) => !sponsorTypes.includes(kind))) throw new HttpError(400, "협찬 형태를 목록에서 골라 주세요.")

  // 금액은 계약서의 협찬액이 되므로 협찬액과 같은 범위(1만 원 ~ 1억 원)만 받는다
  // (lib/fees.ts parseValue). 그보다 작은 값으로 성사 수수료의 하한을 피하지 못하게.
  let amount: number | undefined
  if (body.amount !== undefined && body.amount !== null && text(body.amount) !== "") {
    amount = Number(body.amount)
    if (!Number.isInteger(amount) || amount < minValue || amount > maxValue) {
      throw new HttpError(400, "금액은 1만 원 이상 1억 원 이하의 원 단위로 적어 주세요.")
    }
  }
  const quantity = text(body.quantity)
  if (quantity.length > 40) throw new HttpError(400, "수량은 40자 이하로 적어 주세요.")
  const benefits = text(body.benefits)
  if (benefits.length > 200) throw new HttpError(400, "제공 혜택은 200자 이하로 적어 주세요.")

  const last = event ? (event.endDate ?? event.date) : undefined
  const deliverBy = day(body.deliverBy)
  if (deliverBy && (deliverBy < today || (last && deliverBy > last))) {
    throw new HttpError(400, "전달 기한은 오늘부터 행사 마지막 날 사이로 정해 주세요.")
  }
  const respondBy = day(body.respondBy)
  if (respondBy && (respondBy < today || (event && respondBy > event.date))) {
    throw new HttpError(400, "응답 기한은 오늘부터 행사 첫날 사이로 정해 주세요.")
  }

  // 일정 조정은 보내는 쪽이 직접 고른 경우에만 남는다: 바꾸자는 날짜가 있어야 한다.
  let schedule: ProposalTerms["schedule"]
  const asked = body.schedule as Record<string, unknown> | undefined
  if (asked && typeof asked === "object" && asked.adjust === true) {
    const date = day(asked.date)
    if (!date) throw new HttpError(400, "조정하고 싶은 날짜를 골라 주세요.")
    if (date < today || date > addDays(today, 730)) throw new HttpError(400, "조정할 날짜는 오늘부터 2년 안으로 정해 주세요.")
    schedule = { adjust: true, date }
  }

  const terms: ProposalTerms = {
    ...(kinds.length ? { kinds } : {}),
    ...(amount !== undefined ? { amount } : {}),
    ...(quantity ? { quantity } : {}),
    ...(deliverBy ? { deliverBy } : {}),
    ...(benefits ? { benefits } : {}),
    ...(respondBy ? { respondBy } : {}),
    ...(schedule ? { schedule } : {}),
  }
  return Object.keys(terms).length ? terms : undefined
}

// 메일과 계약서에 쓰는 한 줄씩의 조건.
export function termLines(terms: ProposalTerms | undefined) {
  if (!terms) return []
  return [
    ...(terms.kinds?.length ? [`협찬 형태: ${terms.kinds.join(" · ")}`] : []),
    ...(terms.amount !== undefined ? [`금액: ${terms.amount.toLocaleString("ko-KR")}원`] : []),
    ...(terms.quantity ? [`수량: ${terms.quantity}`] : []),
    ...(terms.deliverBy ? [`전달 기한: ${terms.deliverBy}`] : []),
    ...(terms.benefits ? [`제공 혜택: ${terms.benefits}`] : []),
    ...(terms.respondBy ? [`응답 기한: ${terms.respondBy}`] : []),
    ...(terms.schedule ? [`일정 조정 요청: ${terms.schedule.date}`] : []),
  ]
}
