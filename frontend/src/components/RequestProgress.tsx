import { t, tc } from "../i18n"
import { fromIsoDate, shortDay, toIsoDate, todayIso } from "../lib/date"

type Progress = {
  createdAt: string
  respondedAt?: string
  // The event or campaign day, "YYYY-MM-DD" or "".
  day: string
}

// An accepted sponsorship from the proposal to its report, each step with
// its day: done up to today, the next one under way.
function progressSteps({ createdAt, respondedAt, day }: Progress) {
  const dayOf = (timestamp?: string) => (timestamp ? toIsoDate(new Date(timestamp)) : "")
  const event = fromIsoDate(day)
  const afterEvent = (days: number) =>
    event ? toIsoDate(new Date(event.getFullYear(), event.getMonth(), event.getDate() + days)) : ""
  const today = todayIso()
  const steps = [
    { label: t("제안 받음"), day: dayOf(createdAt) },
    { label: t("협찬 확정"), day: dayOf(respondedAt) },
    { label: t("행사 당일"), day },
    { label: tc("step", "성과 리포트"), day: afterEvent(7) },
  ]
  const next = steps.findIndex((step) => !step.day || step.day > today)
  return steps.map((step, index) => ({
    ...step,
    state: next === -1 || index < next ? "step-done" : index === next ? "step-current" : "step-next",
  }))
}

// The steps of an accepted proposal, on both sides' inboxes.
export function RequestProgress(props: Progress) {
  return (
    <ol aria-label={t("협찬 진행 상황")} className="request-progress">
      {progressSteps(props).map((step) => (
        <li className={step.state} key={step.label}>
          <i aria-hidden="true" />
          <strong>{step.label}</strong>
          <time dateTime={step.day || undefined}>{step.day ? shortDay(step.day) : t("미정")}</time>
        </li>
      ))}
    </ol>
  )
}
