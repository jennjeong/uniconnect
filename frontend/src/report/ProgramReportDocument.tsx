import { t } from "../i18n"
import { formatDay } from "../lib/date"
import { formatWon } from "../lib/kpis"
import type { Program, ProgramReport } from "../types"
import { PageFooter, PageHeader } from "./ReportDocument"

// 페이지에 들어가는 학교 줄의 수다. 나머지는 CSV에 다 있다.
const shownRows = 14

// A4 한 페이지(794×1123 px): 캠퍼스 캠페인의 통합 보고(#403). 화면과 같은 보고로
// 합계와 학교별 이행·측정을 담는다.
export function ProgramReportDocument({ program, report, author, sample }: { program: Program; report: ProgramReport; author: string; sample: boolean }) {
  const { totals } = report
  const brief = program.brief
  const rows = report.schools.slice(0, shownRows)
  return (
    <div className="pdf-page">
      <PageHeader author={author} sample={sample} />

      <div className="pdf-title">
        <span>CAMPUS CAMPAIGN REPORT</span>
        <h1>{brief.name}</h1>
        <p>{[brief.product, brief.from === brief.to ? brief.from : `${brief.from} – ${brief.to}`].join(" · ")}</p>
      </div>

      <section className="pdf-section">
        <h2>{t("핵심 지표")}</h2>
        <div className="pdf-kpis">
          <div className="pdf-kpi">
            <span>{t("계약한 학교")}</span>
            <strong>{t("{count}곳", { count: totals.confirmed })}</strong>
            <small>{t("제안 {sent}곳 · 수락 {accepted}곳 · 행사 완료 {finished}곳", { sent: totals.sent, accepted: totals.accepted, finished: totals.finished })}</small>
          </div>
          <div className="pdf-kpi">
            <span>{t("매장 방문")}</span>
            <strong>{t("{visits}명", { visits: totals.visits.toLocaleString("ko-KR") })}</strong>
            <small>{t("쿠폰 {coupons}장 · QR {scans}회", { coupons: totals.coupons.toLocaleString("ko-KR"), scans: totals.scans.toLocaleString("ko-KR") })}</small>
          </div>
          <div className="pdf-kpi">
            <span>{t("방문 1건당 비용")}</span>
            <strong>{totals.costPerVisit === null ? "—" : formatWon(totals.costPerVisit)}</strong>
            <small>{t("캠페인 비용 {cost} (운영비 + 실비)", { cost: formatWon(totals.cost) })}</small>
          </div>
          <div className="pdf-kpi">
            <span>{t("단체 이행")}</span>
            <strong>
              {totals.itemsDone}/{totals.itemsTotal}
            </strong>
            <small>{t("증빙 {count}건 · 추정 매출 {sales}", { count: totals.proofs, sales: formatWon(totals.sales) })}</small>
          </div>
        </div>
      </section>

      <section className="pdf-section">
        <h2>{t("학교별 결과")}</h2>
        <table className="pdf-log">
          <thead>
            <tr>
              <th>{t("학교")}</th>
              <th>{t("캠페인")}</th>
              <th>{t("상태")}</th>
              <th>{t("이행")}</th>
              <th>{t("쿠폰")}</th>
              <th>{t("방문")}</th>
              <th>{t("추정 매출")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.groupId}>
                <td>
                  {row.name}
                  <br />
                  {row.school}
                </td>
                <td>
                  {row.eventName}
                  <br />
                  {row.date ? formatDay(row.date) : ""}
                </td>
                <td>{t(row.state)}</td>
                <td>
                  {row.itemsDone}/{row.itemsTotal}
                </td>
                <td>{row.coupons.toLocaleString("ko-KR")}</td>
                <td>{row.visits.toLocaleString("ko-KR")}</td>
                <td>
                  {formatWon(row.sales)}
                  {row.sharedWith > 1 && (
                    <>
                      <br />
                      {t("{count}곳 함께 집계", { count: row.sharedWith })}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.schools.length > shownRows && <p>{t("나머지 {count}곳은 CSV에 있어요.", { count: report.schools.length - shownRows })}</p>}
      </section>

      <PageFooter note={t("uniconnect · 캠퍼스 캠페인 보고 · 각 학교 행사의 측정 데이터로 만들었어요.")} page={1} total={1} />
    </div>
  )
}
