import { useState } from "react"

import type { EventDraft } from "../api"
import { Modal } from "../components/Modal"
import { createLabel } from "../data/roles"
import type { Role } from "../types"

// Keep in sync with sponsorTypes in backend/src/lib/validation.ts.
const sponsorTypes = ["현금", "제품", "서비스"]

// Filled-in example so a demo event can be registered in one click.
const exampleDraft = (role: Role): EventDraft => ({
  name: role === "학생단체" ? "2026 뮤즈 종강 공연" : "11월 캠퍼스 캠페인",
  people: role === "학생단체" ? "120명" : "1,000명",
  date: "2026. 11. 27.",
  types: ["현금", "제품"],
})

export function EventModal({
  role,
  onClose,
  onSubmit,
}: {
  role: Role
  onClose: () => void
  onSubmit: (draft: EventDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => exampleDraft(role))
  const [busy, setBusy] = useState(false)

  const update = (patch: Partial<EventDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  const toggleType = (type: string) =>
    update({
      types: draft.types.includes(type)
        ? draft.types.filter((item) => item !== type)
        : [...draft.types, type],
    })

  const submit = async () => {
    setBusy(true)
    try {
      await onSubmit(draft)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="event" kicker="NEW CONNECTION" title={createLabel(role)} onClose={onClose}>
      <label>
        {role === "학생단체" ? "행사명" : "캠페인명"}
        <input
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
        />
      </label>
      <div className="form-row">
        <label>
          예상 참여 인원
          <input
            value={draft.people}
            onChange={(event) => update({ people: event.target.value })}
          />
        </label>
        <label>
          일정
          <input
            value={draft.date}
            onChange={(event) => update({ date: event.target.value })}
          />
        </label>
      </div>
      <div
        className="field-group"
        role="group"
        aria-labelledby="sponsor-type-label"
      >
        <span id="sponsor-type-label">원하는 협찬 유형</span>
        <div className="choice-row">
          {sponsorTypes.map((type) => (
            <button
              className={draft.types.includes(type) ? "choice active" : "choice"}
              key={type}
              onClick={() => toggleType(type)}
              type="button"
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="cancel-button" onClick={onClose} type="button">
          취소
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={submit}
          type="button"
        >
          등록하고 매칭 받기
        </button>
      </div>
    </Modal>
  )
}
