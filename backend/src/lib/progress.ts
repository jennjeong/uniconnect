import { todayInKorea } from "./dates.js"
import { checkInWindow } from "./measurements.js"
import type { Database } from "../types.js"

// 수락된 협찬이 실제로 어디까지 왔는지. 날짜가 지났다는 것만으로 완료로 치지 않고
// 행사의 측정 기록으로 판단한다(components/RequestProgress.tsx가 보인다).
// - executedAt: 행사에서 처음 무언가(스캔, 쿠폰, 방문, 현장 집계)가 기록된 때
// - reportedAt: 기록이 있고 방문 집계 기간이 끝나 결과가 굳은 때
// 둘 다 없으면 화면은 예정일만 보이고, 예정일이 지났으면 '확인 필요'로 보인다.
export function deliveryProgress(
  database: Database,
  eventId: string | undefined,
  today = todayInKorea(),
): { executedAt?: string; reportedAt?: string } {
  if (!eventId) return {}
  const measurement = database.measurements.find((item) => item.eventId === eventId)
  const event = Object.values(database.events)
    .flat()
    .find((item) => item.id === eventId)
  if (!measurement || !event) return {}
  const counted = Object.values(measurement.metrics).some((value) => typeof value === "number" && value > 0)
  if (!counted) return {}
  const days = Object.keys(measurement.daily ?? {}).sort()
  const executedAt = measurement.log[0]?.at.slice(0, 10) ?? days[0] ?? event.date
  const { visitsEnd } = checkInWindow(event)
  return { executedAt, ...(today > visitsEnd ? { reportedAt: visitsEnd } : {}) }
}
