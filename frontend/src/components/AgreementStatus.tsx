import { t } from "../i18n"
import { dDayLabel, formatDateTime, formatDay } from "../lib/date"
import type { Agreement, ChatSide } from "../types"

type Action = { who: "me" | "them" | "both"; text: string; href?: string }

// 계약서 맨 위: 지금 상태, 누가 무엇을 해야 하는지, 기한. 긴 조항과 당사자 정보보다
// 먼저 보인다. 상태는 서버가 준 계약서(양쪽 확인, 협찬액, 수수료, 할 일)에서만 읽는다.
export function AgreementStatus({ agreement }: { agreement: Agreement }) {
  const side = agreement.side
  const other: ChatSide = side === "group" ? "brand" : "group"
  const otherMember = agreement[other].member
  const canceled = agreement.cancel?.canceledAt
  const mine = agreement.confirmed[side]
  const theirs = agreement.confirmed[other]
  const confirmed = Boolean(mine && (theirs || !otherMember))
  const left = (who: ChatSide) => agreement.items.filter((item) => item.side === who && !item.doneAt).length

  const headline = canceled
    ? t("취소된 협찬이에요. 기록으로만 남아요.")
    : confirmed
      ? t("협찬이 확정됐어요.")
      : !mine
        ? t("내 확인이 필요해요.")
        : t("상대의 확인을 기다려요.")
  const tone = canceled ? "canceled" : confirmed ? "done" : !mine ? "todo" : "waiting"

  const actions: Action[] = canceled
    ? []
    : [
        ...(agreement.fee.needsValue
          ? [{ who: "both" as const, text: t("협찬액(현금 + 현물)이 비어 있어요. 확인하기 전에 적어 주세요."), href: "#value-title" }]
          : []),
        ...(!mine
          ? [
              {
                who: "me" as const,
                text:
                  side === "brand" && agreement.fee.due > 0
                    ? t("조건을 읽고 계약서를 확인해 주세요. 확인할 때 성사 수수료를 결제해요.")
                    : t("조건을 읽고 계약서를 확인해 주세요."),
                href: "#agreement-confirm",
              },
            ]
          : []),
        ...(otherMember && !theirs ? [{ who: "them" as const, text: t("상대가 계약서를 확인해야 해요.") }] : []),
        ...(!otherMember ? [{ who: "them" as const, text: t("상대가 아직 uniconnect에 가입하지 않았어요. 연락처로 직접 알려 주세요.") }] : []),
        ...(confirmed && left(side) > 0
          ? [{ who: "me" as const, text: t("내 할 일 {count}개가 남았어요.", { count: left(side) }), href: "#agreement-items" }]
          : []),
        ...(confirmed && left(other) > 0 ? [{ who: "them" as const, text: t("상대의 할 일 {count}개가 남았어요.", { count: left(other) }) }] : []),
      ]

  const deliverBy = agreement.terms?.deliverBy
  return (
    <section aria-label={t("계약 상태")} className={`agreement-status ${tone}`}>
      <p className="agreement-status-line">
        <strong>{headline}</strong>
        {confirmed && !canceled && mine && (
          <small>{t("{date} 확인", { date: formatDateTime(theirs && theirs > mine ? theirs : mine) })}</small>
        )}
      </p>
      {actions.length > 0 && (
        <ul className="agreement-actions-list">
          {actions.map((action) => (
            <li key={action.text}>
              <span className={`who ${action.who}`}>
                {action.who === "me" ? t("나") : action.who === "them" ? t("상대") : t("양쪽")}
              </span>
              {action.href ? <a href={action.href}>{action.text}</a> : <span>{action.text}</span>}
            </li>
          ))}
        </ul>
      )}
      <dl className="agreement-deadlines">
        {deliverBy && (
          <div>
            <dt>{t("전달 기한")}</dt>
            <dd>
              {formatDay(deliverBy)} <em>{dDayLabel(deliverBy)}</em>
            </dd>
          </div>
        )}
        {agreement.eventDate && (
          <div>
            <dt>{t("행사")}</dt>
            <dd>
              {formatDay(agreement.eventDate)} <em>{dDayLabel(agreement.eventDate)}</em>
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}
