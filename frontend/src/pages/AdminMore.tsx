import { useCallback, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { TabBar } from "../components/TabBar"
import {
  disputeEventLabels,
  disputeOutcomeLabel,
  disputeOutcomes,
  disputeReasonLabel,
  disputeStatusLabels,
  snapshotAgreement,
} from "../data/disputes"
import { faqs, faqTopics } from "../data/faq"
import { locale, t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { saveFile } from "../lib/download"
import { fullWon } from "../lib/sponsorships"
import type { Dispute, DisputeEvent, DisputeOutcome } from "../types"
import type { AdminAgreementRow, AdminEventRow, AdminInsights, AdminInvites, AdminLive, AdminPayment, AdminPostRow, AdminProposalDetail, AdminReviewRow, AdminStaleProposal, AdminSystem, AgreementState, BackupSummary, FaqTopicKey, SiteFaq } from "../types"
import { CsvButton } from "./AdminTools"

// 운영자 콘솔의 나머지(pages/AdminPage.tsx): 분석, 협찬 운영, 오늘의 행사,
// 콘텐츠와 시스템, 그리고 결제 화면이 보여 주는 매출 패널과 제안 서랍.

type Notice = (message: string) => void

// 토큰마다 한 번, 그리고 `reload`일 때 다시 불러온다. 오류는 알림으로 보여
// 준다.
function useAdmin<T>(load: () => Promise<T>, onNotice: Notice, deps: unknown[]) {
  const [data, setData] = useState<T>()
  const [failed, setFailed] = useState(false)
  const run = useCallback(() => {
    setFailed(false)
    return load().then(setData, (error: unknown) => {
      setFailed(true)
      onNotice(errorMessage(error))
    })
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void run()
  }, [run])
  return [data, run, setData, failed] as const
}

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100))

// 라벨이 붙은 개수의 가로 막대.
function Bars({ rows, unit = "" }: { rows: { label: string; count: number }[]; unit?: string }) {
  const top = Math.max(1, ...rows.map((row) => row.count))
  if (rows.length === 0) return <p className="day-empty">{t("아직 데이터가 없어요.")}</p>
  return (
    <ul className="console-hbars">
      {rows.map((row) => (
        <li key={row.label}>
          <span>{row.label}</span>
          <strong>
            {row.count.toLocaleString(locale)}
            {unit}
          </strong>
          <i style={{ width: `${(row.count / top) * 100}%` }} />
        </li>
      ))}
    </ul>
  )
}

const kpiLabels = { signups: "가입", proposals: "제안", revenue: "매출" } as const

// 회원을 지역의 간단한 스케치 위에 보여 준다. 캠퍼스는 소속 단체 수에 따른 원,
// 가게는 작은 사각형이며 여백을 두고 점에 맞춘다(지도 타일이 없어서 지도
// 서비스로 나가는 요청이 없다).
function MemberMap({ map }: { map: AdminInsights["distribution"]["map"] }) {
  const points = [...map.groups, ...map.brands]
  if (points.length === 0) return <p className="day-empty">{t("위치를 아는 회원이 아직 없어요.")}</p>
  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const pad = 0.01
  const [south, north] = [Math.min(...lats) - pad, Math.max(...lats) + pad]
  const [west, east] = [Math.min(...lngs) - pad, Math.max(...lngs) + pad]
  const width = 800
  const height = 360
  // 경도는 위도에 따라 줄어든다. 두 축을 같은 비율로 줄여 모양을 유지한다.
  const squeeze = Math.cos((((south + north) / 2) * Math.PI) / 180)
  const scale = Math.min(width / ((east - west) * squeeze), height / (north - south))
  const x = (lng: number) => width / 2 + (lng - (west + east) / 2) * squeeze * scale
  const y = (lat: number) => height / 2 - (lat - (south + north) / 2) * scale
  const top = Math.max(1, ...map.groups.map((group) => group.count))
  return (
    <figure className="console-map">
      <svg aria-label={t("회원 지도")} role="img" viewBox={`0 0 ${width} ${height}`}>
        {map.brands.map((brand) => (
          <rect className="brand" height={10} key={`${brand.name}-${brand.lat}`} width={10} x={x(brand.lng) - 5} y={y(brand.lat) - 5}>
            <title>{brand.name}</title>
          </rect>
        ))}
        {map.groups.map((group) => (
          <g key={group.name}>
            <circle className="campus" cx={x(group.lng)} cy={y(group.lat)} r={8 + (group.count / top) * 16}>
              <title>{t("{name} · 학생단체 {count}", { name: group.name, count: group.count })}</title>
            </circle>
            <text x={x(group.lng)} y={y(group.lat) + 8 + (group.count / top) * 16 + 16}>
              {group.name} {group.count}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span className="campus">{t("캠퍼스 (학생단체 수)")}</span>
        <span className="brand">{t("브랜드 매장")}</span>
      </figcaption>
    </figure>
  )
}

// 분석 화면: 이번 달과 목표, 퍼널, 코호트, 회원 위치, 사람들이 검색하는 것.
export function Insights({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload] = useAdmin(() => api.adminInsights(token), onNotice, [token])
  const [editing, setEditing] = useState(false)
  const [targets, setTargets] = useState({ signups: "", proposals: "", revenue: "" })
  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  const first = data.funnel[0]?.count ?? 0
  return (
    <div className="console-grid">
      <section className="console-card wide">
        <div className="console-card-head">
          <div>
            <h2>{t("이번 달 목표")}</h2>
            <p>{t("실제 회원만 세요. 매출은 결제 완료 금액이에요.")}</p>
          </div>
          <button
            className="console-text-button"
            onClick={() => {
              setTargets({
                signups: String(data.kpi.find((item) => item.key === "signups")?.target ?? ""),
                proposals: String(data.kpi.find((item) => item.key === "proposals")?.target ?? ""),
                revenue: String(data.kpi.find((item) => item.key === "revenue")?.target ?? ""),
              })
              setEditing(!editing)
            }}
            type="button"
          >
            {editing ? t("닫기") : t("목표 정하기")}
          </button>
        </div>
        {editing && (
          <form
            className="console-form console-form-row"
            onSubmit={(event) => {
              event.preventDefault()
              const value = (text: string) => (text.trim() === "" ? null : Number(text))
              api
                .adminSetKpi(token, { signups: value(targets.signups), proposals: value(targets.proposals), revenue: value(targets.revenue) })
                .then(
                  () => {
                    setEditing(false)
                    onNotice(t("목표를 저장했어요."))
                    return reload()
                  },
                  (error: unknown) => onNotice(errorMessage(error)),
                )
            }}
          >
            {(["signups", "proposals", "revenue"] as const).map((key) => (
              <label key={key}>
                {t(kpiLabels[key])}
                <input
                  inputMode="numeric"
                  onChange={(event) => setTargets({ ...targets, [key]: event.target.value.replace(/\D/g, "") })}
                  value={targets[key]}
                />
              </label>
            ))}
            <button className="primary-button" type="submit">
              {t("저장")}
            </button>
          </form>
        )}
        <div className="console-kpis">
          {data.kpi.map((item) => {
            const share = item.target ? Math.min(100, percent(item.actual, item.target)) : null
            const format = (value: number) => (item.key === "revenue" ? fullWon(value) : value.toLocaleString(locale))
            return (
              <div key={item.key}>
                <span>{t(kpiLabels[item.key])}</span>
                <strong>{format(item.actual)}</strong>
                <small>{item.target ? t("목표 {target} · {share}%", { target: format(item.target), share: share ?? 0 }) : t("목표 없음")}</small>
                <i>
                  <b style={{ width: `${share ?? 0}%` }} />
                </i>
              </div>
            )
          })}
        </div>
      </section>

      <section className="console-card span-2">
        <h2>{t("전환 퍼널")}</h2>
        <ol className="console-funnel">
          {data.funnel.map((step, index) => (
            <li key={step.step}>
              <span>{t(step.step)}</span>
              <i style={{ width: `${Math.max(2, percent(step.count, Math.max(1, first)))}%` }} />
              <strong>{step.count.toLocaleString(locale)}</strong>
              <small>
                {index === 0
                  ? "100%"
                  : t("앞 단계의 {share}%", { share: percent(step.count, data.funnel[index - 1].count) })}
              </small>
            </li>
          ))}
        </ol>
      </section>

      <section className="console-card span-2">
        <h2>{t("가입 주별 리텐션")}</h2>
        <p className="field-hint">{t("가입한 주 뒤 1~4주에 행사 등록 · 제안 · 로그인 중 하나라도 한 회원의 몫이에요.")}</p>
        <table className="console-table plain console-cohort">
          <thead>
            <tr>
              <th scope="col">{t("가입 주")}</th>
              <th scope="col">{t("회원")}</th>
              {[1, 2, 3, 4].map((week) => (
                <th key={week} scope="col">
                  {t("{week}주 뒤", { week })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((row) => (
              <tr key={row.week}>
                <th scope="row">{row.week.slice(5).replace("-", "/")}</th>
                <td>{row.size}</td>
                {row.active.map((share, index) => (
                  <td key={index} style={share === null ? undefined : { background: `rgba(49, 130, 246, ${share / 120})` }}>
                    {share === null ? "" : `${share}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="console-card wide">
        <h2>{t("회원 지도")}</h2>
        <p className="field-hint">{t("학생단체는 캠퍼스에, 브랜드는 매장에 표시해요. 위치를 모르는 회원은 빠져요.")}</p>
        <MemberMap map={data.distribution.map} />
      </section>

      <section className="console-card span-2">
        <h2>{t("학교별 학생단체")}</h2>
        <Bars rows={data.distribution.schools.slice(0, 10)} />
      </section>
      <section className="console-card span-2">
        <h2>{t("업종별 브랜드")}</h2>
        <Bars rows={data.distribution.industries.map((row) => ({ ...row, label: t(row.label) }))} />
      </section>
      <section className="console-card span-2">
        <h2>{t("많이 찾은 검색어")}</h2>
        <p className="field-hint">{t("누가 찾았는지는 남기지 않고 횟수만 세요.")}</p>
        <Bars rows={data.searches.slice(0, 15).map((row) => ({ label: row.term, count: row.count }))} />
      </section>
      <section className="console-card span-2">
        <h2>{t("종류별 회원")}</h2>
        <Bars rows={data.distribution.types.slice(0, 10).map((row) => ({ ...row, label: t(row.label) }))} />
      </section>
    </div>
  )
}

// 이미 불러온 결제로 계산한 상품별 월 매출, 사유별 환불, 월 정산 파일.
export function RevenuePanel({ payments }: { payments: AdminPayment[] }) {
  const paid = payments.filter((payment) => payment.status === "paid" && payment.method !== "grant")
  const months = [...new Set(paid.map((payment) => (payment.paidAt ?? payment.requestedAt).slice(0, 7)))].sort().slice(-6)
  const kinds = ["fee", "report", "pro", "ad", "local"] as const
  const kindLabels = { fee: "수수료", report: "상세 리포트", pro: "Growth", ad: "상단 광고", local: "Campus Local" }
  const byMonth = months.map((month) => {
    const rows = paid.filter((payment) => (payment.paidAt ?? payment.requestedAt).startsWith(month))
    return { month, ...Object.fromEntries(kinds.map((kind) => [kind, rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.amount, 0)])) } as {
      month: string
    } & Record<(typeof kinds)[number], number>
  })
  const top = Math.max(1, ...byMonth.map((row) => kinds.reduce((sum, kind) => sum + row[kind], 0)))
  const reasons = Object.entries(
    payments
      .filter((payment) => payment.status === "cancelled")
      .reduce<Record<string, number>>((all, payment) => {
        const reason = payment.cancelReason || t("사유 없음")
        return { ...all, [reason]: (all[reason] ?? 0) + 1 }
      }, {}),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  return (
    <div className="console-grid">
      <section className="console-card span-2">
        <div className="console-card-head">
          <div>
            <h2>{t("월별 매출")}</h2>
            <p>{t("최근 6개월, 결제 완료 금액이에요.")}</p>
          </div>
          <CsvButton
            name="settlement"
            rows={() => [
              [t("월"), t("상품"), t("건수"), t("합계"), t("공급가액"), t("부가세")],
              ...months.flatMap((month) =>
                kinds.map((kind) => {
                  const rows = paid.filter((payment) => payment.kind === kind && (payment.paidAt ?? payment.requestedAt).startsWith(month))
                  const total = rows.reduce((sum, row) => sum + row.amount, 0)
                  // 부가세를 위에 붙이기 전의 결제는 부가세를 가격 안에 품고
                  // 있었다.
                  const supply = rows.reduce((sum, row) => sum + (row.supply ?? row.amount - Math.round(row.amount / 11)), 0)
                  return [month, t(kindLabels[kind]), rows.length, total, supply, total - supply]
                }),
              ),
            ]}
          />
        </div>
        {byMonth.length === 0 ? (
          <p className="day-empty">{t("아직 결제 완료된 매출이 없어요.")}</p>
        ) : (
          <ol className="console-stack">
            {byMonth.map((row) => (
              <li key={row.month}>
                <div title={kinds.map((kind) => `${t(kindLabels[kind])} ${fullWon(row[kind])}`).join(" · ")}>
                  {kinds.map((kind) => (
                    <i className={kind} key={kind} style={{ height: `${(row[kind] / top) * 100}%` }} />
                  ))}
                </div>
                <small>{Number(row.month.slice(5))}{t("월")}</small>
              </li>
            ))}
          </ol>
        )}
        <ul className="console-legend">
          {kinds.map((kind) => (
            <li className={kind} key={kind}>
              {t(kindLabels[kind])}
            </li>
          ))}
        </ul>
      </section>
      <section className="console-card span-2">
        <h2>{t("취소 · 환불 사유")}</h2>
        <Bars rows={reasons} unit={t("건")} />
      </section>
    </div>
  )
}

const stateLabels: Record<AgreementState, string> = {
  draft: "작성 중",
  one: "한쪽 확인",
  both: "양쪽 확인",
  done: "이행 완료",
  cancel: "취소 요청",
}

// 운영 화면 옆에 제안 하나를 전체로 보여 준다.
export function ProposalDrawer({ token, id, onClose, onNotice }: { token: string; id: string; onClose: () => void; onNotice: Notice }) {
  const [detail] = useAdmin<{ proposal: AdminProposalDetail }>(() => api.adminProposal(token, id), onNotice, [token, id])
  const proposal = detail?.proposal
  return (
    <aside aria-label={t("제안 상세")} className="console-card console-detail console-drawer">
      <header>
        <div>
          <strong>{proposal?.event ?? t("불러오고 있어요…")}</strong>
          {proposal && (
            <small>
              {proposal.from} → {proposal.to}
            </small>
          )}
        </div>
        <button aria-label={t("닫기")} className="console-icon" onClick={onClose} type="button">
          <Icon name="close" size={16} />
        </button>
      </header>
      {proposal && (
        <>
          <dl className="console-facts">
            <div>
              <dt>{t("상태")}</dt>
              <dd>
                <em className="console-tag">{t(proposal.status)}</em>
              </dd>
            </div>
            <div>
              <dt>{t("날짜")}</dt>
              <dd>{proposal.date || "—"}</dd>
            </div>
            <div>
              <dt>{t("조건")}</dt>
              <dd>{proposal.terms || "—"}</dd>
            </div>
            <div>
              <dt>{t("보낸 날")}</dt>
              <dd>{formatDateTime(proposal.createdAt)}</dd>
            </div>
            <div>
              <dt>{t("답한 날")}</dt>
              <dd>{proposal.respondedAt ? formatDateTime(proposal.respondedAt) : "—"}</dd>
            </div>
            {proposal.canceledAt && (
              <div>
                <dt>{t("거둔 날")}</dt>
                <dd>{formatDateTime(proposal.canceledAt)}</dd>
              </div>
            )}
            <div>
              <dt>{t("모집 글")}</dt>
              <dd>{proposal.fromPost ? t("모집 글로 지원") : "—"}</dd>
            </div>
          </dl>
          <h3>{t("임시 전자 계약서")}</h3>
          {proposal.agreement ? (
            <p className="console-line">
              <em className="console-tag blue">{t(stateLabels[proposal.agreement.state])}</em>{" "}
              {t("할 일 {done}/{items}", { done: proposal.agreement.done, items: proposal.agreement.items })}
              {proposal.agreement.cancel && ` · ${t("취소 사유")}: ${proposal.agreement.cancel.reason}`}
            </p>
          ) : (
            <p className="field-hint">{t("아직 계약서가 없어요.")}</p>
          )}
          <h3>{t("행사 측정")}</h3>
          {proposal.metrics ? (
            <p className="console-line">
              {t("QR {scans} · 쿠폰 {coupons} · 방문 {visits}", proposal.metrics)}
            </p>
          ) : (
            <p className="field-hint">{t("측정이 아직 없어요.")}</p>
          )}
          <p className="field-hint">{t("주고받은 메시지 내용은 운영자에게도 보이지 않아요.")}</p>
        </>
      )}
    </aside>
  )
}

type OpsTab = "board" | "stale" | "events"

// 협찬 운영: 진행 상태별 보드로 보는 계약서, 너무 오래 기다린 제안(리마인더
// 포함), 월별 전체 행사.
export function Operations({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [tab, setTab] = useState<OpsTab>("board")
  const [open, setOpen] = useState<string>()
  const [examples, setExamples] = useState(false)
  const [agreements] = useAdmin<{ agreements: AdminAgreementRow[] }>(() => api.adminAgreements(token), onNotice, [token])
  const [stale, reloadStale] = useAdmin<{ proposals: AdminStaleProposal[] }>(() => api.adminStale(token), onNotice, [token])
  const [events] = useAdmin<{ events: AdminEventRow[] }>(() => api.adminEvents(token), onNotice, [token])
  const rows = (agreements?.agreements ?? []).filter((row) => examples || !row.example)
  const columns: AgreementState[] = ["cancel", "draft", "one", "both", "done"]
  const shownEvents = (events?.events ?? []).filter((event) => examples || !event.example)
  const months = [...new Set(shownEvents.map((event) => event.date.slice(0, 7)))]
  return (
    <div className={open ? "console-split open" : "console-split"}>
      <section className="console-card">
        <div className="console-filters">
          <TabBar
            items={[
              { value: "board", label: <>{t("계약서 보드")}<em>{rows.length}</em></> },
              { value: "stale", label: <>{t("답 없는 제안")}<em>{stale?.proposals.length ?? 0}</em></> },
              { value: "events", label: <>{t("행사 달력")}<em>{shownEvents.length}</em></> },
            ]}
            label={t("협찬 운영 보기")}
            onChange={setTab}
            value={tab}
          />
          <label className="console-check">
            <input checked={examples} onChange={(event) => setExamples(event.target.checked)} type="checkbox" />
            {t("예시 데이터도 보기")}
          </label>
        </div>

        {tab === "board" && (
          <div aria-label={t("계약서 보드")} className="console-board" role="region" tabIndex={0}>
            {columns.map((state) => {
              const items = rows.filter((row) => row.state === state)
              return (
                <section className={`console-column ${state}`} key={state}>
                  <h3>
                    {t(stateLabels[state])} <em>{items.length}</em>
                  </h3>
                  {items.map((row) => (
                    <button className="console-ticket" key={row.id} onClick={() => setOpen(row.id)} type="button">
                      <strong>{row.event}</strong>
                      <span>
                        {row.from} → {row.to}
                      </span>
                      <small>
                        {row.date} · {t("할 일 {done}/{items}", { done: row.done, items: row.items })}
                      </small>
                      {row.cancel && <small className="console-warn">{row.cancel.reason}</small>}
                    </button>
                  ))}
                </section>
              )
            })}
          </div>
        )}

        {tab === "stale" &&
          (!stale ? (
            <p className="field-hint">{t("불러오고 있어요…")}</p>
          ) : stale.proposals.length === 0 ? (
            <p className="day-empty">{t("7일 넘게 답을 기다리는 제안이 없어요.")}</p>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th scope="col">{t("보낸 쪽")}</th>
                  <th scope="col">{t("받은 쪽")}</th>
                  <th scope="col">{t("행사")}</th>
                  <th scope="col">{t("기다린 날")}</th>
                  <th scope="col">{t("알림")}</th>
                </tr>
              </thead>
              <tbody>
                {stale.proposals.map((row) => (
                  <tr key={row.id} onClick={() => setOpen(row.id)}>
                    <th scope="row">{row.from}</th>
                    <td>{row.to}</td>
                    <td>{row.event}</td>
                    <td>
                      <span className={row.waitingDays >= 14 ? "console-badge down" : "console-badge"}>{t("{days}일", { days: row.waitingDays })}</span>
                    </td>
                    <td>
                      {row.canNudge && (
                        <button
                          className="console-text-button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void api.adminNudge(token, row.id).then(
                              () => {
                                onNotice(t("받은 쪽에 답을 부탁하는 알림을 보냈어요."))
                                return reloadStale()
                              },
                              (error: unknown) => onNotice(errorMessage(error)),
                            )
                          }}
                          type="button"
                        >
                          {t("답 부탁")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === "events" &&
          (months.length === 0 ? (
            <p className="day-empty">{t("등록된 행사가 없어요.")}</p>
          ) : (
            <div className="console-months">
              {months.map((month) => (
                <section key={month}>
                  <h3>
                    {month.slice(0, 4)}.{month.slice(5)}
                  </h3>
                  <ul className="console-list">
                    {shownEvents
                      .filter((event) => event.date.startsWith(month))
                      .map((event) => (
                        <li key={event.id}>
                          <b>{event.date.slice(8)}</b> {event.name} <small>{event.owner}</small>
                          <em>{event.sponsors > 0 ? t("협찬 {count}", { count: event.sponsors }) : ""}</em>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}
      </section>
      {open && <ProposalDrawer id={open} key={open} onClose={() => setOpen(undefined)} onNotice={onNotice} token={token} />}
    </div>
  )
}

const alertLabels = {
  pin: "PIN 오입력 {detail}번 (오늘)",
  "visits-over-coupons": "방문이 쿠폰보다 많아요 ({detail})",
  "visit-burst": "10분 안에 방문 8건 이상",
} as const

// 진행 중인 행사의 실시간 수치(30초마다 다시 읽는다)와 어느 행사에서든 이상해
// 보이는 것. 가입 승인: 개인 이메일의 초대된 가게와 공동 관리자는 운영자가
// 서류를 읽을 때까지 여기서 기다린다(backend lib/applications.ts).
export function Approvals({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload] = useAdmin(() => api.adminApplications(token), onNotice, [token])
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const decide = async (run: () => Promise<void>, notice: string) => {
    setBusy(true)
    try {
      await run()
      onNotice(notice)
      await reload()
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  return (
    <div className="console-grid">
      <section className="console-card wide">
        <div className="console-card-head">
          <div>
            <h2>{t("가입 승인")}</h2>
            <p>{t("서류를 확인하고 승인해야 가입이 끝나요. 학생단체 확인 신청도 여기 와요. 서류는 결정하면 바로 지워져요.")}</p>
          </div>
        </div>
        {data.applications.length === 0 ? (
          <p className="day-empty">{t("기다리는 가입 신청이 없어요.")}</p>
        ) : (
          <ul className="console-approvals">
            {data.applications.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>
                    {item.kind === "shop"
                      ? t("{name} · 초대받은 가게", { name: item.name })
                      : item.kind === "group"
                        ? t("{name} · 학생단체 확인", { name: item.group ?? item.name })
                        : t("{name} · {team} 공동 관리자", { name: item.name, team: item.team ?? "" })}
                  </strong>
                  <small>
                    {item.email} · {formatDateTime(item.requestedAt)}
                    {item.contact && ` · ${item.contact.name} ${item.contact.phone}`}
                  </small>
                  {item.kind === "group" && (
                    <small>
                      {t("대표자 {name} · {school}", { name: item.representative ?? "—", school: item.school || "—" })}
                    </small>
                  )}
                  {item.placeUrl && (
                    <a href={item.placeUrl} rel="noreferrer" target="_blank">
                      {t("연결할 가게 보기")}
                    </a>
                  )}
                </div>
                <button
                  className="cancel-button"
                  onClick={async () => {
                    try {
                      const blob = await api.adminApplicationDocument(token, item.id)
                      saveFile(item.document.name, blob, blob.type)
                    } catch (error) {
                      onNotice(errorMessage(error))
                    }
                  }}
                  type="button"
                >
                  {item.kind === "group" ? t("재학 증명 내려받기") : t("서류 내려받기")}
                </button>
                {item.kind === "group" && item.membership && (
                  <button
                    className="cancel-button"
                    onClick={async () => {
                      try {
                        const blob = await api.adminApplicationDocument(token, item.id, "membership")
                        saveFile(item.membership!.name, blob, blob.type)
                      } catch (error) {
                        onNotice(errorMessage(error))
                      }
                    }}
                    type="button"
                  >
                    {t("소속 증빙 내려받기")}
                  </button>
                )}
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void decide(
                      () => api.adminApproveApplication(token, item.id),
                      item.kind === "group"
                        ? t("{name}의 학생단체 확인을 승인했어요.", { name: item.group ?? item.name })
                        : t("{name} 가입을 승인했어요.", { name: item.name }),
                    )
                  }
                  type="button"
                >
                  {t("승인")}
                </button>
                <label>
                  <span className="sr-only">{t("거절 사유")}</span>
                  <input
                    maxLength={200}
                    onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder={t("거절 사유")}
                    value={reasons[item.id] ?? ""}
                  />
                </label>
                <button
                  className="cancel-button"
                  disabled={busy || !reasons[item.id]?.trim()}
                  onClick={() =>
                    void decide(
                      () => api.adminRejectApplication(token, item.id, reasons[item.id].trim()),
                      item.kind === "group"
                        ? t("{name}의 단체 확인 신청을 거절했어요.", { name: item.group ?? item.name })
                        : t("{name} 가입을 거절했어요.", { name: item.name }),
                    )
                  }
                  type="button"
                >
                  {t("거절")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ReferralRewards onNotice={onNotice} token={token} />
    </div>
  )
}

const referralBlocks = {
  missing: "상대 계정이 없어요",
  suspended: "정지된 계정이 있어요",
  canceled: "협찬이 취소됐어요",
  refunded: "수수료가 환불됐어요",
} as const

// 친구 초대 보상: 파트너스 일수는 운영자가 승인해야 나간다(backend lib/referrals.ts).
function ReferralRewards({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload] = useAdmin(() => api.adminReferrals(token), onNotice, [token])
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const decide = async (run: () => Promise<void>, notice: string) => {
    setBusy(true)
    try {
      await run()
      onNotice(notice)
      await reload()
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null
  return (
    <section className="console-card wide">
      <div className="console-card-head">
        <div>
          <h2>{t("친구 초대 보상")}</h2>
          <p>{t("초대한 쪽과 초대받은 쪽이 다른 사업자인지 확인하고 승인해 주세요. 승인해야 파트너스 일수가 나가요.")}</p>
        </div>
      </div>
      {data.rewards.length === 0 ? (
        <p className="day-empty">{t("기다리는 보상이 없어요.")}</p>
      ) : (
        <ul className="console-approvals">
          {data.rewards.map((item) => {
            const referrer = item.referrer?.name ?? t("탈퇴한 계정")
            return (
              <li key={item.id}>
                <div>
                  <strong>{t("{referrer} → {joined} · {days}일", { referrer, joined: item.joined?.name ?? t("탈퇴한 계정"), days: item.days })}</strong>
                  <small>
                    {t("협찬 {value} · 낸 수수료 {fee}", { value: fullWon(item.value), fee: fullWon(item.feePaid) })} · {formatDateTime(item.createdAt)}
                  </small>
                  <small>
                    {t("사업자 확인: 초대자 {referrer}, 가입자 {joined}", { referrer: item.referrer?.business ? t("완료") : t("안 함"), joined: item.joined?.business ? t("완료") : t("안 함") })}
                  </small>
                  {item.blocked && <small>{t(referralBlocks[item.blocked])}</small>}
                </div>
                <button
                  className="primary-button"
                  disabled={busy || Boolean(item.blocked)}
                  onClick={() => void decide(() => api.adminApproveReferral(token, item.id), t("{name}의 보상을 승인했어요.", { name: referrer }))}
                  type="button"
                >
                  {t("승인")}
                </button>
                <label>
                  <span className="sr-only">{t("거절 사유")}</span>
                  <input
                    maxLength={200}
                    onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder={t("거절 사유")}
                    value={reasons[item.id] ?? ""}
                  />
                </label>
                <button
                  className="cancel-button"
                  disabled={busy || !reasons[item.id]?.trim()}
                  onClick={() => void decide(() => api.adminRejectReferral(token, item.id, reasons[item.id].trim()), t("{name}의 보상을 거절했어요.", { name: referrer }))}
                  type="button"
                >
                  {t("거절")}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function Live({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload] = useAdmin<AdminLive>(() => api.adminLive(token), onNotice, [token])
  useEffect(() => {
    const timer = window.setInterval(() => void reload(), 30_000)
    return () => window.clearInterval(timer)
  }, [reload])
  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  return (
    <div className="console-grid">
      <section className="console-card wide">
        <div className="console-card-head">
          <div>
            <h2>{t("오늘 진행 중인 행사")}</h2>
            <p>{t("30초마다 새로 읽어요.")}</p>
          </div>
        </div>
        {data.events.length === 0 ? (
          <p className="day-empty">{t("오늘 열리는 행사가 없어요.")}</p>
        ) : (
          <div className="console-live">
            {data.events.map((event) => {
              const top = Math.max(1, ...event.hourly.map((hour) => hour.scans))
              return (
                <article key={event.id}>
                  <header>
                    <strong>{event.name}</strong>
                    <small>
                      {event.owner}
                      {event.lastAt && ` · ${t("마지막 기록 {time}", { time: formatDateTime(event.lastAt) })}`}
                    </small>
                  </header>
                  <dl>
                    <div>
                      <dt>{t("QR")}</dt>
                      <dd>{event.scans}</dd>
                    </div>
                    <div>
                      <dt>{t("쿠폰")}</dt>
                      <dd>{event.coupons}</dd>
                    </div>
                    <div>
                      <dt>{t("방문")}</dt>
                      <dd>{event.visits}</dd>
                    </div>
                    <div>
                      <dt>{t("PIN 오입력")}</dt>
                      <dd className={event.pinMisses >= 5 ? "console-warn" : undefined}>{event.pinMisses}</dd>
                    </div>
                  </dl>
                  <div className="console-spark" aria-label={t("시간대별 스캔")}>
                    {event.hourly.map((hour) => (
                      <i key={hour.hour} style={{ height: `${(hour.scans / top) * 100}%` }} title={`${hour.hour}시 · ${hour.scans}`} />
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <section className="console-card wide">
        <h2>{t("현장 이상 신호")}</h2>
        {data.alerts.length === 0 ? (
          <p className="day-empty">{t("눈에 띄는 이상 신호가 없어요.")}</p>
        ) : (
          <ul className="console-todo">
            {data.alerts.map((alert) => (
              <li key={`${alert.eventId}-${alert.kind}`}>
                <div className="console-alert">
                  <span aria-hidden="true" className="console-todo-icon">
                    <Icon name="bell" size={18} />
                  </span>
                  <span>
                    <strong>{alert.event}</strong>
                    <small>{t(alertLabels[alert.kind], { detail: alert.kind === "visit-burst" ? formatDateTime(alert.detail) : alert.detail })}</small>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type ContentTab = "posts" | "reviews" | "invites" | "faq"

// 콘텐츠: 게시판 글, 후기, 가게 초대, 도움말 센터.
export function Content({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [tab, setTab] = useState<ContentTab>("posts")
  return (
    <section className="console-card">
      <TabBar
        items={[
          { value: "posts", label: t("모집 글") },
          { value: "reviews", label: t("후기") },
          { value: "invites", label: t("가게 초대") },
          { value: "faq", label: t("FAQ") },
        ]}
        label={t("콘텐츠 보기")}
        onChange={setTab}
        value={tab}
      />
      {tab === "posts" && <Posts onNotice={onNotice} token={token} />}
      {tab === "reviews" && <Reviews onNotice={onNotice} token={token} />}
      {tab === "invites" && <Invites onNotice={onNotice} token={token} />}
      {tab === "faq" && <FaqEditor onNotice={onNotice} token={token} />}
    </section>
  )
}

function Posts({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload] = useAdmin<{ posts: AdminPostRow[] }>(() => api.adminPosts(token), onNotice, [token])
  const act = (id: string, action: "hide" | "show" | "close", done: string) =>
    void api.adminPostAction(token, id, action).then(
      () => {
        onNotice(done)
        return reload()
      },
      (error: unknown) => onNotice(errorMessage(error)),
    )
  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  return (
    <table className="console-table plain">
      <thead>
        <tr>
          <th scope="col">{t("제목")}</th>
          <th scope="col">{t("올린 곳")}</th>
          <th scope="col">{t("마감")}</th>
          <th scope="col">{t("상태")}</th>
          <th scope="col">{t("관리")}</th>
        </tr>
      </thead>
      <tbody>
        {data.posts.map((post) => (
          <tr key={post.id}>
            <th scope="row">{post.title}</th>
            <td>{post.poster}</td>
            <td>{post.deadline}</td>
            <td>
              {post.hiddenAt ? (
                <em className="console-tag red">{t("숨김")}</em>
              ) : post.closedAt ? (
                <em className="console-tag">{t("마감")}</em>
              ) : (
                <em className="console-tag blue">{t("모집 중")}</em>
              )}
            </td>
            <td className="console-actions">
              {post.hiddenAt ? (
                <button className="console-text-button" onClick={() => act(post.id, "show", t("모집 글을 다시 보이게 했어요."))} type="button">
                  {t("다시 보이기")}
                </button>
              ) : (
                <button className="console-text-button" onClick={() => act(post.id, "hide", t("모집 글을 숨겼어요."))} type="button">
                  {t("숨기기")}
                </button>
              )}
              {!post.closedAt && (
                <button className="console-text-button" onClick={() => act(post.id, "close", t("모집 글을 마감했어요."))} type="button">
                  {t("마감하기")}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Reviews({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload] = useAdmin<{ reviews: AdminReviewRow[] }>(() => api.adminReviews(token), onNotice, [token])
  const act = (id: string, action: "hide" | "show" | "pin" | "unpin") =>
    void api.adminReviewAction(token, id, action).then(
      () => reload(),
      (error: unknown) => onNotice(errorMessage(error)),
    )
  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  return (
    <div className="admin-list">
      {data.reviews.map((review) => (
        <article className={review.hiddenAt ? "admin-card muted" : "admin-card"} key={review.id}>
          <div className="admin-card-head">
            <span className="admin-category">
              {"★".repeat(review.rating)} · {review.about}
            </span>
            <span className="admin-card-meta">
              {review.pinnedAt && <em className="console-tag blue">{t("고정")}</em>}
              {review.hiddenAt && <em className="console-tag red">{t("숨김")}</em>}
              <time dateTime={review.createdAt}>{formatDateTime(review.createdAt)}</time>
            </span>
          </div>
          <p className="admin-question">{review.comment || t("(글 없이 별점만)")}</p>
          <p className="admin-from">
            {review.author} · {review.event}
          </p>
          <div className="admin-report-actions">
            <button className="console-text-button" onClick={() => act(review.id, review.pinnedAt ? "unpin" : "pin")} type="button">
              {review.pinnedAt ? t("고정 풀기") : t("맨 위에 고정")}
            </button>
            <button className="console-text-button" onClick={() => act(review.id, review.hiddenAt ? "show" : "hide")} type="button">
              {review.hiddenAt ? t("다시 보이기") : t("숨기기")}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function Invites({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data] = useAdmin<AdminInvites>(() => api.adminInvites(token), onNotice, [token])
  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  return (
    <>
      <dl className="console-kpis small">
        <div>
          <span>{t("보낸 초대")}</span>
          <strong>{data.sent}</strong>
        </div>
        <div>
          <span>{t("가입으로 이어짐")}</span>
          <strong>{data.joined}</strong>
        </div>
        <div>
          <span>{t("전환율")}</span>
          <strong>{data.rate === null ? "—" : `${data.rate}%`}</strong>
        </div>
      </dl>
      <table className="console-table plain">
        <thead>
          <tr>
            <th scope="col">{t("초대한 단체")}</th>
            <th scope="col">{t("보낸 초대")}</th>
            <th scope="col">{t("가입")}</th>
          </tr>
        </thead>
        <tbody>
          {data.byInviter.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              <td>{row.sent}</td>
              <td>{row.joined}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

// 도움말 센터: 여기서 추가한 질문은 기본 질문 옆에 보이고(한국어만), 기본
// 질문은 숨길 수 있다.
function FaqEditor({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [faq, , setFaq] = useAdmin<SiteFaq>(() => api.adminFaq(token), onNotice, [token])
  const [form, setForm] = useState({ topic: "start" as FaqTopicKey, question: "", answer: "", featured: false })
  if (!faq) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  const save = (work: Promise<SiteFaq>, done: string) =>
    work.then(
      (next) => {
        setFaq(next)
        onNotice(done)
      },
      (error: unknown) => onNotice(errorMessage(error)),
    )
  return (
    <div className="console-faq">
      <form
        className="console-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save(api.adminAddFaq(token, form), t("질문을 더했어요.")).then(() => setForm({ ...form, question: "", answer: "" }))
        }}
      >
        <h3>{t("질문 더하기")}</h3>
        <div className="console-form-row">
          <label>
            {t("주제")}
            <select onChange={(event) => setForm({ ...form, topic: event.target.value as FaqTopicKey })} value={form.topic}>
              {faqTopics.map((topic) => (
                <option key={topic.key} value={topic.key}>
                  {topic.title}
                </option>
              ))}
            </select>
          </label>
          <label className="console-check">
            <input checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} type="checkbox" />
            {t("대시보드에도 보이기")}
          </label>
        </div>
        <label>
          {t("질문")}
          <input maxLength={100} onChange={(event) => setForm({ ...form, question: event.target.value })} value={form.question} />
        </label>
        <label>
          {t("답")}
          <textarea maxLength={1000} onChange={(event) => setForm({ ...form, answer: event.target.value })} rows={4} value={form.answer} />
        </label>
        <button className="primary-button" disabled={!form.question.trim() || !form.answer.trim()} type="submit">
          {t("질문 더하기")}
        </button>
      </form>
      <h3>{t("더한 질문 {count}", { count: faq.added.length })}</h3>
      <ul className="console-list">
        {faq.added.map((entry) => (
          <li key={entry.id}>
            {entry.question} <small>{faqTopics.find((topic) => topic.key === entry.topic)?.title}</small>
            <button className="console-inline" onClick={() => void save(api.adminRemoveFaq(token, entry.id), t("질문을 지웠어요."))} type="button">
              {t("지우기")}
            </button>
          </li>
        ))}
      </ul>
      <h3>{t("기본 질문")}</h3>
      <ul className="console-list">
        {faqs.map((entry) => {
          const key = entry.key
          const hidden = faq.hidden.includes(key)
          return (
            <li className={hidden ? "muted" : undefined} key={key}>
              {entry.question}
              <button className="console-inline" onClick={() => void save(api.adminHideFaq(token, key, !hidden), hidden ? t("다시 보이게 했어요.") : t("숨겼어요."))} type="button">
                {hidden ? t("다시 보이기") : t("숨기기")}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// 시스템: 점검, 예시 초기화, 백업, 요청 제한, 리마인더 실행.
export function SystemPanel({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload, setData, failed] = useAdmin<AdminSystem>(() => api.adminSystem(token), onNotice, [token])
  const [form, setForm] = useState({ on: false, message: "", blockSignups: false })
  const [saving, setSaving] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [sure, setSure] = useState(false)
  // 복원 확인 중인 백업과 그 건수, 확인으로 다시 적은 시각.
  const [restoring, setRestoring] = useState<{ hour: string; summary: BackupSummary }>()
  const [typed, setTyped] = useState("")
  useEffect(() => {
    if (data) setForm({ on: data.maintenance.on, message: data.maintenance.message ?? "", blockSignups: Boolean(data.maintenance.blockSignups) })
  }, [data?.maintenance])
  if (!data) {
    return failed ? (
      <section className="console-card">
        <p role="alert">{t("시스템 정보를 불러오지 못했어요.")}</p>
        <button className="cancel-button" onClick={() => void reload()} type="button">{t("다시 시도")}</button>
      </section>
    ) : <p className="field-hint" role="status">{t("불러오고 있어요…")}</p>
  }
  const applied = data.maintenance
  const status = applied.on ? t("전체 점검") : applied.blockSignups ? t("신규 가입 제한") : t("정상 운영")
  const enabling = form.on && !applied.on
  const disabling = !form.on && applied.on
  const maintenanceAction = enabling ? t("점검 모드 켜기") : disabling ? t("점검 모드 끄기") : t("저장")
  const changed = form.on !== applied.on || form.blockSignups !== Boolean(applied.blockSignups) || form.message !== (applied.message ?? "")
  const download = (hour: string) =>
    fetch(`/api/admin/backups/${encodeURIComponent(hour)}`, { headers: { "X-Admin-Token": token } })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("백업을 내려받지 못했어요."))
        saveFile(`uniconnect-backup-${hour}.json`, await response.blob(), "application/json")
      })
      .catch((error: unknown) => onNotice(errorMessage(error)))
  return (
    <div className="console-grid">
      <section className="console-card span-2">
        <div className="console-card-head">
          <h2>{t("점검 모드")}</h2>
          <span className={`console-badge${applied.on ? " down" : applied.blockSignups ? "" : " up"}`} role="status">
            {t("현재 상태: {status}", { status })}
          </span>
        </div>
        <form
          className="console-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (saving || !changed) return
            setSaving(true)
            void api.adminSetMaintenance(token, form).then(
              ({ maintenance }) => {
                setData((current) => current && { ...current, maintenance })
                onNotice(enabling ? t("점검 모드를 켰어요.") : t("점검 설정을 저장했어요."))
              },
              (error: unknown) => onNotice(errorMessage(error)),
            ).finally(() => setSaving(false))
          }}
        >
          <label className="console-check">
            <input checked={form.on} disabled={saving} onChange={(event) => setForm({ ...form, on: event.target.checked })} type="checkbox" />
            {t("점검 중: 회원 화면 대신 안내를 보여 주고 저장을 막아요")}
          </label>
          <label className="console-check">
            <input checked={form.blockSignups} disabled={saving} onChange={(event) => setForm({ ...form, blockSignups: event.target.checked })} type="checkbox" />
            {t("새 가입만 막기")}
          </label>
          <label>
            {t("안내 문구")}
            <input
              disabled={saving}
              maxLength={200}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              placeholder={t("예: 오늘 밤 12시까지 점검해요.")}
              value={form.message}
            />
          </label>
          <button className={enabling ? "decline-button" : "primary-button"} disabled={saving || !changed} type="submit">
            {maintenanceAction}
          </button>
        </form>
      </section>
      <section className="console-card span-2">
        <h2>{t("예시 데이터 초기화")}</h2>
        <p className="field-hint">{t("데모 계정의 행사 · 제안 · 측정 · 후기와 예시 목록을 처음 상태로 되돌려요. 실제 회원의 데이터는 그대로예요. 시연 전에 쓰세요.")}</p>
        {sure ? (
          <div className="admin-report-actions">
            <button
              className="decline-button"
              onClick={() =>
                void api.adminResetDemo(token).then(
                  () => {
                    setSure(false)
                    onNotice(t("예시 데이터를 처음 상태로 되돌렸어요."))
                  },
                  (error: unknown) => onNotice(errorMessage(error)),
                )
              }
              type="button"
            >
              {t("되돌리기")}
            </button>
            <button className="cancel-button" onClick={() => setSure(false)} type="button">
              {t("취소")}
            </button>
          </div>
        ) : (
          <button className="cancel-button" onClick={() => setSure(true)} type="button">
            {t("예시 데이터 초기화")}
          </button>
        )}
      </section>
      <section className="console-card span-2">
        <h2>{t("백업")}</h2>
        <p className="field-hint">{t("한 시간마다 최근 24개를 남겨요. 모든 회원의 데이터가 들어 있으니 안전한 곳에만 저장하세요.")}</p>
        {data.backups.length === 0 ? (
          <p className="day-empty">{t("아직 백업이 없어요.")}</p>
        ) : (
          <ul className="console-list">
            {data.backups.map((backup) => (
              <li className="backup-row" key={backup.hour}>
                <span>{formatDateTime(`${backup.hour}:00:00Z`)} <small>{Math.round(backup.bytes / 1024).toLocaleString(locale)} KB</small></span>
                <button className="console-inline" onClick={() => void download(backup.hour)} type="button">
                  {t("내려받기")}
                </button>
                <details className="backup-actions">
                  <summary>{t("백업 작업")}</summary>
                  <button
                    className="console-inline"
                    disabled={backupBusy}
                    onClick={() => {
                      setRestoring(undefined)
                      setTyped("")
                      setBackupBusy(true)
                      void api.adminBackupSummary(token, backup.hour).then(
                        (summary) => setRestoring({ hour: backup.hour, summary }),
                        (error: unknown) => onNotice(errorMessage(error)),
                      ).finally(() => setBackupBusy(false))
                    }}
                    type="button"
                  >
                    {t("복원")}
                  </button>
                </details>
                {restoring?.hour === backup.hour && (
                  <div className="backup-restore">
                    <p><strong>{t("복원할 백업: {date}", { date: formatDateTime(`${backup.hour}:00:00Z`) })}</strong></p>
                    <p>{t("백업 이후에 추가하거나 변경한 계정, 행사, 제안 등의 데이터는 사라지거나 이전 상태로 돌아갈 수 있어요.")}</p>
                    <p>
                      {t("지금 계정 {now} · 백업 계정 {then} · 행사 {events} · 제안 {proposals}", {
                        now: restoring.summary.current.accounts,
                        then: restoring.summary.backup.accounts,
                        events: restoring.summary.backup.events,
                        proposals: restoring.summary.backup.proposals,
                      })}
                    </p>
                    <p>
                      <strong>{t("복원하면 되살아나는 계정 {count}개", { count: restoring.summary.accountsBack })}</strong>
                    </p>
                    <p className="field-hint">{t("되돌릴 수 없어요. 사진, 참여 기록, 결제, 운영자는 그대로예요.")}</p>
                    <label>
                      {t("확인하려면 백업 시각 {hour}을 그대로 적어 주세요", { hour: backup.hour })}
                      <input onChange={(event) => setTyped(event.target.value)} value={typed} />
                    </label>
                    <button
                      className="decline-button"
                      disabled={backupBusy || typed !== backup.hour}
                      onClick={() => {
                        setBackupBusy(true)
                        void api.adminRestoreBackup(token, backup.hour, typed).then(
                          () => {
                            setRestoring(undefined)
                            onNotice(t("백업으로 복원했어요."))
                            return reload()
                          },
                          (error: unknown) => onNotice(errorMessage(error)),
                        ).finally(() => setBackupBusy(false))
                      }}
                      type="button"
                    >
                      {t("복원하기")}
                    </button>
                    <button className="cancel-button" disabled={backupBusy} onClick={() => setRestoring(undefined)} type="button">
                      {t("취소")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="console-card span-2">
        <h2>{t("요청 제한")}</h2>
        <p className="field-hint">{t("주소는 보여 주지 않고 세는 중인 곳과 막힌 곳의 수만 보여요.")}</p>
        <table className="console-table plain">
          <thead>
            <tr>
              <th scope="col">{t("제한")}</th>
              <th scope="col">{t("기준")}</th>
              <th scope="col">{t("세는 중")}</th>
              <th scope="col">{t("막힘")}</th>
            </tr>
          </thead>
          <tbody>
            {data.limits.map((limit) => (
              <tr key={limit.id}>
                <th scope="row">{t(limit.label)}</th>
                <td>{t("{minutes}분에 {limit}번", { minutes: limit.minutes, limit: limit.limit })}</td>
                <td>{limit.counting}</td>
                <td className={limit.blocked > 0 ? "console-warn" : undefined}>{limit.blocked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="console-card wide">
        <h2>{t("일정 알림 실행 기록")}</h2>
        {data.cronRuns.length === 0 ? (
          <p className="day-empty">{t("아직 실행 기록이 없어요.")}</p>
        ) : (
          <ul className="console-list">
            {data.cronRuns.map((run) => (
              <li key={run.at}>
                {formatDateTime(run.at)} <em>{t("{count}통 보냄", { count: run.sent })}</em>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// 협찬 분쟁(#335, backend routes/disputes.ts): 진행 중인 것이 먼저, 오래된 순서다.
// 운영자는 확인을 시작하고, 당사자에게 보이지 않는 메모를 남기며, 결론과 이유를
// 기록한다. 결론은 고칠 수 없고 기록일 뿐이라 계정, 결제, 후기는 따로 처리한다.
export function Disputes({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload, setData] = useAdmin(() => api.adminDisputes(token), onNotice, [token])
  const [tab, setTab] = useState<"open" | "closed">("open")
  const [openId, setOpenId] = useState<string>()
  const [note, setNote] = useState("")
  const [outcome, setOutcome] = useState<DisputeOutcome | "">("")
  const [reason, setReason] = useState("")
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setNote("")
    setOutcome("")
    setReason("")
    setSure(false)
  }, [openId])

  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  const live = data.disputes.filter((item) => item.status !== "closed")
  const done = data.disputes.filter((item) => item.status === "closed")
  const list = tab === "open" ? live : done
  const open = data.disputes.find((item) => item.id === openId)

  const act = async (work: () => Promise<{ dispute: Dispute }>, message: string) => {
    if (busy) return false
    setBusy(true)
    try {
      const { dispute } = await work()
      setData((current) => current && { disputes: current.disputes.map((item) => (item.id === dispute.id ? dispute : item)) })
      onNotice(message)
      return true
    } catch (error) {
      onNotice(errorMessage(error))
      await reload()
      return false
    } finally {
      setBusy(false)
    }
  }

  const sideName = (dispute: Dispute, by: DisputeEvent["by"]) =>
    by === "admin" ? t("운영자") : by === "group" ? dispute.groupName : dispute.brandName

  return (
    <div className="console-grid">
      <section className="console-card wide">
        <div className="console-card-head">
          <div>
            <h2>{t("협찬 분쟁")}</h2>
            <p>{t("결론은 고칠 수 없고 기록일 뿐이에요. 계정, 결제, 후기는 따로 처리해요.")}</p>
          </div>
        </div>
        <TabBar
          items={[
            { value: "open" as const, label: t("진행 중 {count}", { count: live.length }) },
            { value: "closed" as const, label: t("끝남 {count}", { count: done.length }) },
          ]}
          label={t("분쟁 상태")}
          onChange={(value) => setTab(value)}
          value={tab}
        />
        {list.length === 0 ? (
          <p className="day-empty">{tab === "open" ? t("진행 중인 분쟁이 없어요.") : t("끝난 분쟁이 없어요.")}</p>
        ) : (
          <ul className="console-approvals">
            {list.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>
                    {item.eventName} · {t(disputeReasonLabel(item.reason))}
                  </strong>
                  <small>
                    {t("{group} ↔ {brand}", { group: item.groupName, brand: item.brandName })} ·{" "}
                    {t("{name}에서 접수", { name: item.openedBy === "group" ? item.groupName : item.brandName })} ·{" "}
                    {formatDateTime(item.createdAt)}
                  </small>
                </div>
                <span className={item.status === "closed" ? "dispute-status" : "dispute-status live"}>
                  {item.decision ? t(disputeOutcomeLabel(item.decision.outcome)) : t(disputeStatusLabels[item.status])}
                </span>
                <button className="cancel-button" onClick={() => setOpenId(item.id === openId ? undefined : item.id)} type="button">
                  {item.id === openId ? t("닫기") : t("열기")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <section aria-label={t("분쟁 {name}", { name: open.eventName })} className="console-card wide console-dispute">
          <div className="console-card-head">
            <div>
              <h2>
                {open.eventName} · {t(disputeReasonLabel(open.reason))}
              </h2>
              <p>{t("{group} ↔ {brand}", { group: open.groupName, brand: open.brandName })}</p>
            </div>
            {open.status === "open" && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void act(() => api.adminReviewDispute(token, open.id), t("확인을 시작했어요. 양쪽에 알렸어요."))}
                type="button"
              >
                {t("확인 시작")}
              </button>
            )}
          </div>
          <p className="dispute-detail">{open.detail}</p>

          <h3>{t("접수할 때의 계약")}</h3>
          {/* 접수 순간의 계약서 사본이다. 어느 쪽이든 고칠 수 있는 계약서에서 떠 온 것이라
              그때 양쪽이 확인했는지를 함께 보인다. 당사자도 같은 사본을 본다. */}
          <p className="dispute-snapshot-state">
            <strong>{t(snapshotAgreement(open.snapshot))}</strong>{" "}
            {t("결론 전에 양쪽의 말과 증빙을 함께 보세요. 양쪽 모두 이 내용을 볼 수 있어요.")}
          </p>
          <dl className="console-facts">
            <div>
              <dt>{t("협찬액")}</dt>
              <dd>
                {open.snapshot.value
                  ? t("현금 {cash} · 현물 {inKind}", { cash: fullWon(open.snapshot.value.cash), inKind: fullWon(open.snapshot.value.inKind) })
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{t("지급 기록")}</dt>
              <dd>
                {open.snapshot.payout
                  ? [
                      open.snapshot.payout.dueDate && t("예정일 {date}", { date: open.snapshot.payout.dueDate }),
                      open.snapshot.payout.paidAt && t("보냄 {date}", { date: formatDateTime(open.snapshot.payout.paidAt) }),
                      open.snapshot.payout.receivedAt && t("받음 {date}", { date: formatDateTime(open.snapshot.payout.receivedAt) }),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{t("취소")}</dt>
              <dd>{open.snapshot.canceled ? t("취소된 협찬") : "—"}</dd>
            </div>
          </dl>
          <ul className="console-dispute-items">
            {open.snapshot.items.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <span>{item.side === "group" ? open.groupName : open.brandName}</span> {item.label}{" "}
                <small>{item.doneAt ? t("끝남 {date}", { date: formatDateTime(item.doneAt) }) : t("안 끝남")}</small>
              </li>
            ))}
          </ul>

          <h3>{t("기록")}</h3>
          <ol className="dispute-events">
            {open.events.map((event, index) => {
              const evidence = event.evidenceId ? open.evidence.find((item) => item.id === event.evidenceId) : undefined
              return (
                <li className={event.by === "admin" ? "admin" : undefined} key={`${event.at}-${index}`}>
                  <span className="dispute-event-head">
                    <strong>{sideName(open, event.by)}</strong> {t(disputeEventLabels[event.kind])}
                    <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                  </span>
                  {event.text && <p>{event.text}</p>}
                  {evidence && (
                    <button
                      className="underline-link"
                      onClick={async () => {
                        try {
                          const blob = await api.adminDisputeEvidence(token, open.id, evidence.id)
                          saveFile(evidence.name, blob, blob.type)
                        } catch (error) {
                          onNotice(errorMessage(error))
                        }
                      }}
                      type="button"
                    >
                      <Icon name="file" size={14} /> {evidence.name}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>

          <h3>{t("운영자 메모 {count}", { count: open.notes?.length ?? 0 })}</h3>
          {open.notes && open.notes.length > 0 && (
            <ul className="console-dispute-notes">
              {open.notes.map((item, index) => (
                <li key={`${item.at}-${index}`}>
                  <small>{formatDateTime(item.at)}</small> {item.text}
                </li>
              ))}
            </ul>
          )}
          <div className="console-tool">
            <input
              aria-label={t("운영자 메모")}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("당사자에게 보이지 않아요")}
              value={note}
            />
            <button
              className="console-text-button"
              disabled={busy || !note.trim()}
              onClick={() =>
                void act(() => api.adminDisputeNote(token, open.id, note.trim()), t("메모를 남겼어요.")).then((saved) => saved && setNote(""))
              }
              type="button"
            >
              {t("메모 남기기")}
            </button>
          </div>

          {open.decision ? (
            <p className="dispute-decision">
              <strong>{t(disputeOutcomeLabel(open.decision.outcome))}</strong> {open.decision.note ?? ""} ·{" "}
              {formatDateTime(open.decision.at)}
            </p>
          ) : (
            <form
              className="console-dispute-decision"
              onSubmit={(event) => {
                event.preventDefault()
                if (!outcome || !reason.trim() || !sure) return
                void act(() => api.adminDecideDispute(token, open.id, outcome, reason.trim()), t("결론을 기록했어요. 양쪽에 알렸어요."))
              }}
            >
              <h3>{t("결론")}</h3>
              <label>
                <span>{t("결론")}</span>
                <select onChange={(event) => setOutcome(event.target.value as DisputeOutcome)} value={outcome}>
                  <option value="">{t("골라 주세요")}</option>
                  {disputeOutcomes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {t(item.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("결론의 이유")}</span>
                <textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} rows={3} value={reason} />
              </label>
              <label className="console-check">
                <input checked={sure} onChange={(event) => setSure(event.target.checked)} type="checkbox" />
                {t("결론은 고칠 수 없어요. 양쪽에 알림이 가요.")}
              </label>
              <button className="primary-button" disabled={busy || !outcome || !reason.trim() || !sure} type="submit">
                {t("결론 기록하기")}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  )
}
