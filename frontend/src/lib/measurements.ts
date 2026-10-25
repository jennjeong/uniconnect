import { venueKinds } from "../data/metrics"
import { methodInfo, methodKinds } from "../data/methods"
import type { EventMeasurement, MetricKind, Report } from "../types"
import { todayIso } from "./date"

// Where an event's measurement stands today: before the event (진행 전),
// on its days (측정 중), or once it is over (진행 완료).
export function measureState(report: Report, today = todayIso()) {
  if (report.eventDate > today) return "진행 전"
  return (report.eventEndDate ?? report.eventDate) >= today ? "측정 중" : "진행 완료"
}

// The event the measurement pages open on, from a list latest first: one
// that has started (the one under way, or else the latest that took
// place), or else the next to come.
export function defaultMeasurement(list: EventMeasurement[], today = todayIso()) {
  return list.find((item) => item.report.eventDate <= today) ?? list.at(-1)
}

// The counts the results show for an event: those of the methods both
// sides confirmed on the e-contracts (its own before any sponsor, else any
// sponsor's), in the methods' order.
export function shownKindsOf(report: Report): MetricKind[] {
  const methods = report.sponsors?.length ? report.sponsors.flatMap((sponsor) => sponsor.methods) : report.methods
  return methodKinds
    .filter((kind) => methods.some((method) => method.kind === kind))
    .map((kind) => methodInfo[kind].metric)
}

// The venue's counts among them.
export const venueKindsOf = (report: Report) => shownKindsOf(report).filter((kind) => venueKinds.includes(kind))
