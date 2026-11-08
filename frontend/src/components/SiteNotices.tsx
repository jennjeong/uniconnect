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

// 공지의 판: 운영진이 글을 고치면 판이 바뀌어, 닫았던 공지도 다시 보인다.
const versionOf = (notice: SiteNotice) => {
  let hash = 0
  for (const char of notice.text) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `${notice.id}:${(hash >>> 0).toString(36)}`
}

// 페이지 맨 위에 보이는 운영진 공지 (/admin에서 올린다). 첫 화면을 덜 차지하도록
// 한 줄로 보이고 '자세히'로 펼친다. 보는 사람이 바뀌면 다시 읽고, 공지의 판마다
// 이 브라우저에서는 닫아 둘 수 있다.
export function SiteNotices({ viewer }: { viewer: string }) {
  const [notices, setNotices] = useState<SiteNotice[]>([])
  const [dismissed, setDismissed] = useState(readDismissed)
  const [open, setOpen] = useState<string[]>([])
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
  const shown = notices.filter((notice) => !dismissed.includes(versionOf(notice)))
  if (shown.length === 0) return null
  return (
    <div className="site-notices">
      {shown.map((notice) => (
        <p
          className={`site-notice ${notice.tone}${open.includes(notice.id) ? " open" : ""}`}
          key={notice.id}
          role={notice.tone === "warning" ? "alert" : "status"}
        >
          <Icon name={notice.tone === "warning" ? "bell" : "spark"} size={16} />
          <span className="site-notice-text">{notice.text}</span>
          {!open.includes(notice.id) && (
            <button className="site-notice-more" onClick={() => setOpen([...open, notice.id])} type="button">
              {t("자세히")}
            </button>
          )}
          <button
            aria-label={t("공지 닫기")}
            onClick={() => {
              const next = [...dismissed, versionOf(notice)]
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
