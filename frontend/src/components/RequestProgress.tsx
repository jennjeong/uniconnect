import { t, tc } from "../i18n"
import { fromIsoDate, shortDay, toIsoDate, todayIso } from "../lib/date"

type Progress = {
  createdAt: string
  respondedAt?: string
  // 양쪽이 계약서를 확인해 협찬이 확정된 시각. 없으면 아직 계약 확인 대기다.
  contractAt?: string
  // 행사나 캠페인 날짜. "YYYY-MM-DD" 또는 "".
  day: string
}

// 수락한 협찬을 제안부터 리포트까지 단계별로 날짜와 함께 보여 준다. 오늘까지는
// 완료로, 다음 단계는 진행 중으로 표시한다.
function progressSteps({ createdAt, respondedAt, contractAt, day }: Progress) {
  const dayOf = (timestamp?: string) => (timestamp ? toIsoDate(new Date(timestamp)) : "")
  const event = fromIsoDate(day)
  const afterEvent = (days: number) =>
    event ? toIsoDate(new Date(event.getFullYear(), event.getMonth(), event.getDate() + days)) : ""
  const today = todayIso()
  const steps = [
    { label: t("제안 받음"), day: dayOf(createdAt) },
    { label: t("제안 수락"), day: dayOf(respondedAt) },
    { label: t("협찬 확정"), day: dayOf(contractAt) },
    { label: t("행사 당일"), day },
    { label: tc("step", "성과 리포트"), day: afterEvent(7) },
  ]
  const next = steps.findIndex((step) => !step.day || step.day > today)
  return steps.map((step, index) => ({
    ...step,
    state: (next === -1 || index < next ? "step-done" : index === next ? "step-current" : "step-next") as StepState,
  }))
}

type StepState = "step-done" | "step-current" | "step-next"

// 단계의 상태를 글로도 알린다(색만으로 구분하지 않는다).
const stateText = (state: StepState) =>
  state === "step-done" ? t("완료") : state === "step-current" ? t("진행 중") : t("예정")

// 수락한 제안의 단계. 양쪽 받은 편지함에서 쓴다. 감싼 div가 카드 안에서 쓸 수 있는
// 폭을 재는 container라, 다섯 단계가 들어가는 폭에서만 가로 5열로, 그보다 좁으면
// 세로로 놓인다(index.css의 request-progress).
export function RequestProgress(props: Progress) {
  return (
    <div className="request-progress-wrap">
      <ol aria-label={t("협찬 진행 상황")} className="request-progress">
        {progressSteps(props).map((step, index) => {
          // 협찬 확정은 양쪽이 계약서를 확인한 날이 생길 때까지 날짜가 없다.
          const waiting = index === 2 && !step.day
          return (
            <li aria-current={step.state === "step-current" ? "step" : undefined} className={step.state} key={step.label}>
              <i aria-hidden="true" />
              <span className="step-text">
                <strong>{step.label}</strong>
                <time dateTime={step.day || undefined}>
                  {step.day ? shortDay(step.day) : waiting ? t("확정 대기") : t("미정")}
                </time>
                {step.state === "step-current" ? (
                  <em className="step-state">{stateText(step.state)}</em>
                ) : (
                  <span className="sr-only">{stateText(step.state)}</span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
