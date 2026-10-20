import { Icon } from "../components/Icon"
import { percent } from "../lib/format"
import type { Metrics } from "../types"

// Expected audience the QR participation rate is measured against.
const expectedAudience = 350

export function ReportsPage({
  metrics,
  onDownload,
  onOpenReport,
}: {
  metrics: Metrics
  onDownload: () => void
  onOpenReport: () => void
}) {
  return (
    <section className="page-view">
      <div className="section-heading-row view-heading">
        <div>
          <span className="section-kicker dark">PERFORMANCE REPORTS</span>
          <p className="section-title">성과 리포트</p>
        </div>
        <button className="primary-button" onClick={onDownload} type="button">
          리포트 다운로드
        </button>
      </div>
      <div className="report-overview">
        <article className="report-hero">
          <span>가을 버스킹 데이 · 2026. 10. 12.</span>
          <p>
            협찬 성과가 목표보다
            <br />
            <em>43% 높았어요.</em>
          </p>
          <button className="text-link" onClick={onOpenReport} type="button">
            상세 데이터 보기 <Icon name="arrow" size={18} />
          </button>
        </article>
        <div className="report-metric-grid">
          <article>
            <span>도달 인원</span>
            <strong>1,240</strong>
            <small>목표 대비 112%</small>
          </article>
          <article>
            <span>QR 참여율</span>
            <strong>{percent(metrics.scans, expectedAudience)}%</strong>
            <small>{metrics.scans}명 참여</small>
          </article>
          <article>
            <span>방문 전환율</span>
            <strong>{percent(metrics.visits, metrics.scans)}%</strong>
            <small>{metrics.visits}명 방문</small>
          </article>
          <article>
            <span>추정 ROAS</span>
            <strong>243%</strong>
            <small>협찬 가치 68만원</small>
          </article>
        </div>
      </div>
    </section>
  )
}
