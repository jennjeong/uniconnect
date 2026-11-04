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

// 페이지 맨 위에 보이는 운영진 공지 (/admin에서 올린다). 보는 사람이 바뀌면
// 다시 읽고, 공지마다 이 브라우저에서는 영구히 닫을 수 있다.
export function SiteNotices({ viewer }: { viewer: string }) {
  const [notices, setNotices] = useState<SiteNotice[]>([])
  const [dismissed, setDismissed] = useState(readDismissed)
  useEffect(() => {
    let cancelled = false
    api.announcements().then(
      (result) => {
        if (!cancelled) setNotices(result.announcements)
      },
      // 공지 때문에 페이지에 오류를 띄우지는 않는다.
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
                // 이번 방문에서만 닫는다.
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
