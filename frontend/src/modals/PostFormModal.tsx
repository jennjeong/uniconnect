import { useState } from "react"

import { errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { sponsorOptions } from "../data/sponsorTypes"
import { t } from "../i18n"
import { addDaysIso, formatPeriod, todayIso } from "../lib/date"
import type { BoardPost, EventItem, PostDraft, Role } from "../types"

// As the server takes it (backend routes/board.ts).
const maxTitle = 60
const maxBody = 1000
const maxDeadlineDays = 60

// Writes a post for the recruitment board, or edits one: a title and what is
// sought, the kinds of sponsorship, a deadline within 60 days, and for a
// student group the event it looks for sponsors for. A problem from the
// server stays on the form.
export function PostFormModal({
  role,
  post,
  events,
  onClose,
  onSave,
  onCreateEvent,
}: {
  role: Role
  // The post being edited; a new one when absent.
  post?: BoardPost
  // The account's events or campaigns, for a group's to pick from.
  events: EventItem[]
  onClose: () => void
  onSave: (draft: PostDraft) => Promise<void>
  // Registers an event first, when a group has none coming.
  onCreateEvent: () => void
}) {
  const students = role === "학생단체"
  const today = todayIso()
  const upcoming = events
    .filter((event) => (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const [title, setTitle] = useState(post?.title ?? "")
  const [body, setBody] = useState(post?.body ?? "")
  const [types, setTypes] = useState<string[]>(post?.types ?? [])
  const [deadline, setDeadline] = useState(post?.deadline ?? addDaysIso(today, 14))
  const [eventId, setEventId] = useState(post?.eventId ?? upcoming[0]?.id ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const toggle = (type: string) =>
    setTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]))

  const save = async () => {
    const problem = !title.trim() || !body.trim()
      ? t("제목과 내용을 적어 주세요.")
      : types.length === 0
        ? t("협찬 종류를 하나 이상 골라 주세요.")
        : students && !eventId
          ? t("협찬을 찾을 다가오는 행사를 골라 주세요.")
          : ""
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError("")
    try {
      await onSave({
        title: title.trim(),
        body: body.trim(),
        types,
        deadline,
        ...(students ? { eventId } : {}),
      })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal kicker="Recruit Board" name="post" onClose={onClose} title={post ? t("모집 글 고치기") : t("모집 글 쓰기")}>
      <form
        className="auth-form post-form"
        noValidate
        onSubmit={(submitted) => {
          submitted.preventDefault()
          void save()
        }}
      >
        {students &&
          (upcoming.length > 0 ? (
            <label>
              {t("협찬사를 찾을 행사")}
              <select onChange={(changed) => setEventId(changed.target.value)} value={eventId}>
                {upcoming.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name} · {formatPeriod(event.date, event.endDate)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="propose-empty">
              <p className="auth-lead">{t("다가오는 행사가 없어요. 협찬사를 모집하려면 먼저 행사를 등록해 주세요.")}</p>
              <button className="cancel-button" onClick={onCreateEvent} type="button">
                {t("행사 등록하기")}
              </button>
            </div>
          ))}
        <label>
          {t("제목")}
          <input
            maxLength={maxTitle}
            onChange={(changed) => setTitle(changed.target.value)}
            placeholder={students ? t("예) 종강 공연을 함께할 협찬사를 찾아요") : t("예) 캠퍼스 시음회와 함께할 공연을 찾아요")}
            value={title}
          />
        </label>
        <label>
          {t("내용")}
          <textarea
            className="propose-message"
            maxLength={maxBody}
            onChange={(changed) => setBody(changed.target.value)}
            placeholder={
              students
                ? t("행사에서 브랜드가 할 수 있는 것과 원하는 협찬을 적어 주세요.")
                : t("찾는 행사의 규모와 분위기, 브랜드가 지원할 수 있는 것을 적어 주세요.")
            }
            rows={6}
            value={body}
          />
        </label>
        <fieldset className="post-type-input">
          <legend>{students ? t("원하는 협찬") : t("제공하는 협찬")}</legend>
          {sponsorOptions[role].map((option) => (
            <label className={types.includes(option.value) ? "on" : undefined} key={option.value}>
              <input checked={types.includes(option.value)} onChange={() => toggle(option.value)} type="checkbox" />
              {t(option.value)}
            </label>
          ))}
        </fieldset>
        <label>
          {t("마감일")}
          <input
            max={addDaysIso(today, maxDeadlineDays)}
            min={today}
            onChange={(changed) => setDeadline(changed.target.value)}
            type="date"
            value={deadline}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {post ? t("저장하기") : t("모집 글 올리기")}
        </button>
      </form>
    </Modal>
  )
}
