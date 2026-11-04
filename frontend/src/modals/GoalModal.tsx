import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { achievement, formatKpi, kpiGap, kpiValue, type Kpi } from "../lib/kpis"

// 행사 전에 정한 목표를 리포트 숫자 하나의 현재 값과 견준다. 목표를 달성하면
// 모두 초록으로 바뀐다.
export function GoalModal({ kpi, onClose }: { kpi: Kpi; onClose: () => void }) {
  const rate = achievement(kpi)
  const achieved = rate >= 100
  // 큰 값보다 여유를 두어 목표 표시가 가장자리에 붙지 않게 한다.
  const scale = Math.max(kpi.current, kpi.target) * 1.15 || 1

  return (
    <Modal name="goal" kicker="Goal Tracking" title={t(kpi.label)} onClose={onClose}>
      <div className={achieved ? "goal-body achieved" : "goal-body"}>
        <div className="goal-compare">
          <div>
            <span>{t("기존 목표")}</span>
            <strong>{formatKpi(kpi.target, kpi.unit)}</strong>
          </div>
          <div className="current">
            <span>
              {t("현재")}
              <em className="goal-badge">{achieved ? t("달성") : t("진행 중")}</em>
            </span>
            <strong>{kpiValue(kpi)}</strong>
          </div>
        </div>

        <div className="goal-progress">
          <div className="goal-track">
            <span className="goal-fill" style={{ width: `${(kpi.current / scale) * 100}%` }} />
            <span className="goal-marker" style={{ left: `${(kpi.target / scale) * 100}%` }}>
              <em>{t("목표 {target}", { target: formatKpi(kpi.target, kpi.unit) })}</em>
            </span>
          </div>
          <p className="goal-result">
            {achieved && <Icon name="check" size={15} />}
            <strong>{t("{rate}% 달성", { rate })}</strong>
            <span>{t("목표 대비 {gap}", { gap: kpiGap(kpi) })}</span>
          </p>
        </div>

        <div className="goal-formula">
          <span>{t("계산 방법")}</span>
          <p>{kpi.formula}</p>
        </div>
      </div>
    </Modal>
  )
}
