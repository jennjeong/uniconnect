import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import type { EventMeasurement, Report } from "../types"

// Keep in sync with sponsorTypes in backend/src/lib/validation.ts.
const valueTypes = ["현금", "제품", "서비스", "기타"]

// Numbers are typed as text so a field can be empty while editing.
const draftOf = (report: Report) => ({
  expectedAudience: String(report.expectedAudience),
  averageSpend: String(report.averageSpend),
  snsReach: String(report.snsReach),
  valueBreakdown: report.valueBreakdown.map((part) => ({ type: part.type, value: String(part.value) })),
  targets: Object.fromEntries(
    Object.entries(report.targets).map(([key, value]) => [key, String(value)]),
  ) as Record<keyof Report["targets"], string>,
  store: report.coupon.store,
  title: report.coupon.title,
  staffPin: report.staffPin ?? "",
})

type Draft = ReturnType<typeof draftOf>

const targetFields: { key: keyof Report["targets"]; label: string }[] = [
  { key: "reach", label: "도달 (명)" },
  { key: "scans", label: "QR 스캔 (건)" },
  { key: "coupons", label: "쿠폰 수령 (건)" },
  { key: "visits", label: "매장 방문 (건)" },
  { key: "qrRate", label: "QR 참여율 (%)" },
  { key: "visitRate", label: "방문 전환율 (%)" },
  { key: "roas", label: "추정 ROAS (%)" },
]

// The event's goals and the inputs its report is worked out from: the
// expected audience, what a participant spends at the sponsor's store,
// reach beyond the venue, the sponsorship's value, the targets and the
// coupon participants get. The server checks every field again.
export function GoalsModal({
  report,
  onClose,
  onSaved,
}: {
  report: Report
  onClose: () => void
  onSaved: (measurement: EventMeasurement) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(report))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))
  const number = (value: string) => value.replace(/[^\d]/g, "")

  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      const result = await api.saveGoals(report.eventId, {
        expectedAudience: Number(draft.expectedAudience),
        averageSpend: Number(draft.averageSpend),
        snsReach: Number(draft.snsReach),
        valueBreakdown: draft.valueBreakdown.map((part) => ({ type: part.type, value: Number(part.value) })),
        targets: Object.fromEntries(
          Object.entries(draft.targets).map(([key, value]) => [key, Number(value)]),
        ) as Report["targets"],
        coupon: { store: draft.store, title: draft.title },
        ...(draft.staffPin ? { staffPin: draft.staffPin } : {}),
      })
      onSaved({ eventId: report.eventId, ...result })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="measure-goals" kicker="Measurement goals" title={`${report.eventName} 목표`} onClose={onClose}>
      <form
        className="auth-form goals-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <fieldset>
          <legend>행사 규모</legend>
          <div className="form-row">
            <label>
              예상 인원 (명)
              <input
                inputMode="numeric"
                value={draft.expectedAudience}
                onChange={(event) => update({ expectedAudience: number(event.target.value) })}
              />
            </label>
            <label>
              1인 예상 지출 (원)
              <input
                inputMode="numeric"
                value={draft.averageSpend}
                onChange={(event) => update({ averageSpend: number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            현장 밖 도달 (SNS 등, 명)
            <input
              inputMode="numeric"
              value={draft.snsReach}
              onChange={(event) => update({ snsReach: number(event.target.value) })}
            />
          </label>
          <small className="field-hint">
            도달은 QR 스캔 수에 현장 밖 도달을 더하고, ROAS는 매장 방문 × 1인 예상 지출을 협찬 가치로 나눠 계산해요.
          </small>
        </fieldset>

        <fieldset>
          <legend>협찬 가치</legend>
          {draft.valueBreakdown.map((part, index) => (
            <div className="goals-value-row" key={index}>
              <select
                aria-label="협찬 종류"
                value={part.type}
                onChange={(event) =>
                  update({
                    valueBreakdown: draft.valueBreakdown.map((item, at) =>
                      at === index ? { ...item, type: event.target.value } : item,
                    ),
                  })
                }
              >
                {valueTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <input
                aria-label="금액 (원)"
                inputMode="numeric"
                placeholder="금액 (원)"
                value={part.value}
                onChange={(event) =>
                  update({
                    valueBreakdown: draft.valueBreakdown.map((item, at) =>
                      at === index ? { ...item, value: number(event.target.value) } : item,
                    ),
                  })
                }
              />
              <button
                aria-label="이 항목 지우기"
                className="goals-remove"
                onClick={() => update({ valueBreakdown: draft.valueBreakdown.filter((_, at) => at !== index) })}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
          {draft.valueBreakdown.length < 6 && (
            <button
              className="goals-add"
              onClick={() => update({ valueBreakdown: [...draft.valueBreakdown, { type: "현금", value: "" }] })}
              type="button"
            >
              + 협찬 가치 추가
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend>목표</legend>
          <div className="form-row goals-targets">
            {targetFields.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  inputMode="numeric"
                  value={draft.targets[field.key]}
                  onChange={(event) =>
                    update({ targets: { ...draft.targets, [field.key]: number(event.target.value) } })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>참여 쿠폰</legend>
          <div className="form-row">
            <label>
              매장
              <input maxLength={30} value={draft.store} onChange={(event) => update({ store: event.target.value })} />
            </label>
            <label>
              혜택
              <input maxLength={30} value={draft.title} onChange={(event) => update({ title: event.target.value })} />
            </label>
          </div>
          {report.staffPin !== undefined && (
            <label>
              매장 직원 확인 PIN (숫자 4자리)
              <input
                inputMode="numeric"
                maxLength={4}
                value={draft.staffPin}
                onChange={(event) => update({ staffPin: number(event.target.value).slice(0, 4) })}
              />
            </label>
          )}
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          목표 저장하기
        </button>
      </form>
    </Modal>
  )
}
