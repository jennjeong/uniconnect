import { useState } from "react"

import { errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { formatPeriod, todayIso } from "../lib/date"
import type { EventItem, Match, Role } from "../types"

// As the server takes it (routes/proposals.ts).
const maxMessage = 300

// 제안하기: which of the account's own events or campaigns the proposal is
// about (the nearest at first) and a note for the partner, sent as written
// or, left empty, with the usual greeting. The server answers when the
// partner has an inbox and the account no event to propose; what was
// written stays then.
export function ProposeModal({
  match,
  role,
  events,
  onClose,
  onSend,
  onCreate,
}: {
  match: Match
  role: Role
  events: EventItem[]
  onClose: () => void
  onSend: (draft: { eventId?: string; message: string }) => Promise<void>
  // Registers an event first, when there is none to propose.
  onCreate: () => void
}) {
  const students = role === "학생단체"
  const today = todayIso()
  const upcoming = events
    .filter((event) => (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const [eventId, setEventId] = useState(upcoming[0]?.id ?? "")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await onSend({ ...(eventId ? { eventId } : {}), message: message.trim() })
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal kicker="Proposal" name="propose" onClose={onClose} title={t("{name}에 협찬 제안", { name: match.name })}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        {upcoming.length > 0 ? (
          <label>
            {students ? t("제안할 행사") : t("제안할 캠페인")}
            <select onChange={(event) => setEventId(event.target.value)} value={eventId}>
              {upcoming.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {formatPeriod(event.date, event.endDate)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="propose-empty">
            <p className="auth-lead">
              {students
                ? t("다가오는 행사가 없어요. 가입한 브랜드에 제안하려면 먼저 행사를 등록해 주세요.")
                : t("다가오는 캠페인이 없어요. 가입한 학생단체에 제안하려면 먼저 캠페인을 등록해 주세요.")}
            </p>
            <button className="cancel-button" onClick={onCreate} type="button">
              {students ? t("행사 등록하기") : t("캠페인 등록하기")}
            </button>
          </div>
        )}
        <label>
          {t("전할 메시지")}
          <textarea
            className="propose-message"
            maxLength={maxMessage}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("어떤 협찬을 바라는지, 함께하면 좋은 점을 적어 주세요.")}
            rows={4}
            value={message}
          />
        </label>
        <p className="field-hint">
          {t("{count}/{max}자 · 비워 두면 기본 인사말이 가요.", { count: message.length, max: maxMessage })}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("제안 보내기")}
        </button>
      </form>
    </Modal>
  )
}
