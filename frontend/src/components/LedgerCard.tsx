import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { formatWon } from "../lib/kpis"
import type { OwnLedger } from "../types"
import { Pill } from "./Pill"
import { ShareButton } from "./ShareButton"

const ledgerLink = (token: string) => `${location.origin}/ledger/${token}`

// 리포트 페이지의 협찬 결산 공개. 누구나 열 수 있는 링크(학생, 학교)로, 그룹이
// 받은 협찬을 나열한다. 금액은 그룹이 공개하기로 한 경우에만 보이고, 각
// 항목에는 어떻게 썼는지 설명하는 메모가 붙는다.
export function LedgerCard({ onNotice }: { onNotice: (message: string) => void }) {
  const [data, setData] = useState<OwnLedger | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const show = (next: OwnLedger) => {
    setData(next)
    setNotes(Object.fromEntries(next.entries.map((entry) => [entry.id, entry.note ?? ""])))
  }
  useEffect(() => {
    api.ledger().then(show, () => undefined)
  }, [])
  const run = async (change: () => Promise<OwnLedger>, done: string) => {
    setBusy(true)
    try {
      show(await change())
      onNotice(done)
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null
  return (
    <div className="analytics-card history-card ledger-card" data-reveal>
      <div className="history-head">
        <div>
          <p className="section-title">{t("협찬 결산 공개")}</p>
          <small className="field-hint">{t("학생들에게 받은 협찬과 쓰임을 링크 하나로 공개해요. 링크를 아는 누구나 볼 수 있어요.")}</small>
        </div>
        {data.token ? (
          <Pill disabled={busy} onClick={() => void run(api.stopLedgerLink, t("공개를 멈췄어요. 예전 링크는 더 열리지 않아요."))} variant="outline">
            {t("공개 멈추기")}
          </Pill>
        ) : (
          <Pill disabled={busy} onClick={() => void run(api.makeLedgerLink, t("공개 링크를 만들었어요."))}>
            {t("공개 링크 만들기")}
          </Pill>
        )}
      </div>
      {data.token && (
        <div className="ledger-share">
          <code className="invite-link">{ledgerLink(data.token)}</code>
          <ShareButton title={t("협찬 결산")} url={ledgerLink(data.token)} />
          <label className="ledger-toggle">
            <input
              checked={data.showValues}
              disabled={busy}
              onChange={(event) => void run(() => api.saveLedger({ showValues: event.target.checked }), t("공개 설정을 바꿨어요."))}
              type="checkbox"
            />
            {t("협찬 금액도 보여 주기")}
          </label>
        </div>
      )}
      {data.entries.length === 0 ? (
        <p className="day-empty">{t("확정된 협찬이 생기면 여기에 쌓여요.")}</p>
      ) : (
        <ul className="ledger-list">
          {data.entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.brandName}</strong>
                <small>
                  {entry.eventName}
                  {entry.eventDate ? ` · ${formatFullDate(entry.eventDate)}` : ""}
                  {entry.value !== undefined ? ` · ${formatWon(entry.value)}` : ""}
                </small>
              </div>
              <p>{entry.gives}</p>
              <form
                className="ledger-note-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(() => api.saveLedger({ notes: { [entry.id]: notes[entry.id] ?? "" } }), t("메모를 저장했어요."))
                }}
              >
                <input
                  aria-label={t("{name} 협찬의 쓰임 메모", { name: entry.brandName })}
                  maxLength={200}
                  onChange={(event) => setNotes({ ...notes, [entry.id]: event.target.value })}
                  placeholder={t("예) 음료 300잔을 축제 부스에서 선착순으로 나눴어요.")}
                  value={notes[entry.id] ?? ""}
                />
                <button className="cancel-button" disabled={busy || (notes[entry.id] ?? "") === (entry.note ?? "")} type="submit">
                  {t("저장")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
