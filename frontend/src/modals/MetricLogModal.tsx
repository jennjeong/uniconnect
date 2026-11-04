import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { metricInfo } from "../data/metrics"
import { t } from "../i18n"
import { formatDateTime, formatFullDate } from "../lib/date"
import type { MetricEntry, MetricKind, Role } from "../types"

// 측정 수치 하나(또는 전체)의 바탕이 된 최근 참여 기록. 행사 전에는 행사가
// 열리면 여기에 보일 내용을 알려 준다.
export function MetricLogModal({
  eventId,
  role,
  kind,
  total,
  startsOn,
  onClose,
}: {
  eventId: string
  role: Role
  kind?: MetricKind
  total: number
  // 행사가 아직 오지 않았을 때(진행 전) 행사의 첫날.
  startsOn?: string
  onClose: () => void
}) {
  const [entries, setEntries] = useState<MetricEntry[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (startsOn) return
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
  }, [eventId, kind, role, startsOn])

  return (
    <Modal
      name="metric-log"
      kicker="Participation Log"
      title={kind ? t("{metric} 참여 내역", { metric: t(metricInfo[kind].label) }) : t("전체 참여 내역")}
      onClose={onClose}
    >
      {startsOn ? (
        <div className="log-wait">
          <Icon name="calendar" size={22} />
          <strong>{t("행사가 진행되면 참여 내역이 여기에 떠요")}</strong>
          <span>
            {t("{date}부터 QR 스캔 · 쿠폰 · 매장 방문이 들어오는 대로 쌓여요.", { date: formatFullDate(startsOn) })}
          </span>
        </div>
      ) : (
        <>
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
        </>
      )}
    </Modal>
  )
}
