import { venueKinds } from "../data/metrics"
import { methodInfo } from "../data/methods"
import type { EventMeasurement, MetricKind, Report } from "../types"
import { todayIso } from "./date"

// Where an event's measurement stands today: before the event (진행 전),
// on its days, or after.
export function measureState(report: Report, today = todayIso()) {
  if (report.eventDate > today) return "진행 전"
  return (report.eventEndDate ?? report.eventDate) >= today ? "측정 중" : "측정 완료"
}

// The event the measurement pages open on, from a list latest first: one
// that has started (the one under way, or else the latest that took
// place), or else the next to come.
export function defaultMeasurement(list: EventMeasurement[], today = todayIso()) {
  return list.find((item) => item.report.eventDate <= today) ?? list.at(-1)
}

// The venue counts an event is measured by: its own methods before any
// sponsor, else any of its sponsors'.
export function venueKindsOf(report: Report): MetricKind[] {
  const methods = report.sponsors?.length ? report.sponsors.flatMap((sponsor) => sponsor.methods) : report.methods
  return venueKinds.filter((kind) => methods.some((method) => methodInfo[method.kind].metric === kind))
}
