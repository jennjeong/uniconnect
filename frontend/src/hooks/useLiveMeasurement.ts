import { useEffect, useState } from "react"

import { api } from "../api"
import type { EventMeasurement, MetricEntry, Role } from "../types"

// How often the counts and the activity feed refresh while a page shows them.
const refreshMs = 10_000

// Refreshes one event's counts, report and latest records while mounted,
// handing the counts and report to `onUpdate`. `role` picks the demo side
// for visitors; the server ignores it once logged in.
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
          // Keep showing the last data; the next refresh tries again.
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
