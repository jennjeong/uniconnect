import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import type { DeviceSession } from "../types"

// The devices logged in to the account, this one first, each by its
// browser and system with when it logged in and was last used (to the
// hour). Any other one can be logged out, or all of them at once.
export function DevicesModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = () =>
    api.sessions().then(
      (result) => setSessions(result.sessions),
      (caught: unknown) => setError(errorMessage(caught)),
    )

  useEffect(() => {
    void load()
  }, [])

  const end = async (run: () => Promise<void>, notice: string) => {
    setBusy(true)
    setError("")
    try {
      await run()
      onNotice(notice)
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const others = (sessions ?? []).filter((session) => !session.current)
  return (
    <Modal name="devices" kicker="Security" title={t("로그인한 기기")} onClose={onClose}>
      <div className="auth-form">
        <p className="auth-lead">{t("모르는 기기가 있으면 로그아웃시키고 비밀번호를 바꿔 주세요.")}</p>
        {!sessions ? (
          <p className="field-hint">{error || t("기기 목록을 불러오고 있어요…")}</p>
        ) : (
          <ul className="device-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <span>
                  <strong>
                    {session.device === "알 수 없는 기기" ? t(session.device) : session.device}
                    {session.member && <small className="device-member">{session.member}</small>}
                    {session.current && <em className="device-current">{t("이 기기")}</em>}
                  </strong>
                  <small>
                    {[
                      session.createdAt && t("로그인 {date}", { date: formatDateTime(session.createdAt) }),
                      session.lastUsedAt && t("마지막 사용 {date}", { date: formatDateTime(session.lastUsedAt) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                {!session.current && (
                  <button
                    className="cancel-button"
                    disabled={busy}
                    onClick={() =>
                      void end(() => api.endSession(session.id), t("{device}에서 로그아웃시켰어요.", { device: session.device }))
                    }
                    type="button"
                  >
                    {t("로그아웃")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {sessions && error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {others.length > 0 && (
          <button
            className="decline-button wide"
            disabled={busy}
            onClick={() => void end(() => api.endOtherSessions(), t("다른 기기에서 모두 로그아웃시켰어요."))}
            type="button"
          >
            {t("다른 기기 모두 로그아웃")}
          </button>
        )}
      </div>
    </Modal>
  )
}
