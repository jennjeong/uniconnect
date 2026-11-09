import { roleOptions } from "../data/roles"
import { t } from "../i18n"
import type { Role } from "../types"
import { RoleMark } from "./RoleMark"

export function RolePicker({
  name,
  value,
  onChange,
}: {
  name: string
  value: Role
  onChange: (role: Role) => void
}) {
  return (
    <div className="role-picker" role="radiogroup" aria-label={t("회원 유형")}>
      {roleOptions.map((option) => (
        <label
          className={value === option.value ? "role-option active" : "role-option"}
          key={option.value}
        >
          <input
            checked={value === option.value}
            name={name}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          <RoleMark role={option.value} />
          <span className="role-option-copy">
            <strong>{option.title}</strong>
            <span>{option.caption}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
