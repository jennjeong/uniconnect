import { useEffect, useState } from "react"

import { api } from "../api"
import type { EventMeasurement, MetricEntry, Role } from "../types"

// 페이지가 보여 주는 동안 카운트와 활동 피드를 새로 고치는 주기.
const refreshMs = 10_000

// 마운트되어 있는 동안 한 행사의 카운트, 리포트, 최근 기록을 새로 고치고
// 카운트와 리포트를 `onUpdate`에 넘긴다. `role`은 방문자에게 보여 줄 데모 쪽을
// 고르며, 서버는 로그인한 뒤에는 이를 무시한다.
export function useLiveMeasurement(
  eventId: string | undefined,
  role: Role,
  onUpdate: (measurement: EventMeasurement) => void,
) {
  const [entries, setEntries] = useState<MetricEntry[]>([])

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    setEntries([])
    const load = () =>
      Promise.all([api.measurementLog(eventId, undefined, role), api.measurement(eventId, role)])
        .then(([log, latest]) => {
          if (cancelled) return
          setEntries(log.entries)
          onUpdate({ eventId, ...latest })
        })
        .catch(() => {
          // 마지막 데이터를 계속 보여 준다. 다음 새로 고침에서 다시 시도한다.
        })
    load()
    const timer = window.setInterval(load, refreshMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [eventId, role, onUpdate])

  return entries
}
