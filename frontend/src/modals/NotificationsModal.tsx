import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import type { NotificationItem } from "../lib/notifications"
import type { NavLabel } from "../types"

export function NotificationsModal({
  items,
  onClose,
  onOpen,
}: {
  items: NotificationItem[]
  onClose: () => void
  onOpen: (label: NavLabel) => void
}) {
  return (
    <Modal name="notifications" kicker="NOTIFICATIONS" title="새로운 소식" onClose={onClose}>
      <div className="notification-list">
        {items.length === 0 ? (
          <p className="day-empty">새로운 소식이 없어요.</p>
        ) : (
          items.map((item) => (
            <button key={item.key} onClick={() => onOpen(item.target)} type="button">
              <span className={item.good ? "notification-icon green" : "notification-icon"}>
                <Icon name={item.icon} size={18} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.caption}</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
