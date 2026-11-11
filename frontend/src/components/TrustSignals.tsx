import { t } from "../i18n"
import type { Trust } from "../types"

// 회원의 응답률과 브랜드의 이행률(#343, backend lib/trust.ts). 건수가 3보다 적으면 서버가
// 비율을 보내지 않아 숫자 대신 기록이 적다고 쓴다. 예시와 데모 계정에는 trust가 없다.
export function TrustSignals({ trust }: { trust?: Trust }) {
  if (!trust) return null
  const rows = [
    {
      label: t("응답률"),
      about: t("받은 제안 중 마감 전에 답한 비율"),
      figure: trust.response,
    },
    ...(trust.fulfilment
      ? [{ label: t("이행률"), about: t("지급 예정일까지 단체가 수령을 표시한 현금 협찬 비율"), figure: trust.fulfilment }]
      : []),
  ]
  return (
    <>
      <h3 className="profile-heading">{t("약속을 지킨 기록")}</h3>
      <dl className="trust-signals">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <strong>{row.figure.rate === undefined ? t("아직 기록이 적어요") : `${row.figure.rate}%`}</strong>
              <small>
                {row.about} · {t("{count}건 기준", { count: row.figure.count })}
              </small>
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}
