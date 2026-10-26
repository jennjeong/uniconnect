import { useContext, useEffect, useRef, type RefObject } from "react"

import { Icon } from "../components/Icon"
import { ClosingContext } from "../components/Presence"
import { t } from "../i18n"
import type { NotificationItem } from "../lib/notifications"

// Drops down under the bell in the top bar and slides back up when closed.
// Escape or a press anywhere outside the panel and its bell closes it.
export function NotificationsPanel({
  items,
  toggleRef,
  onClose,
  onOpen,
}: {
  items: NotificationItem[]
  // The bell, which toggles the panel itself.
  toggleRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onOpen: (item: NotificationItem) => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const closing = useContext(ClosingContext)

  useEffect(() => {
    if (closing) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !toggleRef.current?.contains(target)) onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    document.addEventListener("pointerdown", closeOutside)
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
      document.removeEventListener("pointerdown", closeOutside)
    }
  }, [closing, onClose, toggleRef])

  return (
    <section
      aria-label={t("알림")}
      className={closing ? "notify-panel closing" : "notify-panel"}
      id="notifications-panel"
      ref={panelRef}
    >
      <div className="notify-head">
        <span className="eyebrow">Notifications</span>
        <p className="notify-title">{t("새로운 소식")}</p>
      </div>
      <div className="notification-list stagger">
        {items.length === 0 ? (
          <p className="day-empty">{t("새로운 소식이 없어요.")}</p>
        ) : (
          items.map((item) => (
            <button key={item.key} onClick={() => onOpen(item)} type="button">
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
    </section>
  )
}
