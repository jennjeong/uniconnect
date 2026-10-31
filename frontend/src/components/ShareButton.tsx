import { useEffect, useState } from "react"

import { t } from "../i18n"
import { Icon } from "./Icon"

// 공유하기: the phone's share sheet where the browser has one (KakaoTalk,
// messages and the rest are listed there), else the link copied. The
// button says how it went for a moment, so no page needs a notice for it.
export function ShareButton({ title, text, url = location.href, className = "cancel-button" }: { title: string; text?: string; url?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  useEffect(() => {
    if (state === "idle") return
    const timer = window.setTimeout(() => setState("idle"), 2400)
    return () => window.clearTimeout(timer)
  }, [state])

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url })
        return
      } catch (error) {
        // Closing the share sheet isn't a failure.
        if ((error as Error).name === "AbortError") return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setState("copied")
    } catch {
      setState("failed")
    }
  }

  return (
    <button className={className} onClick={() => void share()} type="button">
      <Icon name="share" size={16} />
      <span aria-live="polite">
        {state === "copied" ? t("링크를 복사했어요") : state === "failed" ? t("복사하지 못했어요") : t("공유하기")}
      </span>
    </button>
  )
}
