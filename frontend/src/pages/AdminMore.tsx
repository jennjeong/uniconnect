import { useCallback, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { TabBar } from "../components/TabBar"
import { faqs, faqTopics } from "../data/faq"
import { locale, t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { saveFile } from "../lib/download"
import { fullWon } from "../lib/sponsorships"
import type {
  AdminAgreementRow,
  AdminEventRow,
  AdminInsights,
  AdminInvites,
  AdminLive,
  AdminPayment,
  AdminPostRow,
  AdminProposalDetail,
  AdminReviewRow,
  AdminStaleProposal,
  AdminSystem,
  AgreementState,
  FaqTopicKey,
  SiteFaq,
} from "../types"
import { CsvButton } from "./AdminTools"

// 운영자 콘솔의 나머지(pages/AdminPage.tsx): 분석, 협찬 운영, 오늘의 행사,
// 콘텐츠와 시스템, 그리고 결제 화면이 보여 주는 매출 패널과 제안 서랍.

type Notice = (message: string) => void

// 토큰마다 한 번, 그리고 `reload`일 때 다시 불러온다. 오류는 알림으로 보여
// 준다.
function useAdmin<T>(load: () => Promise<T>, onNotice: Notice, deps: unknown[]) {
  const [data, setData] = useState<T>()
  const run = useCallback(() => load().then(setData, (error: unknown) => onNotice(errorMessage(error))), deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void run()
  }, [run])
  return [data, run, setData] as const
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
  const kinds = ["fee", "report", "pro", "ad"] as const
  const kindLabels = { fee: "수수료", report: "상세 리포트", pro: "캠퍼스 파트너스", ad: "상단 광고" }
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
            <p>{t("서류를 확인하고 승인해야 가입이 끝나요. 서류는 결정하면 바로 지워져요.")}</p>
          </div>
        </div>
        {data.applications.length === 0 ? (
          <p className="day-empty">{t("기다리는 가입 신청이 없어요.")}</p>
        ) : (
          <ul className="console-approvals">
            {data.applications.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.kind === "shop" ? t("{name} · 초대받은 가게", { name: item.name }) : t("{name} · {team} 공동 관리자", { name: item.name, team: item.team ?? "" })}</strong>
                  <small>
                    {item.email} · {formatDateTime(item.requestedAt)}
                    {item.contact && ` · ${item.contact.name} ${item.contact.phone}`}
                  </small>
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
                  {t("서류 내려받기")}
                </button>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void decide(() => api.adminApproveApplication(token, item.id), t("{name} 가입을 승인했어요.", { name: item.name }))}
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
                  onClick={() => void decide(() => api.adminRejectApplication(token, item.id, reasons[item.id].trim()), t("{name} 가입을 거절했어요.", { name: item.name }))}
                  type="button"
                >
                  {t("거절")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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

const limitLabel = (message: string) => message.replace(/[.。].*$/, "")

// 시스템: 점검, 예시 초기화, 백업, 요청 제한, 리마인더 실행.
export function SystemPanel({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, reload] = useAdmin<AdminSystem>(() => api.adminSystem(token), onNotice, [token])
  const [form, setForm] = useState({ on: false, message: "", blockSignups: false })
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (data) setForm({ on: data.maintenance.on, message: data.maintenance.message ?? "", blockSignups: Boolean(data.maintenance.blockSignups) })
  }, [data])
  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>
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
        <h2>{t("점검 모드")}</h2>
        <form
          className="console-form"
          onSubmit={(event) => {
            event.preventDefault()
            api.adminSetMaintenance(token, form).then(
              () => {
                onNotice(form.on ? t("점검 모드를 켰어요.") : t("점검 설정을 저장했어요."))
                return reload()
              },
              (error: unknown) => onNotice(errorMessage(error)),
            )
          }}
        >
          <label className="console-check">
            <input checked={form.on} onChange={(event) => setForm({ ...form, on: event.target.checked })} type="checkbox" />
            {t("점검 중: 회원 화면 대신 안내를 보여 주고 저장을 막아요")}
          </label>
          <label className="console-check">
            <input checked={form.blockSignups} onChange={(event) => setForm({ ...form, blockSignups: event.target.checked })} type="checkbox" />
            {t("새 가입만 막기")}
          </label>
          <label>
            {t("안내 문구")}
            <input
              maxLength={200}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              placeholder={t("예: 오늘 밤 12시까지 점검해요.")}
              value={form.message}
            />
          </label>
          <button className={form.on ? "decline-button" : "primary-button"} type="submit">
            {t("저장")}
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
              <li key={backup.hour}>
                {formatDateTime(`${backup.hour}:00:00Z`)} <small>{Math.round(backup.bytes / 1024).toLocaleString(locale)} KB</small>
                <button className="console-inline" onClick={() => void download(backup.hour)} type="button">
                  {t("내려받기")}
                </button>
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
              <tr key={limit.message}>
                <th scope="row">{t(limitLabel(limit.message))}</th>
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
