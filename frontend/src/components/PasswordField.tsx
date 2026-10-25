import { useState, type InputHTMLAttributes } from "react"

import { t } from "../i18n"
import { Icon } from "./Icon"

// A labelled password box with an eye button inside it that shows what was
// typed and hides it again, so a slip can be seen before sending: the
// server only ever answers that a password is wrong. The button sits inside
// the label, so the input takes its name from `label` alone.
export function PasswordField({
  label,
  toggleLabel = t("비밀번호 보기"),
  className,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string
  // What the eye button says to screen readers, for a PIN or a token.
  toggleLabel?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <label>
      {label}
      <span className="password-input">
        <input
          {...input}
          aria-label={label}
          className={className ? `${className} password-box` : "password-box"}
          type={shown ? "text" : "password"}
        />
        <button
          aria-label={toggleLabel}
          aria-pressed={shown}
          className="password-toggle"
          onClick={() => setShown((current) => !current)}
          type="button"
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={18} />
        </button>
      </span>
    </label>
  )
}
