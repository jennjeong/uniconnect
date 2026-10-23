import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { measureState } from "../lib/measurements"
import type { EventMeasurement } from "../types"
import { Icon } from "./Icon"

// Which event the measurement and report pages show: the group's events,
// latest first, each with where its measurement stands.
export function EventPicker({
  measurements,
  value,
  onSelect,
}: {
  measurements: EventMeasurement[]
  value: string
  onSelect: (eventId: string) => void
}) {
  return (
    <label className="event-picker">
      <Icon name="calendar" size={15} />
      <select aria-label={t("행사 고르기")} onChange={(event) => onSelect(event.target.value)} value={value}>
        {measurements.map((item) => (
          <option key={item.eventId} value={item.eventId}>
            {item.report.eventName} · {formatFullDate(item.report.eventDate)} · {t(measureState(item.report))}
          </option>
        ))}
      </select>
    </label>
  )
}
