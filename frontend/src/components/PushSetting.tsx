import { useEffect, useState } from "react"

import { api, ApiError } from "../api"
import { t } from "../i18n"
import { pushSupport, turnOffPush, turnOnPush } from "../lib/push"

// 내 정보의 이 기기 알림: 새 제안과 메시지를 이 기기의 푸시 알림으로 받는다
// (lib/push.ts). 서버에 키가 없으면 보이지 않는다.
export function PushSetting({
  account,
  onNotice,
  onError,
}: {
  account: string
  onNotice: (message: string) => void
  onError: (error: unknown) => void
}) {
  const [state, setState] = useState<{ key: string; on: boolean }>()
  const [support, setSupport] = useState(pushSupport)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api.push().then(
      ({ key, on }) => live && key && setState({ key, on }),
      // 설정 하나일 뿐이므로 읽지 못하면 보이지 않는다.
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [account])

  if (!state) return null

  const act = async (run: () => Promise<void>) => {
    setBusy(true)
    try {
      await run()
    } catch (error) {
      onError(error)
    } finally {
      setSupport(pushSupport())
      setBusy(false)
    }
  }

  const turnOn = () =>
    act(async () => {
      const result = await turnOnPush(account, state.key).catch((error: unknown) => {
        // 브라우저가 구독을 만들지 못했다(서버의 답은 그대로 알린다).
        if (error instanceof ApiError) throw error
        onNotice(t("이 브라우저에서 알림을 켜지 못했어요. 잠시 뒤에 다시 시도해 주세요."))
        return undefined
      })
      if (result === "on") {
        setState({ ...state, on: true })
        onNotice(t("이 기기의 알림을 켰어요."))
      } else if (result === "denied") onNotice(t("알림이 차단돼 있어요. 브라우저 설정에서 허용해 주세요."))
    })

  const turnOff = () =>
    act(async () => {
      await turnOffPush()
      setState({ ...state, on: false })
      onNotice(t("이 기기의 알림을 껐어요."))
    })

  const tryIt = () =>
    act(async () => {
      try {
        await api.testPush()
      } catch (error) {
        // 구독이 끊겼으면 다시 켤 수 있게 지금 상태를 다시 읽는다.
        const now = await api.push().catch(() => undefined)
        if (now) setState({ ...state, on: now.on })
        throw error
      }
      onNotice(t("시험 알림을 보냈어요."))
    })

  const value = state.on
    ? t("이 기기로 새 제안 · 메시지 · 다가오는 일정을 알려 드려요.")
    : support === "ios"
      ? t("iPhone과 iPad는 홈 화면에 추가한 앱에서 켤 수 있어요.")
      : support === "denied"
        ? t("알림이 차단돼 있어요. 브라우저 설정에서 허용해 주세요.")
        : support === "unsupported"
          ? t("이 브라우저는 알림을 지원하지 않아요.")
          : t("새 제안 · 메시지 · 다가오는 일정을 이 기기로 받아요.")

  return (
    <div className="settings-row">
      <dt>{t("이 기기 알림")}</dt>
      <dd>
        {value} {(state.on || support === "ok") && <small className="push-note">{t("직접 로그아웃하면 꺼져요.")}</small>}
      </dd>
      {(state.on || support === "ok") && (
        <dd className="settings-action">
          {state.on && (
            <button aria-label={t("이 기기에 시험 알림 보내기")} className="row-button" disabled={busy} onClick={() => void tryIt()} type="button">
              {t("시험")}
            </button>
          )}
          <button
            aria-label={state.on ? t("이 기기 알림 끄기") : t("이 기기 알림 켜기")}
            className={state.on ? "row-button" : "row-button point"}
            disabled={busy}
            onClick={() => void (state.on ? turnOff() : turnOn())}
            type="button"
          >
            {state.on ? t("끄기") : t("켜기")}
          </button>
        </dd>
      )}
    </div>
  )
}
