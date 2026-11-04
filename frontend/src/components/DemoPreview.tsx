import type { ReactNode } from "react"

import { t } from "../i18n"
import { Lines } from "./Lines"
import { Pill } from "./Pill"

// 방문자에게는 달라질 예시 화면의 일부. 캠퍼스 근처 가게가 그 예다. 가상의
// 가게나 데모 계정의 예시로 가득 채워 보여 주고, 예시라는 안내와 자기 것을 보는
// 방법을 그 아래에 둔다. 로그인한 계정에는 안내 없이 그대로 보인다.
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
