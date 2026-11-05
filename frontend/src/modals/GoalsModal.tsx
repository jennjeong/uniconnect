import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { valueTypes } from "../data/sponsorTypes"
import { t } from "../i18n"
import type { EventMeasurement, Report } from "../types"


// 숫자는 텍스트로 받아서 입력 중에 칸이 비어 있을 수 있다.
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
  sponsors: (report.sponsors ?? []).map((sponsor) => ({
    id: sponsor.id,
    brandName: sponsor.brandName,
    store: sponsor.coupon.store,
    title: sponsor.coupon.title,
    value: String(sponsor.value),
    staffPin: sponsor.staffPin ?? "",
  })),
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

// 행사의 목표와 리포트 계산에 쓰는 입력: 예상 방문객, 참가자가 스폰서 매장에서
// 쓰는 금액, 행사장 밖의 도달, 협찬의 가치, 목표치, 참가자가 받는 쿠폰.
// 브랜드가 행사를 협찬하면 대신 스폰서별 쿠폰, 가치 배분, 직원 PIN이 들어간다.
// 서버가 모든 칸을 다시 검사한다.
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
  const updateSponsor = (id: string, patch: Partial<Draft["sponsors"][number]>) =>
    update({ sponsors: draft.sponsors.map((sponsor) => (sponsor.id === id ? { ...sponsor, ...patch } : sponsor)) })
  const several = draft.sponsors.length > 1
  const total = draft.valueBreakdown.reduce((sum, part) => sum + Number(part.value || 0), 0)
  const shared = draft.sponsors.reduce((sum, sponsor) => sum + Number(sponsor.value || 0), 0)

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
        ...(draft.sponsors.length
          ? {
              sponsors: draft.sponsors.map((sponsor) => ({
                id: sponsor.id,
                store: sponsor.store,
                title: sponsor.title,
                ...(several ? { value: Number(sponsor.value) } : {}),
                ...(sponsor.staffPin ? { staffPin: sponsor.staffPin } : {}),
              })),
            }
          : {}),
      })
      onSaved({ eventId: report.eventId, ...result })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="measure-goals" kicker="Measurement Goals" title={t("{name} 목표", { name: report.eventName })} onClose={onClose}>
      <form
        className="auth-form goals-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <fieldset>
          <legend>{t("행사 규모")}</legend>
          <div className="form-row">
            <label>
              {t("예상 인원 (명)")}
              <input
                inputMode="numeric"
                value={draft.expectedAudience}
                onChange={(event) => update({ expectedAudience: number(event.target.value) })}
              />
            </label>
            <label>
              {t("1인 예상 지출 (원)")}
              <input
                inputMode="numeric"
                value={draft.averageSpend}
                onChange={(event) => update({ averageSpend: number(event.target.value) })}
              />
            </label>
          </div>
          <small className="field-hint">
            {t("도달은 QR 스캔 수에 브랜드가 확인한 SNS 게시물 도달을 더하고 ROAS는 매장 방문 × 1인 예상 지출을 협찬 가치로 나눠 계산해요.")}
          </small>
        </fieldset>

        <fieldset>
          <legend>{t("협찬 가치")}</legend>
          {draft.valueBreakdown.map((part, index) => (
            <div className="goals-value-row" key={index}>
              <select
                aria-label={t("협찬 종류")}
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
                  <option key={type} value={type}>
                    {t(type)}
                  </option>
                ))}
              </select>
              <input
                aria-label={t("금액 (원)")}
                inputMode="numeric"
                placeholder={t("금액 (원)")}
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
                aria-label={t("이 항목 지우기")}
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
              + {t("협찬 가치 추가")}
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend>{t("목표")}</legend>
          <div className="form-row goals-targets">
            {targetFields.map((field) => (
              <label key={field.key}>
                {t(field.label)}
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

        {draft.sponsors.length > 0 ? (
          <fieldset>
            <legend>{t("협찬사별 쿠폰")}</legend>
            <small className="field-hint">
              {t(
                "참여자는 협찬사마다 쿠폰을 따로 받고 각 매장은 자기 PIN으로 자기 쿠폰만 확인해요. 그래서 협찬사마다 성과가 따로 집계돼요.",
              )}
            </small>
            {draft.sponsors.map((sponsor) => (
              <div className="goals-sponsor" key={sponsor.id}>
                <strong>{sponsor.brandName}</strong>
                <div className="form-row">
                  <label>
                    {t("매장")}
                    <input
                      maxLength={30}
                      value={sponsor.store}
                      onChange={(event) => updateSponsor(sponsor.id, { store: event.target.value })}
                    />
                  </label>
                  <label>
                    {t("혜택")}
                    <input
                      maxLength={30}
                      value={sponsor.title}
                      onChange={(event) => updateSponsor(sponsor.id, { title: event.target.value })}
                    />
                  </label>
                </div>
                <div className="form-row">
                  {several && (
                    <label>
                      {t("협찬 가치 (원)")}
                      <input
                        inputMode="numeric"
                        value={sponsor.value}
                        onChange={(event) => updateSponsor(sponsor.id, { value: number(event.target.value) })}
                      />
                    </label>
                  )}
                  {report.staffPin !== undefined && !report.canRotatePin && (
                    <label>
                      {t("매장 직원 확인 PIN (숫자 6자리)")}
                      <input
                        inputMode="numeric"
                        maxLength={6}
                        value={sponsor.staffPin}
                        onChange={(event) => updateSponsor(sponsor.id, { staffPin: number(event.target.value).slice(0, 6) })}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
            {several && (
              <small className={shared === total ? "field-hint" : "field-hint goals-mismatch"}>
                {t("협찬사별 가치 합계 {shared}원 / 협찬 가치 합계 {total}원", {
                  shared: shared.toLocaleString("ko-KR"),
                  total: total.toLocaleString("ko-KR"),
                })}
                {shared === total ? "" : ` · ${t("두 합계가 같아야 저장돼요")}`}
              </small>
            )}
          </fieldset>
        ) : (
        <fieldset>
          <legend>{t("참여 쿠폰")}</legend>
          <div className="form-row">
            <label>
              {t("매장")}
              <input maxLength={30} value={draft.store} onChange={(event) => update({ store: event.target.value })} />
            </label>
            <label>
              {t("혜택")}
              <input maxLength={30} value={draft.title} onChange={(event) => update({ title: event.target.value })} />
            </label>
          </div>
          {report.staffPin !== undefined && !report.canRotatePin && (
            <label>
              {t("매장 직원 확인 PIN (숫자 6자리)")}
              <input
                inputMode="numeric"
                maxLength={6}
                value={draft.staffPin}
                onChange={(event) => update({ staffPin: number(event.target.value).slice(0, 6) })}
              />
            </label>
          )}
        </fieldset>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("목표 저장하기")}
        </button>
      </form>
    </Modal>
  )
}
