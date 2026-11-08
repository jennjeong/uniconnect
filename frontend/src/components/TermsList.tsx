import { t } from "../i18n"
import { formatDay } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { ProposalTerms } from "../types"

// 제안의 조건을 한 표로. 받은 제안 · 보낸 제안 · 수락 확인 · 계약서가 같은 것을
// 보인다. 조건이 없는 예전 제안은 `fallback`(상대 소개의 협찬 문구)만 보인다.
export function TermsList({ terms, fallback }: { terms?: ProposalTerms; fallback?: string }) {
  const rows = terms
    ? [
        ...(terms.kinds?.length ? [[t("협찬 형태"), terms.kinds.map((kind) => t(kind)).join(" · ")]] : []),
        ...(terms.amount !== undefined ? [[t("금액"), fullWon(terms.amount)]] : []),
        ...(terms.quantity ? [[t("내용 · 수량"), terms.quantity]] : []),
        ...(terms.deliverBy ? [[t("전달 기한"), formatDay(terms.deliverBy)]] : []),
        ...(terms.benefits ? [[t("제공 혜택"), terms.benefits]] : []),
        ...(terms.respondBy ? [[t("응답 기한"), formatDay(terms.respondBy)]] : []),
        ...(terms.schedule ? [[t("일정 조정 요청"), formatDay(terms.schedule.date)]] : []),
      ]
    : []
  if (rows.length === 0) {
    return fallback ? (
      <dl className="terms-list">
        <div>
          <dt>{t("협찬 내용")}</dt>
          <dd>{fallback}</dd>
        </div>
        <div>
          <dt>{t("세부 조건")}</dt>
          <dd className="terms-missing">{t("정하지 않았어요 · 계약서에서 정해요")}</dd>
        </div>
      </dl>
    ) : null
  }
  return (
    <dl className="terms-list">
      {rows.map(([label, value]) => (
        <div className={label === t("일정 조정 요청") ? "terms-flag" : undefined} key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
