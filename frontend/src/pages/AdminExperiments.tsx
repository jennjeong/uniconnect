import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import type { AdminExperiment } from "../types"

type Notice = (message: string) => void

const verdictLabels: Record<AdminExperiment["verdict"], string> = {
  "too-early": "아직 판단하기 일러요. 갈래마다 30번 이상 보여야 해요.",
  "no-difference": "두 문구의 차이가 우연일 수 있어요.",
  "b-wins": "B가 더 많이 목표로 이어졌어요.",
  "a-wins": "A가 더 많이 목표로 이어졌어요.",
}

const goalLabels: Record<string, string> = { sign_up: "가입 (승인 대기 포함)" }

// 운영자 콘솔 분석의 A/B 테스트(#347). 실험은 코드에 있고(data/experiments.ts),
// 여기서는 켜고 끄고, 갈래별 노출 · 전환과 판정을 보고, 숫자를 처음부터 다시 센다.
export function Experiments({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [list, setList] = useState<AdminExperiment[]>()
  const [busy, setBusy] = useState("")

  useEffect(() => {
    api.adminExperiments(token).then(
      (answer) => setList(answer.experiments),
      (error) => onNotice(errorMessage(error)),
    )
  }, [token, onNotice])

  const act = async (key: string, run: () => Promise<{ experiments: AdminExperiment[] }>, done: string) => {
    setBusy(key)
    try {
      setList((await run()).experiments)
      onNotice(done)
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy("")
    }
  }

  return (
    <section className="console-card wide" aria-label={t("A/B 테스트")}>
      <h2>{t("A/B 테스트")}</h2>
      <p className="field-hint">
        {t("방문자를 두 문구로 나눠 어느 쪽이 목표로 더 이어지는지 세요. 누가 어느 쪽을 봤는지는 남기지 않고 횟수만 세요.")}
      </p>
      {!list ? (
        <p className="field-hint">{t("불러오고 있어요…")}</p>
      ) : (
        list.map((experiment) => (
          <div className="console-experiment" key={experiment.key}>
            <div className="console-card-head">
              <div>
                <h3>{t(experiment.name)}</h3>
                <p>
                  {t("목표: {goal}", { goal: t(goalLabels[experiment.goal] ?? experiment.goal) })}
                  {experiment.on && experiment.startedAt
                    ? ` · ${t("{at}부터 진행 중", { at: formatDateTime(experiment.startedAt) })}`
                    : experiment.stoppedAt
                      ? ` · ${t("{at}에 멈춤", { at: formatDateTime(experiment.stoppedAt) })}`
                      : ` · ${t("꺼져 있어요")}`}
                </p>
              </div>
              <div className="console-experiment-actions">
                <button
                  className={experiment.on ? "cancel-button" : "primary-button"}
                  disabled={busy === experiment.key}
                  onClick={() =>
                    void act(
                      experiment.key,
                      () => api.adminSwitchExperiment(token, experiment.key, !experiment.on),
                      experiment.on ? t("실험을 멈췄어요.") : t("실험을 시작했어요."),
                    )
                  }
                  type="button"
                >
                  {experiment.on ? t("실험 멈추기") : t("실험 시작")}
                </button>
                <button
                  className="console-inline"
                  disabled={busy === experiment.key}
                  onClick={() => {
                    if (!window.confirm(t("이 실험의 숫자를 모두 지우고 처음부터 셀까요?"))) return
                    void act(experiment.key, () => api.adminResetExperiment(token, experiment.key), t("숫자를 지웠어요."))
                  }}
                  type="button"
                >
                  {t("숫자 지우기")}
                </button>
              </div>
            </div>
            <table className="console-table plain">
              <caption className="sr-only">{t("{name} 갈래별 결과", { name: t(experiment.name) })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("갈래")}</th>
                  <th scope="col">{t("노출")}</th>
                  <th scope="col">{t("전환")}</th>
                  <th scope="col">{t("전환율")}</th>
                </tr>
              </thead>
              <tbody>
                {experiment.variants.map((row) => (
                  <tr key={row.variant}>
                    <th scope="row">{row.variant}</th>
                    <td>{row.seen.toLocaleString()}</td>
                    <td>{row.converted.toLocaleString()}</td>
                    <td>{row.rate === null ? "—" : `${row.rate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`console-experiment-verdict ${experiment.verdict}`}>
              {t(verdictLabels[experiment.verdict])}
              {experiment.p !== null && ` (p = ${experiment.p})`}
            </p>
          </div>
        ))
      )}
    </section>
  )
}
