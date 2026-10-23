import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { achievement, formatKpi, kpiGap, kpiValue, type Kpi } from "../lib/kpis"

// Goal set before the event against the current value of one report number;
// everything turns green once the goal is met.
export function GoalModal({ kpi, onClose }: { kpi: Kpi; onClose: () => void }) {
  const rate = achievement(kpi)
  const achieved = rate >= 100
  // Leave room past the larger value so the goal marker never sits on the edge.
  const scale = Math.max(kpi.current, kpi.target) * 1.15 || 1

  return (
    <Modal name="goal" kicker="Goal tracking" title={kpi.label} onClose={onClose}>
      <div className={achieved ? "goal-body achieved" : "goal-body"}>
        <div className="goal-compare">
          <div>
            <span>기존 목표</span>
            <strong>{formatKpi(kpi.target, kpi.unit)}</strong>
          </div>
          <div className="current">
            <span>
              현재
              <em className="goal-badge">{achieved ? "달성" : "진행 중"}</em>
            </span>
            <strong>{kpiValue(kpi)}</strong>
          </div>
        </div>

        <div className="goal-progress">
          <div className="goal-track">
            <span className="goal-fill" style={{ width: `${(kpi.current / scale) * 100}%` }} />
            <span className="goal-marker" style={{ left: `${(kpi.target / scale) * 100}%` }}>
              <em>목표 {formatKpi(kpi.target, kpi.unit)}</em>
            </span>
          </div>
          <p className="goal-result">
            {achieved && <Icon name="check" size={15} />}
            <strong>{rate}% 달성</strong>
            <span>목표 대비 {kpiGap(kpi)}</span>
          </p>
        </div>

        <div className="goal-formula">
          <span>계산 방법</span>
          <p>{kpi.formula}</p>
        </div>
      </div>
    </Modal>
  )
}
