import { Modal } from "../components/Modal"
import { PlanCard } from "../components/PlanCard"
import { t } from "../i18n"

// 요금제 보기 from 성과 분석: the plans side by side and the button that pays
// for 캠퍼스 파트너스, right where the brand asked, without leaving the page.
export function PlanModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  return (
    <Modal kicker="Plans" name="plan" onClose={onClose} title={t("요금제 고르기")}>
      <div className="plan-modal">
        <PlanCard onNotice={onNotice} />
      </div>
    </Modal>
  )
}
