import { venueKinds } from "../data/metrics"
import { methodInfo, methodKinds } from "../data/methods"
import type { EventMeasurement, MetricKind, Report } from "../types"
import { todayIso } from "./date"

// 오늘 기준 행사 측정의 상태: 행사 전(진행 전), 행사 기간(측정 중), 끝난
// 뒤(진행 완료).
export function measureState(report: Report, today = todayIso()) {
  if (report.eventDate > today) return "진행 전"
  return (report.eventEndDate ?? report.eventDate) >= today ? "측정 중" : "진행 완료"
}

// 최근 순 목록에서 측정 페이지가 열 행사: 이미 시작한 것(진행 중인 행사, 없으면
// 가장 최근에 열린 행사), 그것도 없으면 다음에 올 행사.
export function defaultMeasurement(list: EventMeasurement[], today = todayIso()) {
  return list.find((item) => item.report.eventDate <= today) ?? list.at(-1)
}

// 결과가 행사에 대해 보여주는 집계: 전자계약서에서 양쪽이 확정한 방식의 것이다
// (스폰서가 생기기 전에는 행사 자신의 것, 그 뒤에는 스폰서의 것). 방식의 순서를
// 따른다.
export function shownKindsOf(report: Report): MetricKind[] {
  const methods = report.sponsors?.length ? report.sponsors.flatMap((sponsor) => sponsor.methods) : report.methods
  return methodKinds
    .filter((kind) => methods.some((method) => method.kind === kind))
    .map((kind) => methodInfo[kind].metric)
}

// 그중 현장에서 센 값.
export const venueKindsOf = (report: Report) => shownKindsOf(report).filter((kind) => venueKinds.includes(kind))
