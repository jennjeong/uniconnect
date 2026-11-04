import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { measureState } from "../lib/measurements"
import type { EventMeasurement } from "../types"
import { Icon } from "./Icon"

// 측정·리포트 페이지가 보여 줄 행사를 고른다. 그룹의 행사를 최신순으로 늘어놓고
// 측정이 어디까지 왔는지 함께 보여 준다.
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
