import { findListing } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import type { Database } from "../types.js"

// 대학별 · 시기별 행사 수요다(#344). 브랜드가 언제 어느 학교에 협찬할지 정하도록, 학생단체의
// 행사 수를 학교와 달(첫날이 든 달)로 묶는다. 이름 없이 수만 보낸다.
// - 기간: 지난 6달부터 이번 달 뒤 11달까지(18달).
// - 목록에서 숨긴 단체의 행사도 센다. 수만 나가므로 숨긴 단체가 드러나지 않는다.
// - 데모 계정과 정지된 계정의 행사는 세지 않는다. 브랜드의 캠페인도 세지 않는다.
// - 한 칸이 demandMinimum보다 적으면 어느 단체인지 짐작될 수 있어 그 칸을 보내지 않는다.
//   합계도 보내지 않는다(합계에서 보인 칸을 빼면 숨긴 칸이 드러나므로).
export const demandWindow = { past: 6, ahead: 11 }
export const demandMinimum = 3

// "YYYY-MM"에서 by달 옮긴 달.
export function shiftMonth(month: string, by: number) {
  const [year, value] = month.split("-").map(Number)
  const index = year * 12 + value - 1 + by
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

export function eventDemand(database: Database, today = todayInKorea()) {
  const current = today.slice(0, 7)
  const from = shiftMonth(current, -demandWindow.past)
  const to = shiftMonth(current, demandWindow.ahead)
  const demo = new Set(Object.values(database.demoAccountIds))
  const tally = new Map<string, { school: string; month: string; count: number }>()
  for (const owner of database.accounts) {
    if (owner.role !== "학생단체" || demo.has(owner.id) || owner.suspendedAt) continue
    // 목록의 학교가 먼저다. 소개를 아직 쓰지 않은 단체는 가입할 때의 학교다.
    const school = (findListing(database, owner)?.school ?? owner.school ?? "").trim()
    if (!school) continue
    for (const event of database.events[owner.id] ?? []) {
      const month = event.date.slice(0, 7)
      if (month < from || month > to) continue
      const key = `${school}\u0000${month}`
      const cell = tally.get(key) ?? { school, month, count: 0 }
      cell.count += 1
      tally.set(key, cell)
    }
  }
  const cells = [...tally.values()]
    .filter((cell) => cell.count >= demandMinimum)
    .sort((a, b) => a.school.localeCompare(b.school, "ko") || a.month.localeCompare(b.month))
  return { from, to, current, minimum: demandMinimum, cells }
}
