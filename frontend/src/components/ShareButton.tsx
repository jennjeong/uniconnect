import { useEffect, useState } from "react"

import { t } from "../i18n"
import { Icon } from "./Icon"

// 공유하기: 브라우저에 있으면 휴대폰의 공유 시트 (KakaoTalk, 메시지 등이 거기
// 나열된다), 없으면 링크를 복사한다. 버튼이 잠깐 결과를 알려 주므로 어떤
// 페이지도 따로 안내를 둘 필요가 없다.
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
        // 공유 시트를 닫은 것은 실패가 아니다.
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
