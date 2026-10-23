import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { metricInfo } from "../data/metrics"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import type { MetricEntry, MetricKind, Role } from "../types"

// Recent participation records behind one measurement count, or all of them.
export function MetricLogModal({
  eventId,
  role,
  kind,
  total,
  onClose,
}: {
  eventId: string
  role: Role
  kind?: MetricKind
  total: number
  onClose: () => void
}) {
  const [entries, setEntries] = useState<MetricEntry[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    api
      .measurementLog(eventId, kind, role)
      .then((result) => {
        if (!cancelled) setEntries(result.entries)
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [eventId, kind, role])

  return (
    <Modal
      name="metric-log"
      kicker="Participation Log"
      title={kind ? t("{metric} 참여 내역", { metric: t(metricInfo[kind].label) }) : t("전체 참여 내역")}
      onClose={onClose}
    >
      <p className="log-summary">
        {t("누적")} <strong>{t("{count}건", { count: total })}</strong>
        {entries && ` · ${t("최근 {count}건을 보여드려요", { count: entries.length })}`}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {entries && entries.length === 0 && <p className="day-empty">{t("아직 기록이 없어요.")}</p>}
      <ol className="log-list">
        {entries?.map((entry) => (
          <li key={entry.id}>
            <span className="log-time">{formatDateTime(entry.at)}</span>
            <div>
              <strong>
                {entry.participant}
                {!kind && <em className={`activity-kind kind-${entry.kind}`}>{t(metricInfo[entry.kind].label)}</em>}
              </strong>
              <span>{t(entry.detail)}</span>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  )
}
