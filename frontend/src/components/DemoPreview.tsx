import type { ReactNode } from "react"

import { t } from "../i18n"
import { Pill } from "./Pill"

// A part of an example screen that would be different for the visitor, such
// as the shops near a campus: blurred and out of reach (inert, hidden from
// screen readers), under a note saying it is an example and how to see
// their own. A logged-in account sees it as it is.
export function DemoPreview({
  active,
  title,
  text,
  onLogin,
  onSignup,
  children,
}: {
  active: boolean
  title: string
  text: string
  onLogin: () => void
  onSignup: () => void
  children: ReactNode
}) {
  if (!active) return children
  return (
    <div className="demo-preview">
      <div aria-hidden="true" className="demo-preview-content" inert>
        {children}
      </div>
      <div className="demo-preview-note">
        <span className="demo-badge">{t("예시 화면")}</span>
        <strong>{title}</strong>
        <p>{text}</p>
        <div className="demo-preview-actions">
          <Pill onClick={onLogin}>{t("로그인")}</Pill>
          <Pill onClick={onSignup} variant="outline">
            {t("회원가입")}
          </Pill>
        </div>
      </div>
    </div>
  )
}
