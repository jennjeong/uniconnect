import { t } from "../i18n"
import type { Program, ProgramReport } from "../types"
import { toCsv } from "./csv"

// 캠퍼스 캠페인 통합 보고의 CSV(#403). 화면과 PDF가 쓰는 같은 보고에서, 화면 언어로
// 합계를 먼저, 학교별 줄을 그다음에 쓴다. 함께 집계한 학교는 그 수를 남긴다.
export function programReportCsv(program: Program, report: ProgramReport, { sample = false } = {}): string {
  const { totals } = report
  const rows: (string | number)[][] = [
    [t("캠페인"), program.brief.name],
    ...(sample ? [[t("데이터 구분"), t("예시 데이터")]] : []),
    [],
    [t("항목"), t("값")],
    [t("제안 보낸 학교"), totals.sent],
    [t("수락한 학교"), totals.accepted],
    [t("계약 확인한 학교"), totals.confirmed],
    [t("행사를 마친 학교"), totals.finished],
    [t("단체 이행 항목"), `${totals.itemsDone}/${totals.itemsTotal}`],
    [t("증빙"), totals.proofs],
    [t("QR 스캔"), totals.scans],
    [t("쿠폰"), totals.coupons],
    [t("매장 방문"), totals.visits],
    [t("현장 확인"), totals.venue],
    [t("추정 매출 (원)"), totals.sales],
    [t("캠페인 비용 (원, 운영비 부가세 별도 + 실비)"), totals.cost],
    [t("방문 1건당 비용 (원)"), totals.costPerVisit ?? ""],
    [],
    [
      t("학교"),
      t("단체"),
      t("캠페인"),
      t("날짜"),
      t("상태"),
      t("단체 이행 항목"),
      t("증빙"),
      t("QR 스캔"),
      t("쿠폰"),
      t("매장 방문"),
      t("현장 확인"),
      t("추정 매출 (원)"),
      t("함께 집계한 학교"),
    ],
    ...report.schools.map((row) => [
      row.school,
      row.name,
      row.eventName,
      row.date,
      t(row.state),
      `${row.itemsDone}/${row.itemsTotal}`,
      row.proofs,
      row.scans,
      row.coupons,
      row.visits,
      row.venue,
      row.sales,
      row.sharedWith > 1 ? row.sharedWith : "",
    ]),
  ]
  return toCsv(rows)
}
