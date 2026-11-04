// "2026. 11. 27."이나 "2026-11-27" 같은 값을 "2026-11-27"로 바로잡는다.
// 실제 달력에 있는 날이 아니면 undefined를 돌려준다.
export function toIsoDate(value: string) {
  const match = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(value.trim())
  if (!match) return undefined
  const [, year, month, day] = match
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return undefined
  return iso
}

// 어떤 날의 며칠 뒤(또는 앞)의 "YYYY-MM-DD".
export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

// 행사가 열리는 한국의 오늘 "YYYY-MM-DD". 서버의 시간대와 상관없다(호스팅은
// 보통 한국보다 9시간 늦은 UTC라서, 그대로 두면 오전 9시까지 어제로 나온다).
export function todayInKorea(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 한국 시계의 날짜와 시각.
export function hourInKorea(now = new Date()) {
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return { date: korea.toISOString().slice(0, 10), hour: korea.getUTCHours() }
}
