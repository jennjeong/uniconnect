import { Icon, type IconName } from "../components/Icon"
import type { MetricKind, Metrics } from "../types"

const liveCards: { kind: MetricKind; label: string; icon: IconName }[] = [
  { kind: "scans", label: "QR 스캔", icon: "scan" },
  { kind: "coupons", label: "쿠폰 수령", icon: "file" },
  { kind: "visits", label: "매장 방문", icon: "store" },
]

const testButtons: { kind: MetricKind; label: string }[] = [
  { kind: "scans", label: "QR 스캔 +1" },
  { kind: "coupons", label: "쿠폰 수령 +1" },
  { kind: "visits", label: "방문 확인 +1" },
]

export function MeasurementPage({
  metrics,
  onOpenQr,
  onRecord,
}: {
  metrics: Metrics
  onOpenQr: () => void
  onRecord: (kind: MetricKind) => void
}) {
  return (
    <section className="page-view measurement-view">
      <div className="view-intro measurement-intro">
        <div>
          <span className="section-kicker">LIVE ATTRIBUTION</span>
          <p>현장 반응을 실시간으로 측정해요</p>
          <small>고유 QR과 쿠폰 데이터를 행사 성과로 안전하게 집계합니다.</small>
        </div>
        <button className="primary-button" onClick={onOpenQr} type="button">
          <Icon name="scan" size={18} /> 현장 QR 열기
        </button>
      </div>
      <div className="live-metrics">
        {liveCards.map((card) => (
          <article className="live-card" key={card.kind}>
            <div className="live-icon">
              <Icon name={card.icon} />
            </div>
            <span>{card.label}</span>
            <strong>{metrics[card.kind]}</strong>
            <small>가을 버스킹 데이</small>
          </article>
        ))}
      </div>
      <div className="measurement-console">
        <div>
          <span className="section-kicker dark">MVP DEMO CONTROL</span>
          <p className="section-title">측정 이벤트 테스트</p>
          <small>파일럿에서는 실제 QR·쿠폰 로그가 자동으로 반영됩니다.</small>
        </div>
        <div className="console-actions">
          {testButtons.map((button) => (
            <button
              key={button.kind}
              onClick={() => onRecord(button.kind)}
              type="button"
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
