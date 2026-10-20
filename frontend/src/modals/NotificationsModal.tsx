import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import type { NavLabel } from "../types"

export function NotificationsModal({
  onClose,
  onOpen,
}: {
  onClose: () => void
  onOpen: (label: NavLabel) => void
}) {
  return (
    <Modal name="notifications" kicker="NOTIFICATIONS" title="새로운 소식" onClose={onClose}>
      <div className="notification-list">
        <button onClick={() => onOpen("추천 매칭")} type="button">
          <span className="notification-icon">
            <Icon name="spark" size={18} />
          </span>
          <span>
            <strong>새 추천 매칭 3건</strong>
            <small>종강 공연과 잘 맞는 파트너를 찾았어요.</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button onClick={() => onOpen("리포트")} type="button">
          <span className="notification-icon green">
            <Icon name="chart" size={18} />
          </span>
          <span>
            <strong>성과 리포트가 완성됐어요</strong>
            <small>가을 버스킹 데이 · ROAS 243%</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
    </Modal>
  )
}
