import { useState } from "react"

import { t } from "../i18n"
import { checklistSteps, type ChecklistKey } from "../lib/checklist"
import type { Match, Role } from "../types"
import { Icon } from "./Icon"

// Each step's name, why it matters for that side, and its button.
const stepCopy = (students: boolean): Record<ChecklistKey, { title: string; why: string; action: string }> => ({
  intro: { title: t("소개"), why: t("상대가 카드와 상세 페이지에서 가장 먼저 읽어요."), action: t("소개 쓰기") },
  logo: { title: t("로고"), why: t("카드와 상세 페이지에서 업종 그림 대신 보여요."), action: t("로고 올리기") },
  address: { title: t("매장 주소"), why: t("학생단체의 학교까지 거리가 카드에 보여요."), action: t("주소 적기") },
  tags: { title: t("태그"), why: t("상대와 겹치는 낱말이 일치율에 들어가요."), action: t("태그 달기") },
  sns: {
    title: "SNS",
    why: students ? t("브랜드가 홍보 효과를 가늠할 수 있어요.") : t("학생단체에게 보이는 일치율의 응답 준비에 들어가요."),
    action: t("SNS 적기"),
  },
  portfolio: {
    title: students ? t("지난 활동") : t("포트폴리오"),
    why: students ? t("지난 행사의 인원과 성과가 브랜드의 결정을 도와요.") : t("학생단체에게 보이는 일치율의 응답 준비에 들어가요."),
    action: students ? t("실적 적기") : t("포트폴리오 적기"),
  },
  event: {
    title: students ? t("첫 행사") : t("첫 캠페인"),
    why: students
      ? t("브랜드에 제안하려면 행사가 있어야 하고, 45일 안의 행사는 일치율을 올려요.")
      : t("학생단체에 제안하려면 캠페인이 있어야 해요."),
    action: students ? t("행사 등록") : t("캠페인 등록"),
  },
})

// Under the dashboard's hero for a member whose listing is not complete:
// each step with why it matters and the button that does it, and how far
// along it is. 나중에 folds it to one line, remembered in this browser; it
// goes once every step is done.
export function ProfileChecklist({
  accountId,
  role,
  listing,
  hasEvent,
  onEditProfile,
  onCreate,
}: {
  accountId: string
  role: Role
  // The account's listing; null before it has written one.
  listing: Match | null
  hasEvent: boolean
  onEditProfile: () => void
  onCreate: () => void
}) {
  const storageKey = `uniconnect-checklist:${accountId}`
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "folded"
    } catch {
      return false
    }
  })
  const fold = (next: boolean) => {
    setFolded(next)
    try {
      if (next) localStorage.setItem(storageKey, "folded")
      else localStorage.removeItem(storageKey)
    } catch {
      // Without storage it folds for this visit only.
    }
  }
  const students = role === "학생단체"
  const steps = checklistSteps(role, listing, hasEvent)
  const done = steps.filter((step) => step.done).length
  if (done === steps.length) return null
  const copy = stepCopy(students)
  const progress = (
    <span className="checklist-progress">
      <span
        aria-label={t("소개 완성도")}
        aria-valuemax={steps.length}
        aria-valuemin={0}
        aria-valuenow={done}
        className="checklist-bar"
        role="progressbar"
      >
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </span>
      {t("{done}/{total} 완료", { done, total: steps.length })}
    </span>
  )

  if (folded) {
    return (
      <section aria-label={t("소개 완성 체크리스트")} className="checklist-section folded">
        <strong>{t("소개 완성")}</strong>
        {progress}
        <button className="subtle-link" onClick={() => fold(false)} type="button">
          {t("펼치기")}
        </button>
      </section>
    )
  }
  return (
    <section aria-labelledby="checklist-title" className="checklist-section">
      <div className="checklist-head">
        <div>
          <span className="eyebrow">Getting Started</span>
          <h2 className="checklist-title" id="checklist-title">
            {t("소개를 채울수록 잘 맞는 상대를 찾아 드려요")}
          </h2>
        </div>
        {progress}
        <button className="subtle-link" onClick={() => fold(true)} type="button">
          {t("나중에")}
        </button>
      </div>
      <ol className="checklist">
        {steps.map((step) => (
          <li className={step.done ? "done" : undefined} key={step.key}>
            <span aria-hidden="true" className="checklist-mark">
              {step.done && <Icon name="check" size={14} />}
            </span>
            <span className="checklist-copy">
              <strong>
                {copy[step.key].title}
                {step.done && <span className="sr-only"> {t("완료")}</span>}
              </strong>
              <small>{copy[step.key].why}</small>
            </span>
            {!step.done && (
              <button className="cancel-button" onClick={step.key === "event" ? onCreate : onEditProfile} type="button">
                {copy[step.key].action}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
