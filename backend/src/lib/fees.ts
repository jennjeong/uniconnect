import { HttpError } from "./errors.js"

// 협찬의 가치(현금과 현물 환산). 계약서에 적고 협찬 기록과 성과(ROAS)의 기준이 된다.
// 플랫폼 수수료는 더 이상 받지 않는다(lib/feeSales.ts).

export const maxValue = 100_000_000
// 협찬이 가질 수 있는 가장 작은 값. 형식적인 값으로 성과(ROAS)가 부풀지 않게 한다.
export const minValue = 10_000

// 적힌 그대로의 값: 0 이상의 정수 원, 현금과 현물을 합쳐 최소
// minValue 이상.
export function parseValue(input: unknown) {
  const raw = (input ?? {}) as { cash?: unknown; inKind?: unknown }
  const won = (value: unknown) => {
    const number = typeof value === "string" ? Number(value.replace(/[,\s원]/g, "")) : Number(value ?? 0)
    if (!Number.isInteger(number) || number < 0 || number > maxValue) {
      throw new HttpError(400, "협찬액은 0원부터 1억 원까지 원 단위로 적어 주세요.")
    }
    return number
  }
  const value = { cash: won(raw.cash), inKind: won(raw.inKind) }
  if (value.cash + value.inKind === 0) throw new HttpError(400, "현금이나 현물 환산 금액을 적어 주세요.")
  if (value.cash + value.inKind < minValue) throw new HttpError(400, "협찬액은 현금과 현물을 더해 1만 원 이상으로 적어 주세요.")
  return value
}
