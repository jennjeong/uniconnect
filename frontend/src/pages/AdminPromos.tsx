import { useEffect, useState, type FormEvent } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatFullDate, todayIso } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { PaymentKind, PromoRow } from "../types"

type Notice = (message: string) => void

const kinds: { value: PaymentKind; label: string }[] = [
  { value: "pro", label: "Growth" },
  { value: "ad", label: "상단 광고" },
  { value: "local", label: "Campus Local" },
  { value: "program", label: "캠퍼스 캠페인" },
]

const stateLabels: Record<PromoRow["state"], string> = { active: "사용 중", scheduled: "시작 전", ended: "끝남", disabled: "꺼짐" }

const empty = () => ({ code: "", note: "", type: "percent" as "percent" | "amount", value: "", kinds: [] as PaymentKind[], from: todayIso(), until: "", maxUses: "100" })

// 결제 · 매출의 프로모션 코드(#346, backend lib/promo.ts). 만들고, 쓴 횟수와 할인 합계를 보고,
// 끈다. 할인은 부가세 전 공급가액에서 빼고 공급가액 1,000원은 남긴다. 한 계정은 한 코드를 한 번 쓴다.
export function PromoCodes({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [promos, setPromos] = useState<PromoRow[]>()
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.adminPromos(token).then(
      (answer) => setPromos(answer.promos),
      (error) => onNotice(errorMessage(error)),
    )
  }, [token, onNotice])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const value = Number(form.value.replace(/[^0-9]/g, ""))
      const answer = await api.adminCreatePromo(token, {
        code: form.code,
        note: form.note,
        ...(form.type === "percent" ? { percent: value } : { amountOff: value }),
        kinds: form.kinds,
        startsOn: form.from,
        endsOn: form.until,
        maxUses: Number(form.maxUses),
      })
      setPromos(answer.promos)
      setForm(empty())
      onNotice(t("프로모션 코드를 만들었어요."))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const disable = async (promo: PromoRow) => {
    setBusy(true)
    try {
      setPromos((await api.adminDisablePromo(token, promo.code)).promos)
      onNotice(t("{code} 코드를 껐어요.", { code: promo.code }))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const toggleKind = (kind: PaymentKind) =>
    setForm({ ...form, kinds: form.kinds.includes(kind) ? form.kinds.filter((item) => item !== kind) : [...form.kinds, kind] })

  return (
    <div className="console-grid">
      <section className="console-card span-2">
        <div className="console-card-head">
          <div>
            <h2>{t("프로모션 코드")}</h2>
            <p>{t("부가세 전 금액에서 할인해요. 한 계정은 한 코드를 한 번만 쓰고, 공급가액 1,000원은 남겨요.")}</p>
          </div>
        </div>
        <form className="console-form" onSubmit={(event) => void create(event)}>
          <div className="console-form-row">
            <label>
              {t("코드")}
              <input
                autoCapitalize="characters"
                maxLength={20}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                placeholder="FIRST-MONTH"
                required
                value={form.code}
              />
            </label>
            <label>
              {t("메모 (선택)")}
              <input maxLength={60} onChange={(event) => setForm({ ...form, note: event.target.value })} value={form.note} />
            </label>
          </div>
          <div className="console-form-row">
            <label>
              {t("할인 방식")}
              <select onChange={(event) => setForm({ ...form, type: event.target.value as "percent" | "amount" })} value={form.type}>
                <option value="percent">{t("비율(%)")}</option>
                <option value="amount">{t("금액(원)")}</option>
              </select>
            </label>
            <label>
              {form.type === "percent" ? t("할인 비율(1~90)") : t("할인 금액(원)")}
              <input inputMode="numeric" onChange={(event) => setForm({ ...form, value: event.target.value })} required value={form.value} />
            </label>
            <label>
              {t("사용 횟수")}
              <input inputMode="numeric" onChange={(event) => setForm({ ...form, maxUses: event.target.value })} required value={form.maxUses} />
            </label>
            <label>
              {t("시작일")}
              <input onChange={(event) => setForm({ ...form, from: event.target.value })} required type="date" value={form.from} />
            </label>
            <label>
              {t("종료일")}
              <input min={form.from || undefined} onChange={(event) => setForm({ ...form, until: event.target.value })} required type="date" value={form.until} />
            </label>
          </div>
          <fieldset className="console-kinds">
            <legend>{t("쓸 수 있는 상품 (고르지 않으면 모두)")}</legend>
            {kinds.map((kind) => (
              <label key={kind.value}>
                <input checked={form.kinds.includes(kind.value)} onChange={() => toggleKind(kind.value)} type="checkbox" />
                {t(kind.label)}
              </label>
            ))}
          </fieldset>
          <button className="primary-button" disabled={busy || !form.code.trim() || !form.value.trim()} type="submit">
            {t("코드 만들기")}
          </button>
        </form>
      </section>

      <section className="console-card span-2">
        <table className="console-table plain">
          <caption className="console-caption">{t("만든 코드")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("코드")}</th>
              <th scope="col">{t("할인")}</th>
              <th scope="col">{t("기간")}</th>
              <th scope="col">{t("사용")}</th>
              <th scope="col">{t("할인 합계")}</th>
              <th scope="col">{t("상태")}</th>
              <th scope="col">
                <span className="sr-only">{t("코드 끄기")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(promos ?? []).length === 0 ? (
              <tr>
                <td colSpan={7}>{promos ? t("아직 만든 코드가 없어요.") : t("불러오고 있어요…")}</td>
              </tr>
            ) : (
              promos!.map((promo) => (
                <tr key={promo.code}>
                  <th scope="row">
                    {promo.code}
                    {promo.note && <small className="console-sub">{promo.note}</small>}
                  </th>
                  <td>{promo.percent ? `${promo.percent}%` : fullWon(promo.amountOff ?? 0)}</td>
                  <td>
                    {formatFullDate(promo.startsOn)} ~ {formatFullDate(promo.endsOn)}
                  </td>
                  <td>{t("{used} / {max}회", { used: promo.used, max: promo.maxUses })}</td>
                  <td>{fullWon(promo.discounted)}</td>
                  <td>{t(stateLabels[promo.state])}</td>
                  <td>
                    {promo.state !== "disabled" && promo.state !== "ended" && (
                      <button
                        aria-label={t("{code} 코드 끄기", { code: promo.code })}
                        className="console-inline"
                        disabled={busy}
                        onClick={() => void disable(promo)}
                        type="button"
                      >
                        {t("끄기")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
