import { t } from "../i18n"
import { passwordRules } from "../lib/password"
import { Icon } from "./Icon"

// 새 비밀번호가 따를 규칙(lib/password.ts). 비밀번호 칸 아래에서, 입력한
// 비밀번호가 충족할 때마다 하나씩 체크된다. id를 두어 입력칸이 이 목록을 가리킬
// 수 있다 (aria-describedby).
export function PasswordRules({ id, password }: { id: string; password: string }) {
  const rules = passwordRules(password)
  const met = rules.filter((rule) => rule.ok).length
  return (
    <div className="password-rules" id={id}>
      <div className="password-rules-heading">
        <span>{t("비밀번호 조건")}</span>
        <span className={met === rules.length ? "complete" : undefined} role="status">
          {t("조건 {met}/{total} 충족", { met, total: rules.length })}
        </span>
      </div>
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
