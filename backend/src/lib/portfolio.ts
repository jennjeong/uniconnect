import { finishedSponsorships } from "./sponsorships.js"
import type { Account, Database } from "../types.js"

// 캠퍼스 포트폴리오 (a Campus Partners brand's, lib/pro.ts): every finished
// sponsorship together, by school, by month and by the kind of group, with
// the best and weakest, and what a visit has cost so far for planning the
// next budget.

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

type Row = { spend: number; visits: number; coupons: number; sales: number }

function group<T extends string>(rows: (Row & { key: T })[]) {
  const totals = new Map<T, Row & { count: number }>()
  for (const row of rows) {
    const sum = totals.get(row.key) ?? { spend: 0, visits: 0, coupons: 0, sales: 0, count: 0 }
    sum.spend += row.spend
    sum.visits += row.visits
    sum.coupons += row.coupons
    sum.sales += row.sales
    sum.count += 1
    totals.set(row.key, sum)
  }
  return [...totals.entries()]
    .map(([key, sum]) => ({ key, ...sum, roas: percent(sum.sales, sum.spend) }))
    .sort((a, b) => b.roas - a.roas)
}

export function portfolio(database: Database, account: Account) {
  const rows = finishedSponsorships(database, account.id).map((sponsorship) => {
    const measurement = sponsorship.eventId
      ? database.measurements.find((item) => item.eventId === sponsorship.eventId)
      : undefined
    const owner = measurement && database.accounts.find((item) => item.id === measurement.accountId)
    const listing =
      (owner?.groupId && database.groups.find((item) => item.id === owner.groupId)) ||
      database.groups.find((item) => item.name === sponsorship.groupName)
    return {
      id: sponsorship.id,
      eventName: sponsorship.eventName,
      groupName: sponsorship.groupName,
      date: sponsorship.date,
      school: owner?.school || listing?.school || "",
      category: listing?.category ?? "",
      spend: sponsorship.spend,
      coupons: sponsorship.coupons,
      visits: sponsorship.visits,
      sales: sponsorship.sales,
      roas: percent(sponsorship.sales, sponsorship.spend),
    }
  })
  const spend = rows.reduce((sum, row) => sum + row.spend, 0)
  const visits = rows.reduce((sum, row) => sum + row.visits, 0)
  const sales = rows.reduce((sum, row) => sum + row.sales, 0)
  const ranked = [...rows].filter((row) => row.spend > 0).sort((a, b) => b.roas - a.roas)
  return {
    count: rows.length,
    totals: {
      spend,
      visits,
      coupons: rows.reduce((sum, row) => sum + row.coupons, 0),
      sales,
      roas: percent(sales, spend),
      costPerVisit: visits > 0 ? Math.round(spend / visits) : null,
      salesPerVisit: visits > 0 ? Math.round(sales / visits) : null,
    },
    bySchool: group(rows.map((row) => ({ ...row, key: row.school || "학교 미상" }))),
    byMonth: group(rows.map((row) => ({ ...row, key: row.date.slice(0, 7) }))).sort((a, b) => a.key.localeCompare(b.key)),
    byCategory: group(rows.map((row) => ({ ...row, key: row.category || "기타" }))),
    best: ranked[0] ?? null,
    weakest: ranked.length > 1 ? ranked.at(-1)! : null,
    rows,
  }
}

export type Portfolio = ReturnType<typeof portfolio>
