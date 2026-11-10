// 성사 수수료의 예상치. 서버(backend lib/fees.ts feeOf, lib/billing.ts withVat)와 같은
// 계산이다(lib/fees.test.ts가 일치를 검사한다): 협찬액의 15%를 10원 단위로 올리고,
// 결제할 때 부가세 10%를 더한다. 실제 금액은 계약서의 협찬액(현금+현물)으로 정해진다.
export const feeRate = 0.15
export const vatRate = 0.1
export const minValue = 10_000
export const maxValue = 100_000_000

export function feeEstimate(value: number) {
  if (!Number.isInteger(value) || value < minValue || value > maxValue) return null
  const fee = Math.ceil((value * feeRate) / 10) * 10
  return { fee, total: fee + Math.round(fee * vatRate) }
}
