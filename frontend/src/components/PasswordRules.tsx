import { t } from "../i18n"
import { passwordRules } from "../lib/password"
import { Icon } from "./Icon"

// The rules a new password follows (lib/password.ts), each ticked as the
// password typed meets it, under the password boxes. Its id lets the box
// point to it (aria-describedby).
export function PasswordRules({ id, password }: { id: string; password: string }) {
  const rules = passwordRules(password)
  return (
    <div className="password-rules" id={id}>
      <span>{t("비밀번호 조건")}</span>
      <ul>
        {rules.map((rule) => (
          <li className={rule.ok ? "met" : ""} key={rule.label}>
            {rule.ok ? <Icon name="check" size={12} /> : <i aria-hidden="true" className="rule-dot" />}
            {rule.label}
            <span className="sr-only">{rule.ok ? t("충족") : t("아직")}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
