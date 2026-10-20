import { useEffect, useRef, type RefObject } from "react"

import { Icon } from "../components/Icon"
import type { NotificationItem } from "../lib/notifications"
import type { NavLabel } from "../types"

// Drops down under the bell in the top bar. Escape or a press anywhere
// outside the panel and its bell closes it.
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
  onOpen: (label: NavLabel) => void
}) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
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
  }, [onClose, toggleRef])

  return (
    <section aria-label="알림" className="notify-panel" id="notifications-panel" ref={panelRef}>
      <div className="notify-head">
        <span className="section-kicker dark">NOTIFICATIONS</span>
        <p className="section-title">새로운 소식</p>
      </div>
      <div className="notification-list stagger">
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
    </section>
  )
}
