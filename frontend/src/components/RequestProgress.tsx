import { t, tc } from "../i18n"
import { fromIsoDate, shortDay, toIsoDate, todayIso } from "../lib/date"

type Progress = {
  createdAt: string
  respondedAt?: string
  // 양쪽이 계약서를 확인해 협찬이 확정된 시각. 없으면 아직 계약 확인 대기다.
  contractAt?: string
  // 행사나 캠페인 날짜. "YYYY-MM-DD" 또는 "".
  day: string
  // 실제로 일어난 것(서버 lib/progress.ts): 행사에서 처음 기록된 날과, 방문 집계가
  // 끝나 결과가 굳은 날. 날짜가 지났다는 것만으로는 완료가 아니다.
  executedAt?: string
  reportedAt?: string
}

export type StepState = "step-done" | "step-current" | "step-late" | "step-next"

// 수락한 협찬을 제안부터 리포트까지 단계별로 보여 준다. 각 단계는 실제로 일어난
// 날(완료)이나 예정일을 가진다. 아직 안 된 첫 단계가 지금 단계이고, 그 예정일이
// 지났으면 '확인 필요'다. 그 뒤는 예정이다.
export function progressSteps(
  { createdAt, respondedAt, contractAt, day, executedAt, reportedAt }: Progress,
  today = todayIso(),
) {
  const dayOf = (timestamp?: string) => (timestamp ? toIsoDate(new Date(timestamp)) : "")
  const event = fromIsoDate(day)
  const afterEvent = (days: number) =>
    event ? toIsoDate(new Date(event.getFullYear(), event.getMonth(), event.getDate() + days)) : ""
  const steps = [
    { label: t("제안 받음"), done: dayOf(createdAt), planned: "" },
    { label: t("제안 수락"), done: dayOf(respondedAt), planned: "" },
    { label: t("협찬 확정"), done: dayOf(contractAt), planned: "" },
    { label: t("행사 진행"), done: executedAt ?? "", planned: day },
    // 방문은 행사 다음 날부터 7일 동안 들어온다. 그 뒤에 결과가 굳는다.
    { label: tc("step", "성과 리포트"), done: reportedAt ?? "", planned: afterEvent(8) },
  ]
  const current = steps.findIndex((step) => !step.done)
  return steps.map((step, index) => {
    const state: StepState =
      current === -1 || index < current
        ? "step-done"
        : index > current
          ? "step-next"
          : step.planned && step.planned < today
            ? "step-late"
            : "step-current"
    return { label: step.label, day: step.done || step.planned, done: Boolean(step.done), state }
  })
}

// 단계의 상태를 글로도 알린다(색만으로 구분하지 않는다).
const stateText = (state: StepState) =>
  state === "step-done"
    ? t("완료")
    : state === "step-current"
      ? t("진행 중")
      : state === "step-late"
        ? t("확인 필요")
        : t("예정")

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
            <li
              aria-current={step.state === "step-current" || step.state === "step-late" ? "step" : undefined}
              className={step.state}
              key={step.label}
            >
              <i aria-hidden="true" />
              <span className="step-text">
                <strong>{step.label}</strong>
                <time dateTime={step.day || undefined}>
                  {step.day
                    ? step.done
                      ? shortDay(step.day)
                      : t("{date} 예정", { date: shortDay(step.day) })
                    : waiting
                      ? t("확정 대기")
                      : t("미정")}
                </time>
                {step.state === "step-current" || step.state === "step-late" ? (
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
