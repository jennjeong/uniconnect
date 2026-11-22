// 한국 시간으로 at부터 영업일(월~금) n일 뒤의 끝(그날 23:59:59.999 KST)이다.
// 1:1 섭외 요청의 답 기한(3영업일, 2026-11-22 운영 결정)에 쓴다. 공휴일은 세지 않는다.
const kstOffset = 9 * 3_600_000
const dayMs = 86_400_000

export function businessDeadline(at: string, days: number) {
  const start = new Date(Date.parse(at) + kstOffset)
  let day = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  let left = days
  while (left > 0) {
    day += dayMs
    const weekday = new Date(day).getUTCDay()
    if (weekday !== 0 && weekday !== 6) left -= 1
  }
  return new Date(day + dayMs - 1 - kstOffset)
}

export const partnerReplyDays = 3
