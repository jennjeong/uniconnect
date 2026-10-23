import { Modal } from "../components/Modal"
import { metricInfo, metricKinds } from "../data/metrics"
import { formatWon, hasRoas, roasSummary, roasText } from "../lib/kpis"
import type { Metrics, Report } from "../types"

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
    <Modal name="report" kicker="Performance" title="성과 상세" onClose={onClose}>
      <div className="report-detail">
        <div className="report-detail-score">
          <span>추정 ROAS</span>
          <strong>{roasText(report)}</strong>
          <small>
            {hasRoas(report)
              ? `목표 ${report.targets.roas}%보다 ${roasSummary(report)}`
              : "협찬 가치를 정하면 ROAS가 계산돼요."}
          </small>
        </div>
        <div className="report-detail-rows">
          {metricKinds.map((kind) => (
            <div key={kind}>
              <span>{metricInfo[kind].label}</span>
              <strong>
                {metrics[kind].toLocaleString("ko-KR")}명
                <small> / 목표 {report.targets[kind]}명</small>
              </strong>
            </div>
          ))}
          <div>
            <span>도달 인원</span>
            <strong>{report.reach.toLocaleString("ko-KR")}명</strong>
          </div>
          <div>
            <span>협찬 가치</span>
            <strong>{formatWon(report.sponsorValue)}</strong>
          </div>
        </div>
        <button className="primary-button wide" onClick={onDownload} type="button">
          PDF 리포트 다운로드
        </button>
      </div>
    </Modal>
  )
}
