import { useState } from "react"

import { positionHints } from "../data/roles"
import { t } from "../i18n"
import type { Role } from "../types"

// The value the list's 직접 입력 option holds.
const typed = "__typed__"

// The contact person's position (직책): the usual ones for the side as a
// list like the form's other selects, or 직접 입력, which turns it into a
// box to type any other in, with a way back to the list. A listed position
// is kept as written in Korean and shown translated.
export function PositionField({
  role,
  value,
  onChange,
}: {
  role: Role
  value: string
  onChange: (value: string) => void
}) {
  const hints = positionHints[role]
  const [typing, setTyping] = useState(() => value.trim() !== "" && !hints.includes(value))

  if (typing) {
    return (
      <label>
        {t("직책")}
        <span className="field-with-action">
          <input
            autoFocus
            maxLength={20}
            placeholder={t("예) 마케팅 매니저")}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            className="field-action secondary"
            onClick={() => {
              setTyping(false)
              onChange("")
            }}
            type="button"
          >
            {t("목록에서 고르기")}
          </button>
        </span>
      </label>
    )
  }

  return (
    <label>
      {t("직책")}
      <select
        value={hints.includes(value) ? value : ""}
        onChange={(event) => {
          if (event.target.value === typed) {
            setTyping(true)
            onChange("")
          } else onChange(event.target.value)
        }}
      >
        <option disabled value="">
          {t("직책을 골라 주세요")}
        </option>
        {hints.map((hint) => (
          <option key={hint} value={hint}>
            {t(hint)}
          </option>
        ))}
        <option value={typed}>{t("직접 입력")}</option>
      </select>
    </label>
  )
}
