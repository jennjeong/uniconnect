import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { AgreementSummary, ChatSide } from "../types"

// Where an agreement stands for the side looking.
export function agreementState(confirmed: Partial<Record<ChatSide, string>>, side: ChatSide) {
  if (confirmed.group && confirmed.brand) return { label: "양쪽 확인", className: "done" }
  if (confirmed[side]) return { label: "상대 확인 기다리는 중", className: "waiting" }
  return { label: "내 확인 필요", className: "todo" }
}

// Every sponsorship the account is in (accepted proposals both ways), each
// with how far its agreement is: the confirmations, the items done and the
// proof so far.
export function AgreementsPage({
  loggedIn,
  onBack,
  onLogin,
  onOpen,
}: {
  loggedIn: boolean
  onBack: () => void
  onLogin: () => void
  onOpen: (id: string) => void
}) {
  const [list, setList] = useState<AgreementSummary[]>()
  const [failed, setFailed] = useState("")

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    api.agreements().then(
      (result) => {
        if (!cancelled) setList(result.agreements)
      },
      (error) => {
        if (!cancelled) setFailed(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [loggedIn])

  return (
    <section className="page-view agreements-view">
      <PageIntro
        onBack={onBack}
        eyebrow="Agreements"
        title={t("임시 전자 계약서")}
        description={t("협찬마다 할 일을 함께 정하고, 끝낸 일은 사진으로 남겨요.")}
      />
      {!loggedIn ? (
        <div className="day-empty messages-empty">
          <p>{t("로그인하면 확정된 협찬의 계약서를 볼 수 있어요.")}</p>
          <button className="primary-button" onClick={onLogin} type="button">
            {t("로그인")}
          </button>
        </div>
      ) : failed ? (
        <p className="day-empty">{failed}</p>
      ) : !list ? (
        <p className="day-empty">{t("계약서를 불러오고 있어요…")}</p>
      ) : list.length === 0 ? (
        <p className="day-empty">{t("확정된 협찬이 생기면 여기에서 계약서를 확인할 수 있어요.")}</p>
      ) : (
        <ul className="agreement-list stagger">
          {list.map((item, index) => {
            const state = agreementState(item.confirmed, item.side)
            return (
              <li key={item.id} style={{ "--i": index } as CSSProperties}>
                <button className="agreement-row" onClick={() => onOpen(item.id)} type="button">
                  <span className="agreement-row-main">
                    <strong>{item.partner}</strong>
                    <span>
                      {item.eventName}
                      {item.eventDate && ` · ${formatFullDate(item.eventDate)}`}
                    </span>
                  </span>
                  {item.canceled ? (
                    <span className="agreement-state canceled">{t("취소된 협찬")}</span>
                  ) : (
                    <span className={`agreement-state ${state.className}`}>{t(state.label)}</span>
                  )}
                  <span className="agreement-row-counts">
                    {t("할 일 {done}/{total}", { done: item.done, total: item.total })}
                    <span aria-hidden="true"> · </span>
                    {t("증빙 {count}개", { count: item.proof })}
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
