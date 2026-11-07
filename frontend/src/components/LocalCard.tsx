import { useCallback, useEffect, useState, type FormEvent } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { LocalInfo, LocalReport } from "../types"
import { Presence } from "./Presence"
import { QrCode } from "./QrCode"

const rate = (value: number | null) => (value === null ? "–" : `${value}%`)

// 브랜드의 Campus Local(backend routes/local.ts). 상시 쿠폰 QR과 직원 확인, 월간
// 기본 리포트를 담는다. 판매가 열리기 전에는 아무것도 보이지 않는다.
export function LocalCard({ onNotice }: { onNotice: (message: string) => void }) {
  const [info, setInfo] = useState<LocalInfo>()
  const [buying, setBuying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [store, setStore] = useState("")
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<LocalReport>()

  const show = useCallback((next: LocalInfo) => {
    setInfo(next)
    setStore(next.campaign?.store ?? "")
    setTitle(next.campaign?.title ?? "")
  }, [])

  useEffect(() => {
    let cancelled = false
    api.local().then(
      (result) => {
        if (!cancelled) show(result)
      },
      (error: unknown) => {
        if (!cancelled) onNotice(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [onNotice, show])

  const code = info?.campaign?.code
  useEffect(() => {
    if (!code) return
    let cancelled = false
    api.localReport().then(
      (result) => {
        if (!cancelled) setReport(result)
      },
      (error: unknown) => {
        if (!cancelled) onNotice(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [code, onNotice])

  if (!info?.onSale) return null
  const { campaign } = info
  const running = info.until !== null && info.until >= new Date().toISOString().slice(0, 10)

  const save = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const body = { store: store.trim(), title: title.trim() }
    ;(campaign ? api.updateLocalCampaign(body) : api.openLocalCampaign(body))
      .then(
        (result) => {
          show({ ...info, campaign: result.campaign })
          setEditing(false)
          onNotice(t("상시 쿠폰을 저장했어요."))
        },
        (error: unknown) => onNotice(errorMessage(error)),
      )
      .finally(() => setBusy(false))
  }

  const changePin = () => {
    setBusy(true)
    api
      .rotateLocalPin()
      .then(
        (result) => {
          show({ ...info, campaign: result.campaign })
          onNotice(t("직원 PIN을 바꿨어요. 예전 PIN은 바로 막혀요."))
        },
        (error: unknown) => onNotice(errorMessage(error)),
      )
      .finally(() => setBusy(false))
  }

  const pickMonth = (month: string) =>
    void api.localReport(month).then(setReport, (error: unknown) => onNotice(errorMessage(error)))

  const form = (
    <form className="local-form" onSubmit={save}>
      <label>
        {t("매장 이름")}
        <input maxLength={30} onChange={(event) => setStore(event.target.value)} value={store} />
      </label>
      <label>
        {t("쿠폰 혜택")}
        <input maxLength={30} onChange={(event) => setTitle(event.target.value)} value={title} />
      </label>
      <button className="primary-button" disabled={busy || !store.trim() || !title.trim()} type="submit">
        {campaign ? t("저장하기") : t("상시 쿠폰 만들기")}
      </button>
    </form>
  )

  return (
    <div className="local-card">
      <strong>Campus Local</strong>
      {info.includedInGrowth ? (
        <p className="plan-status">{t("Growth에 포함돼 있어요 · {date}까지", { date: formatFullDate(info.until ?? "") })}</p>
      ) : running ? (
        <p className="plan-status">{t("쓰고 있어요 · {date}까지", { date: formatFullDate(info.until ?? "") })}</p>
      ) : (
        <p className="plan-status">
          {t("{price} / {days}일 · 부가세 포함 {total}", { price: fullWon(info.price), days: info.days, total: fullWon(info.priceWithVat) })}
        </p>
      )}
      {!info.includedInGrowth && (
        <button className="cancel-button" onClick={() => setBuying(true)} type="button">
          {running ? t("Campus Local {days}일 연장하기", { days: info.days }) : t("Campus Local 시작하기")}
        </button>
      )}

      {!campaign && running && form}

      {campaign && (
        <>
          {!campaign.open && <p className="field-hint">{t("이용 기간이 끝나 새 쿠폰을 주지 않아요. 이미 나간 쿠폰은 기한까지 쓸 수 있어요.")}</p>}
          {editing ? (
            form
          ) : (
            <div className="local-campaign">
              <div>
                <p>
                  <strong>{campaign.store}</strong> · {campaign.title}
                </p>
                <p className="field-hint">{t("쿠폰은 받은 날부터 {days}일 동안 쓸 수 있어요.", { days: campaign.couponDays })}</p>
                <p className="field-hint">
                  {t("직원 화면")}: {`${location.origin}/check-in/${campaign.code}/staff`}
                </p>
                <p className="field-hint">
                  {t("직원 PIN")}: <code>{campaign.staffPin}</code>
                  {campaign.pinMissesToday > 0 && ` · ${t("오늘 틀린 횟수 {count}", { count: campaign.pinMissesToday })}`}
                </p>
                <div className="local-actions">
                  <button className="cancel-button" onClick={() => setEditing(true)} type="button">
                    {t("매장과 혜택 고치기")}
                  </button>
                  <button className="cancel-button" disabled={busy} onClick={changePin} type="button">
                    {t("직원 PIN 바꾸기")}
                  </button>
                </div>
              </div>
              <QrCode label={t("{name} 상시 쿠폰 QR 코드", { name: campaign.store })} value={`${location.origin}/check-in/${campaign.code}`} />
            </div>
          )}

          {report && (
            <section aria-label={t("월간 리포트")} className="local-report">
              <label>
                {t("월간 리포트")}
                <select onChange={(event) => pickMonth(event.target.value)} value={report.month}>
                  {[...new Set([report.month, ...report.months])].map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <dl>
                <div>
                  <dt>{t("QR 스캔")}</dt>
                  <dd>{report.scans.toLocaleString("ko-KR")}</dd>
                </div>
                <div>
                  <dt>{t("쿠폰 수령")}</dt>
                  <dd>
                    {report.coupons.toLocaleString("ko-KR")} <small>{rate(report.couponRate)}</small>
                  </dd>
                </div>
                <div>
                  <dt>{t("쿠폰 사용")}</dt>
                  <dd>
                    {report.visits.toLocaleString("ko-KR")} <small>{rate(report.visitRate)}</small>
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </>
      )}

      <Presence show={buying}>
        <PaymentModal
          amount={info.price}
          kind="local"
          lines={[
            { label: t("상품"), value: "Campus Local" },
            { label: t("기간"), value: t("{days}일", { days: info.days }) },
          ]}
          onClose={() => setBuying(false)}
          onTransferAsked={() => {
            setBuying(false)
            onNotice(t("계좌 입금을 요청했어요. 입금이 확인되면 Campus Local이 시작돼요."))
          }}
          targetId=""
          title={t("Campus Local 결제")}
        />
      </Presence>
    </div>
  )
}
