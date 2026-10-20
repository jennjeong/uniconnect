import { roleOptions } from "../data/roles"
import type { Role } from "../types"
import { Icon } from "./Icon"

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
    <div className="role-picker" role="radiogroup" aria-label="회원 유형">
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
          <Icon name={option.icon} size={20} />
          <strong>{option.title}</strong>
          <span>{option.caption}</span>
        </label>
      ))}
    </div>
  )
}
