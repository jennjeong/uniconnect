import type { ReactNode } from "react"

import { Pill } from "./Pill"

export type DashboardFact = {
  label: string
  value: ReactNode
  // 값 아래의 짧은 덧말(날짜, D-day 등).
  note?: string
}

// 로그인한 회원의 대시보드 첫머리. 공개 소개 페이지처럼 밝은 바탕에 글자로 위계를
// 만든다(큰 그라데이션 히어로는 방문자의 예시 화면에만 남긴다). 누구의 화면인지 한 줄,
// 지금 할 일을 말하는 제목, 업무 보드와 겹치지 않는 사실 두세 개(다음 행사, 확정된 협찬
// 같은 것), 그리고 다음 행동 하나. 건수는 바로 아래 업무 보드가 센다.
export function DashboardTop({
  who,
  title,
  lead,
  facts,
  primary,
  secondary,
}: {
  who: string
  title: string
  lead?: string
  facts: DashboardFact[]
  primary?: { label: string; onClick: () => void }
  secondary?: { label: string; onClick: () => void }
}) {
  return (
    <header className="dash-top">
      <p className="dash-top-who">{who}</p>
      <h1 className="dash-top-title">{title}</h1>
      {lead && <p className="dash-top-lead">{lead}</p>}
      {facts.length > 0 && (
        <dl className="dash-top-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>
                <strong>{fact.value}</strong>
                {fact.note && <small>{fact.note}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(primary || secondary) && (
        <div className="dash-top-actions">
          {primary && (
            <Pill onClick={primary.onClick} variant="primary">
              {primary.label}
            </Pill>
          )}
          {secondary && (
            <button className="underline-link" onClick={secondary.onClick} type="button">
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </header>
  )
}

// 회원 대시보드의 구역 머리: 실제 서비스 용어로 된 제목 하나와 그 구역 전체로 가는 링크.
export function DashSectionHead({
  id,
  title,
  note,
  action,
}: {
  id: string
  title: string
  note?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="dash-section-head">
      <h2 id={id}>{title}</h2>
      {note && <small>{note}</small>}
      {action && (
        <button className="underline-link" onClick={action.onClick} type="button">
          {action.label}
        </button>
      )}
    </div>
  )
}
