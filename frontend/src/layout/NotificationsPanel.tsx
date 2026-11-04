import { useContext, useRef, type RefObject } from "react"

import { Icon } from "../components/Icon"
import { ClosingContext } from "../components/Presence"
import { useDismiss } from "../hooks/useDismiss"
import { t } from "../i18n"
import type { NotificationItem } from "../lib/notifications"

// 상단 바의 종 아래로 내려오고, 닫으면 다시 올라간다. Escape나 패널과 종 바깥을
// 누르면 닫는다. 읽지 않은 알림은 아이콘에 점이 붙고, 모두 읽음으로 전부 읽음
// 처리한다.
export function NotificationsPanel({
  items,
  unread,
  toggleRef,
  onClose,
  onOpen,
  onReadAll,
}: {
  items: NotificationItem[]
  unread: (item: NotificationItem) => boolean
  // 종 모양 버튼. 패널은 이 버튼이 스스로 토글한다.
  toggleRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onOpen: (item: NotificationItem) => void
  onReadAll: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const closing = useContext(ClosingContext)

  useDismiss(panelRef, toggleRef, onClose, closing)

  return (
    <section
      aria-label={t("알림")}
      className={closing ? "notify-panel closing" : "notify-panel"}
      id="notifications-panel"
      ref={panelRef}
    >
      <div className="notify-head">
        <div>
          <span className="eyebrow">Notifications</span>
          <p className="notify-title">{t("새로운 소식")}</p>
        </div>
        {items.some(unread) && (
          <button className="notify-read-all" onClick={onReadAll} type="button">
            {t("모두 읽음")}
          </button>
        )}
      </div>
      <div className="notification-list stagger">
        {items.length === 0 ? (
          <p className="day-empty">{t("새로운 소식이 없어요.")}</p>
        ) : (
          items.map((item) => (
            <button className={unread(item) ? "unread" : undefined} key={item.key} onClick={() => onOpen(item)} type="button">
              <span className={item.good ? "notification-icon green" : "notification-icon"}>
                <Icon name={item.icon} size={18} />
              </span>
              <span>
                {unread(item) && <span className="sr-only">{t("읽지 않음")}</span>}
                <strong>{item.title}</strong>
                <small>{item.caption}</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ))
        )}
      </div>
    </section>
  )
}
