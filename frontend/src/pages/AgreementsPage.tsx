import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { DisputeRecord } from "../components/DisputePanel"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { t, tc } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { AgreementSummary, ChatSide, Dispute } from "../types"

// 보는 쪽에서 본 계약서의 진행 상태.
export function agreementState(confirmed: Partial<Record<ChatSide, string>>, side: ChatSide) {
  if (confirmed.group && confirmed.brand) return { label: "양쪽 확인", className: "done" }
  if (confirmed[side]) return { label: "상대 확인 기다리는 중", className: "waiting" }
  return { label: "내 확인 필요", className: "todo" }
}

// 계정이 참여한 모든 협찬(양방향으로 수락된 제안). 각각 계약서가 어디까지
// 왔는지(확인, 완료한 항목, 지금까지의 증빙)를 보여 준다.
export function AgreementsPage({
  loggedIn,
  onBack,
  onLogin,
  onOpen,
  onNotice,
}: {
  loggedIn: boolean
  onBack: () => void
  onLogin: () => void
  onOpen: (id: string) => void
  onNotice: (message: string) => void
}) {
  const [list, setList] = useState<AgreementSummary[]>()
  const [failed, setFailed] = useState("")
  // 상대가 탈퇴해 계약서가 사라진 협찬의 분쟁(결론 난 뒤 3년 보관). 계약서 화면에서는 볼 수
  // 없어서 여기에 남긴다.
  const [orphans, setOrphans] = useState<Dispute[]>([])

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    api.agreements().then(
      (result) => {
        if (cancelled) return
        setList(result.agreements)
        const open = new Set(result.agreements.map((item) => item.id))
        api.allDisputes().then(
          (found) => {
            if (!cancelled) setOrphans(found.disputes.filter((dispute) => !open.has(dispute.agreementId)))
          },
          () => undefined,
        )
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
        eyebrow={tc("eyebrow", "계약서 목록")}
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
      {orphans.length > 0 && (
        <section aria-labelledby="agreements-disputes-title" className="agreements-disputes">
          <h2 id="agreements-disputes-title">{t("계약서가 없어진 협찬의 분쟁 기록")}</h2>
          <p className="field-hint">{t("상대가 탈퇴해 계약서는 지워졌지만, 결론이 난 분쟁 기록은 정해진 기간 동안 남아요.")}</p>
          <ol className="dispute-list">
            {orphans.map((dispute) => (
              <DisputeRecord
                dispute={dispute}
                key={dispute.id}
                onChange={(next) => setOrphans((items) => items.map((item) => (item.id === next.id ? next : item)))}
                onNotice={onNotice}
                partner={t(dispute.side === "group" ? dispute.brandName : dispute.groupName)}
              />
            ))}
          </ol>
        </section>
      )}
    </section>
  )
}
