import { Modal } from "../components/Modal"
import type { Metrics } from "../types"

export function ReportModal({
  metrics,
  onClose,
  onDownload,
}: {
  metrics: Metrics
  onClose: () => void
  onDownload: () => void
}) {
  return (
    <Modal name="report" kicker="PERFORMANCE" title="성과 상세" onClose={onClose}>
      <div className="report-detail">
        <div className="report-detail-score">
          <span>추정 ROAS</span>
          <strong>243%</strong>
          <small>목표 대비 +43%</small>
        </div>
        <div className="report-detail-rows">
          <div>
            <span>QR 스캔</span>
            <strong>{metrics.scans}명</strong>
          </div>
          <div>
            <span>쿠폰 수령</span>
            <strong>{metrics.coupons}명</strong>
          </div>
          <div>
            <span>방문 확인</span>
            <strong>{metrics.visits}명</strong>
          </div>
          <div>
            <span>예상 협찬 가치</span>
            <strong>680,000원</strong>
          </div>
        </div>
        <button className="primary-button wide" onClick={onDownload} type="button">
          리포트 다운로드
        </button>
      </div>
    </Modal>
  )
}
