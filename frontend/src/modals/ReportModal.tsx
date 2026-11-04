import { Modal } from "../components/Modal"
import { metricInfo, metricKinds } from "../data/metrics"
import { t } from "../i18n"
import { formatWon, hasRoas, roasText } from "../lib/kpis"
import type { Metrics, Report } from "../types"

// 목표 대비 ROAS로 만든 "목표 120%보다 43% 높았어요." 같은 문장(lib/kpis.ts의
// roasSummary가 계산한다). 보이는 언어로 쓴다.
function roasAgainstGoal(report: Report) {
  const goal = report.targets.roas
  const gain = Math.round((report.roas / Math.max(1, goal) - 1) * 100)
  return gain >= 0
    ? t("목표 {goal}%보다 {gain}% 높았어요.", { goal, gain })
    : t("목표 {goal}%보다 {gain}% 낮았어요.", { goal, gain: -gain })
}

export function ReportModal({
  report,
  metrics,
  onClose,
  onDownload,
}: {
  report: Report
  metrics: Metrics
  onClose: () => void
  onDownload: () => void
}) {
  return (
    <Modal name="report" kicker="Performance" title={t("성과 상세")} onClose={onClose}>
      <div className="report-detail">
        <div className="report-detail-score">
          <span>{t("추정 ROAS")}</span>
          <strong>{roasText(report)}</strong>
          <small>
            {hasRoas(report)
              ? roasAgainstGoal(report)
              : t("협찬 가치를 정하면 ROAS가 계산돼요.")}
          </small>
        </div>
        <div className="report-detail-rows">
          {metricKinds.map((kind) => (
            <div key={kind}>
              <span>{t(metricInfo[kind].label)}</span>
              <strong>
                {t("{count}명", { count: metrics[kind].toLocaleString("ko-KR") })}
                <small> / {t("목표 {count}명", { count: report.targets[kind] })}</small>
              </strong>
            </div>
          ))}
          <div>
            <span>{t("도달 인원")}</span>
            <strong>{t("{count}명", { count: report.reach.toLocaleString("ko-KR") })}</strong>
          </div>
          <div>
            <span>{t("협찬 가치")}</span>
            <strong>{formatWon(report.sponsorValue)}</strong>
          </div>
        </div>
        <button className="primary-button wide" onClick={onDownload} type="button">
          {t("PDF 리포트 다운로드")}
        </button>
      </div>
    </Modal>
  )
}
