import { useState } from "react"

import { sponsorOptions } from "../data/sponsorTypes"
import { t } from "../i18n"
import type { Agreement } from "../types"
import { Icon } from "./Icon"

// 협찬 형태(현금 · 제품 · 서비스 · 기타)마다의 표준 조항(#333, backend lib/contractTemplates.ts).
// 어느 쪽이든 형태를 고르면 그 형태의 조항과 공통 조항이 붙고, 형태의 기본 할 일이 더해진다.
// 바꾸면 두 쪽 모두 다시 확인한다. 문구는 법률 검토 전의 초안이다.
const kinds = sponsorOptions.브랜드.map((option) => option.value)

export function ContractClauses({
  agreement,
  busy,
  onApply,
}: {
  agreement: Agreement
  busy: boolean
  onApply: (kinds: string[]) => Promise<boolean>
}) {
  const applied = agreement.template?.kinds ?? []
  const clauses = agreement.clauses ?? []
  const canceled = Boolean(agreement.cancel?.canceledAt)
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<string[]>(applied)
  const open = () => {
    setPicked(applied.length ? applied : (agreement.terms?.kinds ?? []).filter((kind) => kinds.includes(kind)))
    setEditing(true)
  }
  const groups = [...kinds, "공통"]
    .map((kind) => ({ kind, items: clauses.filter((clause) => clause.kind === kind) }))
    .filter((group) => group.items.length)

  return (
    <section aria-labelledby="agreement-clauses-title" className="agreement-section contract-clauses">
      <h2 id="agreement-clauses-title">
        {t("협찬 형태별 표준 조항")}
        {!editing && !canceled && (
          <button className="subtle-link" onClick={open} type="button">
            <Icon name="edit" size={14} /> {clauses.length ? t("형태 바꾸기") : t("형태 고르기")}
          </button>
        )}
      </h2>
      {(clauses.length > 0 || editing) && (agreement.template?.draft ?? true) && (
        <p className="clauses-draft">{t("법률 검토 전 초안이에요. 검토가 끝나면 문구가 바뀔 수 있어요.")}</p>
      )}
      {editing ? (
        <form
          className="clauses-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onApply(kinds.filter((kind) => picked.includes(kind))).then((saved) => saved && setEditing(false))
          }}
        >
          <div aria-label={t("협찬 형태")} className="propose-kinds" role="group">
            {kinds.map((kind) => (
              <label className={picked.includes(kind) ? "chip-check checked" : "chip-check"} key={kind}>
                <input
                  checked={picked.includes(kind)}
                  onChange={() =>
                    setPicked((current) => (current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]))
                  }
                  type="checkbox"
                />
                {t(kind)}
              </label>
            ))}
          </div>
          <p className="field-hint">
            {t("고른 형태의 조항과 공통 조항이 붙고, 그 형태의 기본 할 일이 없으면 더해져요. 바꾸면 두 쪽 모두 다시 확인해요.")}
          </p>
          <div className="value-form-actions">
            <button className="cancel-button" onClick={() => setEditing(false)} type="button">
              {t("취소")}
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {picked.length ? t("조항 붙이기") : t("조항 떼기")}
            </button>
          </div>
        </form>
      ) : groups.length ? (
        <div className="clauses-groups">
          {groups.map((group) => (
            <div className="clauses-group" key={group.kind}>
              <h3>{t(group.kind)}</h3>
              <ol>
                {group.items.map((clause) => (
                  <li key={clause.id}>
                    <strong>{t(clause.title)}</strong>
                    <p>{t(clause.text)}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <p className="field-hint">
          {canceled ? t("붙인 표준 조항이 없어요.") : t("협찬 형태를 고르면 그에 맞는 기본 조항이 채워져요.")}
        </p>
      )}
    </section>
  )
}
