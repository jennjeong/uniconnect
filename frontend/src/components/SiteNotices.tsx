import { useEffect, useState } from "react"

import { api } from "../api"
import { t } from "../i18n"
import type { SiteNotice } from "../types"
import { Icon } from "./Icon"

const dismissedKey = "uniconnect-dismissed-notices"

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(dismissedKey) ?? "[]") as string[]
  } catch {
    return []
  }
}

// The operators' notices across the top of the page (posted from /admin),
// read again when the viewer changes; each closes for good in this browser.
export function SiteNotices({ viewer }: { viewer: string }) {
  const [notices, setNotices] = useState<SiteNotice[]>([])
  const [dismissed, setDismissed] = useState(readDismissed)
  useEffect(() => {
    let cancelled = false
    api.announcements().then(
      (result) => {
        if (!cancelled) setNotices(result.announcements)
      },
      // A notice is never worth an error on the page.
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [viewer])
  const shown = notices.filter((notice) => !dismissed.includes(notice.id))
  if (shown.length === 0) return null
  return (
    <div className="site-notices">
      {shown.map((notice) => (
        <p className={`site-notice ${notice.tone}`} key={notice.id} role={notice.tone === "warning" ? "alert" : "status"}>
          <Icon name={notice.tone === "warning" ? "bell" : "spark"} size={16} />
          <span>{notice.text}</span>
          <button
            aria-label={t("공지 닫기")}
            onClick={() => {
              const next = [...dismissed, notice.id]
              setDismissed(next)
              void api.dismissAnnouncement(notice.id).catch(() => undefined)
              try {
                localStorage.setItem(dismissedKey, JSON.stringify(next.slice(-50)))
              } catch {
                // Closed for this visit only.
              }
            }}
            type="button"
          >
            <Icon name="close" size={14} />
          </button>
        </p>
      ))}
    </div>
  )
}
