import { useState } from "react"

import { methodInfo } from "../data/methods"
import { t } from "../i18n"
import type { MethodKind, VenueShare } from "../types"
import { Icon } from "./Icon"

// What one side confirms at the venue for one share, a card per method:
// its count, then a number of samples to add (or take back), or one person
// at a time with a way to take back a mistake. Store visits have their own
// form on the staff page, so the coupon has no card here.
export function VenueCounters({
  share,
  busy,
  onCount,
}: {
  share: VenueShare
  busy: boolean
  onCount: (method: MethodKind, amount: number) => Promise<boolean>
}) {
  const kinds = share.kinds.filter((kind) => kind !== "coupon")
  if (kinds.length === 0) return null
  return (
    <ul className="venue-counters">
      {kinds.map((kind) => (
        <VenueCounter busy={busy} count={share.counts[methodInfo[kind].metric as keyof VenueShare["counts"]]} key={kind} kind={kind} onCount={onCount} />
      ))}
    </ul>
  )
}

function VenueCounter({
  kind,
  count,
  busy,
  onCount,
}: {
  kind: MethodKind
  count: number
  busy: boolean
  onCount: (method: MethodKind, amount: number) => Promise<boolean>
}) {
  const info = methodInfo[kind]
  const label = t(info.label)
  const [amount, setAmount] = useState("1")
  const quantity = Math.min(500, Math.max(1, Number(amount) || 1))
  return (
    <li className="venue-counter">
      <div className="venue-counter-head">
        <span>
          <Icon name={info.icon} size={16} /> {label}
        </span>
        <strong aria-live="polite">{count.toLocaleString("ko-KR")}</strong>
      </div>
      <p>{t(info.detail)}</p>
      {kind === "sampling" ? (
        <div className="venue-counter-actions">
          <label className="venue-amount">
            {t("수량")}
            <input
              inputMode="numeric"
              maxLength={3}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 3))}
              value={amount}
            />
          </label>
          <button
            aria-label={t("{method} {count}개 더하기", { method: label, count: quantity })}
            className="primary-button"
            disabled={busy}
            onClick={() => void onCount(kind, quantity)}
            type="button"
          >
            {t("더하기")}
          </button>
          <button
            aria-label={t("{method} {count}개 빼기", { method: label, count: quantity })}
            className="cancel-button"
            disabled={busy || count === 0}
            onClick={() => void onCount(kind, -Math.min(quantity, count))}
            type="button"
          >
            {t("빼기")}
          </button>
        </div>
      ) : (
        <div className="venue-counter-actions">
          <button
            aria-label={t("{method} 한 명 확인", { method: label })}
            className="primary-button"
            disabled={busy}
            onClick={() => void onCount(kind, 1)}
            type="button"
          >
            {t("한 명 확인")}
          </button>
          <button
            aria-label={t("{method} 하나 되돌리기", { method: label })}
            className="cancel-button"
            disabled={busy || count === 0}
            onClick={() => void onCount(kind, -1)}
            type="button"
          >
            {t("되돌리기")}
          </button>
        </div>
      )}
    </li>
  )
}
