import { todayInKorea } from "./dates.js"
import { withLiveFigures } from "./sponsorships.js"
import type { Account, Database } from "../types.js"

// 브랜드의 분기별 협찬 예산(#336). 브랜드가 분기마다 예산을 적고, 그 분기에 날짜가 든
// 협찬의 금액(현금과 현물, 행사 측정의 몫)을 더해 집행과 예정으로 나눈다.
// - 집행: 행사 날이 지난 협찬. 성과 분석의 누적 집행액과 같은 기준이다.
// - 예정: 수락했고 아직 날이 오지 않은 협찬. 취소된 협찬은 기록에서 빠지므로 세지 않는다.
// - 금액이 정해지지 않은 협찬(0원)은 더하지 않고 건수만 따로 센다.

export const budgetLimits = {
  // 지난 분기를 몇 개까지 보여 주고 고칠 수 있는지, 다가올 분기를 몇 개까지인지.
  past: 3,
  ahead: 2,
  // 한 분기 예산의 최대(원).
  maxAmount: 10_000_000_000,
}

export type Quarter = `${number}-Q${1 | 2 | 3 | 4}`

// "YYYY-MM-DD"가 든 분기.
export const quarterOf = (date: string) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}` as Quarter

const shift = (quarter: string, by: number) => {
  const index = Number(quarter.slice(0, 4)) * 4 + Number(quarter.slice(6)) - 1 + by
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}` as Quarter
}

// 보여 주고 고칠 수 있는 분기들, 오래된 것부터.
export function budgetQuarters(today = todayInKorea()) {
  const current = quarterOf(today)
  return Array.from({ length: budgetLimits.past + 1 + budgetLimits.ahead }, (_, index) => shift(current, index - budgetLimits.past))
}

// 분기의 첫날과 마지막 날("YYYY-MM-DD").
export function quarterRange(quarter: string) {
  const year = quarter.slice(0, 4)
  const first = (Number(quarter.slice(6)) - 1) * 3 + 1
  const last = new Date(Date.UTC(Number(year), first + 2, 0)).getUTCDate()
  return { start: `${year}-${String(first).padStart(2, "0")}-01`, end: `${year}-${String(first + 2).padStart(2, "0")}-${last}` }
}

export type BudgetQuarter = {
  quarter: Quarter
  start: string
  end: string
  budget: number | null
  spent: number
  planned: number
  count: number
  unpriced: number
}

export function budgetView(database: Database, account: Account, today = todayInKorea()) {
  const quarters = budgetQuarters(today)
  const rows = new Map<string, BudgetQuarter>(
    quarters.map((quarter) => [
      quarter,
      { quarter, ...quarterRange(quarter), budget: account.budgets?.[quarter] ?? null, spent: 0, planned: 0, count: 0, unpriced: 0 },
    ]),
  )
  for (const item of database.sponsorships[account.id] ?? []) {
    if (!item.date) continue
    const row = rows.get(quarterOf(item.date))
    if (!row) continue
    const { spend } = withLiveFigures(database, item)
    row.count += 1
    if (!spend) row.unpriced += 1
    else if (item.date <= today) row.spent += spend
    else row.planned += spend
  }
  return { current: quarterOf(today), quarters: [...rows.values()].reverse() }
}

// 예산 한 분기를 정하거나(amount) 지운다(null). 보이는 분기만 받고, 그 밖의 오래된 값은 버린다.
export function setBudget(account: Account, quarter: unknown, amount: unknown, today = todayInKorea()) {
  const quarters = budgetQuarters(today)
  if (typeof quarter !== "string" || !quarters.includes(quarter as Quarter)) return "quarter" as const
  if (amount !== null && (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > budgetLimits.maxAmount)) {
    return "amount" as const
  }
  const kept = Object.fromEntries(Object.entries(account.budgets ?? {}).filter(([key]) => quarters.includes(key as Quarter) && key !== quarter))
  if (amount !== null) kept[quarter] = amount
  if (Object.keys(kept).length > 0) account.budgets = kept
  else delete account.budgets
  return "ok" as const
}
