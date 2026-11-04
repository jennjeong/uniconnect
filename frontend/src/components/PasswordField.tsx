import { useState, type InputHTMLAttributes } from "react"

import { t } from "../i18n"
import { Icon } from "./Icon"

// 눈 모양 버튼이 안에 있는 라벨 달린 비밀번호 칸. 버튼으로 입력한 내용을 보였다
// 숨길 수 있어 보내기 전에 오타를 알아볼 수 있다. 서버는 비밀번호가 틀렸다는
// 답만 주기 때문이다. 버튼이 라벨 안에 있으므로 입력창의 이름은 `label`에서만
// 가져온다.
export function PasswordField({
  label,
  toggleLabel = t("비밀번호 보기"),
  className,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string
  // PIN이나 토큰일 때 눈 모양 버튼을 스크린 리더가 읽는 말.
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
