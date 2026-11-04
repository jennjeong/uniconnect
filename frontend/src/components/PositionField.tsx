import { useState } from "react"

import { positionHints } from "../data/roles"
import { t } from "../i18n"
import type { Role } from "../types"

// 목록의 직접 입력 옵션이 담는 값.
const typed = "__typed__"

// 담당자의 직책. 그 쪽에서 흔한 직책을 폼의 다른 셀렉트처럼 목록으로 보여
// 주거나, 직접 입력을 골라 다른 직책을 입력하는 상자로 바꾼다. 목록으로
// 돌아가는 길도 있다. 목록의 직책은 한국어로 저장하고 번역해서 보여 준다.
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
