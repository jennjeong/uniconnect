import { Modal } from "../components/Modal"
import { PlanCard } from "../components/PlanCard"
import { t } from "../i18n"

// 성과 분석의 요금제 보기. 요금제를 나란히 보여 주고 Growth를 결제하는
// 버튼을 브랜드가 물은 자리에서 페이지를 떠나지 않고 제공한다.
export function PlanModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  return (
    <Modal kicker="Plans" name="plan" onClose={onClose} title={t("요금제 고르기")}>
      <div className="plan-modal">
        <PlanCard onNotice={onNotice} />
      </div>
    </Modal>
  )
}
