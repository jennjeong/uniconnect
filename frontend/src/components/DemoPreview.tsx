import type { ReactNode } from "react"

import { t } from "../i18n"
import { Lines } from "./Lines"
import { Pill } from "./Pill"

// A part of an example screen that would be different for the visitor, such
// as the shops near a campus: shown in full with made-up shops or the demo
// account's examples, under a note saying it is an example and how to see
// their own. A logged-in account sees it without the note.
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
      <div className="demo-preview-note" role="note">
        <span className="demo-badge">{t("예시 화면")}</span>
        <div className="demo-preview-copy">
          <strong>{title}</strong>
          <p><Lines text={text} /></p>
        </div>
        <div className="demo-preview-actions">
          <Pill onClick={onLogin}>{t("로그인")}</Pill>
          <Pill onClick={onSignup} variant="outline">
            {t("회원가입")}
          </Pill>
        </div>
      </div>
      {children}
    </div>
  )
}
