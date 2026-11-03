import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { ApiError, api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon, type IconName } from "../components/Icon"
import { PasswordField } from "../components/PasswordField"
import { Pill } from "../components/Pill"
import { Presence } from "../components/Presence"
import { Toast } from "../components/Toast"
import { TabBar } from "../components/TabBar"
import { locale, t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { useNotice } from "../hooks/useNotice"
import { Members } from "./AdminMembers"
import { Content, Insights, Live, Operations, ProposalDrawer, RevenuePanel, SystemPanel } from "./AdminMore"
import {
  ActivityLog,
  CsvButton,
  groupErrors,
  Notices,
  Pager,
  readStored,
  ServiceHealth,
  SortHeader,
  TemplatePicker,
  useTable,
  WaitBadge,
  writeStored,
} from "./AdminTools"
import type {
  AdminInquiry,
  AdminMember,
  AdminMemberDetail,
  AdminOverview,
  AdminPayment,
  AdminProposalRow,
  AdminReport,
  ErrorEntry,
  PlatformStats,
  ReportAction,
  SuspendedAccount,
} from "../types"

// The operators' token lives in this tab only, and goes when it closes.
const storageKey = "uniconnect-admin-token"

function readToken() {
  try {
    return sessionStorage.getItem(storageKey) ?? ""
  } catch {
    return ""
  }
}

function writeToken(token: string) {
  try {
    if (token) sessionStorage.setItem(storageKey, token)
    else sessionStorage.removeItem(storageKey)
  } catch {
    // Without storage the token lasts until the page reloads.
  }
}

type Tab = "waiting" | "held" | "answered"

// What was done about a report, in the past tense.
const doneLabels: Record<ReportAction, string> = {
  dismiss: "그대로 둠",
  "hide-review": "후기 내림",
  "hide-reply": "답글 내림",
  suspend: "계정 정지함",
}

const kindLabels: Record<AdminReport["target"]["kind"], string> = {
  account: "계정",
  message: "채팅 메시지",
  review: "후기",
  reply: "후기 답글",
}

// A member's report: what kind of thing over which reason, who reported
// whom, the reported text as it was, and either what was done or the ways
// to settle it.
function ReportCard({
  report,
  onResolve,
}: {
  report: AdminReport
  onResolve: (report: AdminReport, action: ReportAction) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const person = (who: AdminReport["about"]) => (who ? `${who.name} · ${t(who.role)} · ${who.email}` : t("탈퇴한 회원"))
  const act = (action: ReportAction) => {
    setBusy(true)
    void onResolve(report, action).finally(() => setBusy(false))
  }

  return (
    <article className="admin-card">
      <div className="admin-card-head">
        <span className="admin-category">
          {t(kindLabels[report.target.kind])} · {t(report.reason)}
        </span>
        <time dateTime={report.createdAt}>{formatDateTime(report.createdAt)}</time>
      </div>
      <p className="admin-from">{t("신고한 회원: {name}", { name: person(report.reporter) })}</p>
      <p className="admin-from">{t("신고된 회원: {name}", { name: person(report.about) })}</p>
      {report.excerpt && <blockquote className="safety-quote">{report.excerpt}</blockquote>}
      {report.detail && <p className="admin-question">{report.detail}</p>}
      {report.resolution ? (
        <div className="admin-answer">
          <strong>
            {t(doneLabels[report.resolution.action])} <small>{formatDateTime(report.resolution.at)}</small>
          </strong>
        </div>
      ) : (
        <div className="admin-report-actions">
          <button className="cancel-button" disabled={busy} onClick={() => act("dismiss")} type="button">
            {t("그대로 두기")}
          </button>
          {report.target.kind === "review" && (
            <button className="cancel-button" disabled={busy} onClick={() => act("hide-review")} type="button">
              {t("후기 내리기")}
            </button>
          )}
          {report.target.kind === "reply" && (
            <button className="cancel-button" disabled={busy} onClick={() => act("hide-reply")} type="button">
              {t("답글 내리기")}
            </button>
          )}
          <button className="decline-button" disabled={busy || !report.about} onClick={() => act("suspend")} type="button">
            {t("계정 정지")}
          </button>
        </div>
      )}
    </article>
  )
}

function InquiryCard({
  inquiry,
  onAnswer,
  onHandle,
  onOpenMember,
}: {
  inquiry: AdminInquiry
  onOpenMember: (id: string) => void
  onAnswer: (inquiry: AdminInquiry, answer: string) => Promise<void>
  // Who on the team takes it, and whether it waits on something.
  onHandle: (inquiry: AdminInquiry, handling: { assignee: string; held: boolean }) => void
}) {
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [assignee, setAssignee] = useState(inquiry.handling?.assignee ?? "")
  const held = Boolean(inquiry.handling?.heldAt)

  return (
    <article className="admin-card">
      <div className="admin-card-head">
        <span className="admin-category">{t(inquiry.category)}</span>
        <span className="admin-card-meta">
          {!inquiry.answer && <WaitBadge at={inquiry.createdAt} late={2} text={(days) => t("{days}일째 대기", { days })} />}
          <time dateTime={inquiry.createdAt}>{formatDateTime(inquiry.createdAt)}</time>
        </span>
      </div>
      <p className="admin-from">
        {inquiry.from ? `${inquiry.from.name} · ${t(inquiry.from.role)} · ${inquiry.from.email}` : t("탈퇴한 회원")}
        {inquiry.from && (
          <>
            {" "}
            <button className="console-inline" onClick={() => onOpenMember(inquiry.accountId)} type="button">
              {t("회원 보기")}
            </button>
          </>
        )}
      </p>
      <p className="admin-question">{inquiry.question}</p>
      {!inquiry.answer && (
        <form
          className="console-handling"
          onSubmit={(event) => {
            event.preventDefault()
            onHandle(inquiry, { assignee: assignee.trim(), held })
          }}
        >
          <input
            aria-label={t("담당자")}
            maxLength={20}
            onBlur={() => assignee.trim() !== (inquiry.handling?.assignee ?? "") && onHandle(inquiry, { assignee: assignee.trim(), held })}
            onChange={(event) => setAssignee(event.target.value)}
            placeholder={t("담당자")}
            value={assignee}
          />
          <button className="console-text-button" onClick={() => onHandle(inquiry, { assignee: assignee.trim(), held: !held })} type="button">
            {held ? t("보류 풀기") : t("보류")}
          </button>
        </form>
      )}
      {inquiry.answer ? (
        <div className="admin-answer">
          <strong>{t("답변")} {inquiry.answeredAt && <small>{formatDateTime(inquiry.answeredAt)}</small>}</strong>
          <p>{inquiry.answer}</p>
        </div>
      ) : (
        <form
          className="admin-answer-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            setBusy(true)
            onAnswer(inquiry, draft.trim()).finally(() => setBusy(false))
          }}
        >
          <TemplatePicker draft={draft} onPick={setDraft} />
          <textarea
            aria-label={t("답변")}
            maxLength={2000}
            placeholder={t("회원이 '내 질문'에서 보게 될 답변을 적어 주세요.")}
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="primary-button" disabled={busy || !draft.trim()} type="submit">
            {t("답변 보내기")}
          </button>
        </form>
      )}
    </article>
  )
}

// The figures on the operators' screen, in the order they are shown.
const figures: { key: keyof PlatformStats; label: string }[] = [
  { key: "students", label: "가입한 학생단체" },
  { key: "brands", label: "가입한 브랜드" },
  { key: "newThisWeek", label: "이번 주 새 가입" },
  { key: "events", label: "등록된 행사" },
  { key: "upcomingEvents", label: "다가오는 행사" },
  { key: "proposals", label: "보낸 제안" },
  { key: "sponsorships", label: "확정된 협찬" },
  { key: "scans", label: "QR 스캔" },
  { key: "coupons", label: "쿠폰 수령" },
  { key: "visits", label: "매장 방문" },
  { key: "messages", label: "주고받은 메시지" },
  { key: "questionsWaiting", label: "답변 대기 질문" },
]

// Accepted out of the proposals answered so far, as a percentage.
const acceptance = (accepted: number, declined: number) =>
  accepted + declined === 0 ? "-" : `${Math.round((accepted / (accepted + declined)) * 100)}%`

// Real members' figures large, with the demo data's totals under each.
function StatsPanel({ stats }: { stats: PlatformStats }) {
  return (
    <section aria-labelledby="admin-stats-title" className="admin-stats">
      <h2 className="admin-section-title" id="admin-stats-title">
        {t("지표")}
      </h2>
      <p className="field-hint">{t("큰 숫자는 실제 회원의 것이고 작은 글씨는 데모 계정과 시드 데이터를 더한 값이에요.")}</p>
      <dl className="admin-stat-grid">
        {figures.map(({ key, label }) => (
          <div className="admin-stat" key={key}>
            <dt>{t(label)}</dt>
            <dd>
              <strong>{stats[key].real.toLocaleString(locale)}</strong>
              <small>{t("데모 포함 {count}", { count: stats[key].total.toLocaleString(locale) })}</small>
            </dd>
          </div>
        ))}
        <div className="admin-stat">
          <dt>{t("제안 수락률")}</dt>
          <dd>
            <strong>{acceptance(stats.accepted.real, stats.declined.real)}</strong>
            <small>{t("데모 포함 {count}", { count: acceptance(stats.accepted.total, stats.declined.total) })}</small>
          </dd>
        </div>
      </dl>
    </section>
  )
}

const paymentKinds: Record<AdminPayment["kind"], string> = { fee: "수수료", report: "상세 리포트", pro: "캠퍼스 파트너스", ad: "상단 광고" }

// One payment for the operators: who paid what, how and when, with the
// actions its state allows (confirming a transfer that arrived, cancelling
// a waiting order, refunding a paid one).
function PaymentCard({
  payment,
  onPaid,
  onCancel,
  onOpenMember,
}: {
  payment: AdminPayment
  onPaid: (payment: AdminPayment) => void
  onCancel: (payment: AdminPayment) => void
  onOpenMember: (id: string) => void
}) {
  const [sure, setSure] = useState(false)
  return (
    <article className="admin-card admin-payment">
      <div className="admin-card-head">
        <span className="admin-category">{t(paymentKinds[payment.kind])}</span>
        <span className="admin-card-meta">
          {payment.status === "pending" && (
            <WaitBadge at={payment.requestedAt} late={3} text={(days) => t("{days}일째 입금 대기", { days })} />
          )}
          <time dateTime={payment.paidAt ?? payment.requestedAt}>{formatDateTime(payment.paidAt ?? payment.requestedAt)}</time>
        </span>
      </div>
      <p className="admin-question">
        {payment.orderName} · <strong>{fullWon(payment.amount)}</strong>
      </p>
      <p className="admin-from">
        {payment.accountName} · {payment.id}
        {payment.status === "paid" && ` · ${payment.method === "card" ? t("카드") : t("계좌 입금")}`}
        {payment.status === "cancelled" && ` · ${payment.cancelReason ?? ""}`}
        {payment.kind === "report" && payment.status === "paid" && ` · ${payment.openedAt ? t("열어 봄") : t("아직 안 열어 봄")}`}{" "}
        <button className="console-inline" onClick={() => onOpenMember(payment.accountId)} type="button">
          {t("회원 보기")}
        </button>
      </p>
      <div className="admin-report-actions">
        {payment.status === "pending" && (
          <>
            <button className="primary-button" onClick={() => onPaid(payment)} type="button">
              {t("입금 확인")}
            </button>
            <button className="cancel-button" onClick={() => onCancel(payment)} type="button">
              {t("주문 취소")}
            </button>
          </>
        )}
        {payment.status === "paid" &&
          (sure ? (
            <button className="decline-button" onClick={() => onCancel(payment)} type="button">
              {payment.card ? t("카드 결제 환불하기") : t("환불했다고 기록하기")}
            </button>
          ) : (
            <button className="cancel-button" onClick={() => setSure(true)} type="button">
              {t("환불")}
            </button>
          ))}
      </div>
    </article>
  )
}

// The operators' screen (/admin, in no menu): with the ADMIN_TOKEN from the
// server's environment, it shows the platform's figures, then lists the
// questions sent from the help center, waiting ones first, and sends answers
// members read under 내 질문.
type Section =
  | "overview"
  | "insights"
  | "members"
  | "proposals"
  | "operations"
  | "live"
  | "payments"
  | "inquiries"
  | "reports"
  | "content"
  | "errors"
  | "notices"
  | "log"
  | "health"
  | "system"

const sections: Section[] = [
  "overview",
  "insights",
  "members",
  "proposals",
  "operations",
  "live",
  "payments",
  "inquiries",
  "reports",
  "content",
  "errors",
  "notices",
  "log",
  "health",
  "system",
]

type Place = { section: Section; member?: string; q?: string }

function readPlace(): Place {
  const params = new URLSearchParams(window.location.search)
  const view = params.get("view") as Section | null
  const section = view && sections.includes(view) ? view : "overview"
  const member = section === "members" ? params.get("member") ?? undefined : undefined
  const q = section === "members" ? params.get("q") ?? undefined : undefined
  return { section, ...(member ? { member } : {}), ...(q ? { q } : {}) }
}

const placePath = ({ section, member, q }: Place) => {
  const params = new URLSearchParams()
  if (section !== "overview") params.set("view", section)
  if (q) params.set("q", q)
  if (member) params.set("member", member)
  const query = params.toString()
  return `/admin${query ? `?${query}` : ""}`
}

// The side menu in three groups: running the service, looking after the
// people in it, and the operators' own tools.
const menuGroups = ["메뉴", "지원", "설정"] as const

const sectionInfo: { key: Section; label: string; icon: IconName; group: (typeof menuGroups)[number] }[] = [
  { key: "overview", label: "개요", icon: "home", group: "메뉴" },
  { key: "insights", label: "분석", icon: "chart", group: "메뉴" },
  { key: "members", label: "회원", icon: "users", group: "메뉴" },
  { key: "proposals", label: "제안 · 협찬", icon: "send", group: "메뉴" },
  { key: "operations", label: "협찬 운영", icon: "link", group: "메뉴" },
  { key: "live", label: "현장", icon: "scan", group: "메뉴" },
  { key: "payments", label: "결제 · 매출", icon: "won", group: "메뉴" },
  { key: "inquiries", label: "문의 · 섭외 요청", icon: "chat", group: "지원" },
  { key: "reports", label: "신고 · 정지", icon: "close", group: "지원" },
  { key: "content", label: "콘텐츠", icon: "edit", group: "지원" },
  { key: "errors", label: "오류", icon: "search", group: "지원" },
  { key: "notices", label: "공지", icon: "bell", group: "설정" },
  { key: "log", label: "활동 기록", icon: "file", group: "설정" },
  { key: "health", label: "서비스 상태", icon: "check", group: "설정" },
  { key: "system", label: "시스템", icon: "lock", group: "설정" },
]

// A week's Monday (2026-10-26) as 10/26.
const weekLabel = (week: string) => `${Number(week.slice(5, 7))}/${Number(week.slice(8, 10))}`

// Change from the week before as a percentage, or null without one.
const change = (now: number, before: number) => (before === 0 ? null : Math.round(((now - before) / before) * 100))

// Up or down from the week before; without a week to compare, the fallback.
function ChangeBadge({ value, suffix, fallback }: { value: number | null; suffix?: string; fallback?: string }) {
  if (value === null) return fallback ? <span className="console-badge">{fallback}</span> : null
  return (
    <span className={value >= 0 ? "console-badge up" : "console-badge down"}>
      {value >= 0 ? "▲" : "▼"} {Math.abs(value)}%{suffix ? ` ${suffix}` : ""}
    </span>
  )
}

// One figure on a card, after TailAdmin: an icon tile, the label, the
// number large in Toss's way, and a badge.
function StatCard({ icon, label, value, badge }: { icon: IconName; label: string; value: string; badge?: ReactNode }) {
  return (
    <section className="console-card console-stat">
      <span aria-hidden="true" className="console-stat-icon">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <h2>{label}</h2>
        <strong>{value}</strong>
      </div>
      {badge}
    </section>
  )
}

// Two figures a week as paired bars, on four grid lines.
function WeeklyBars({ weekly }: { weekly: AdminOverview["weekly"] }) {
  const top = Math.max(4, ...weekly.flatMap((row) => [row.signups, row.proposals]))
  const step = Math.ceil(top / 4)
  const ticks = [4, 3, 2, 1, 0].map((index) => index * step)
  return (
    <div className="console-bars">
      <div aria-hidden="true" className="console-bars-axis">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <ol>
        {weekly.map((row) => (
          <li key={row.week}>
            <div title={t("{week} 주 · 가입 {signups} · 제안 {proposals}", { week: weekLabel(row.week), signups: row.signups, proposals: row.proposals })}>
              <i className="signups" style={{ height: `${(row.signups / (step * 4)) * 100}%` }} />
              <i className="proposals" style={{ height: `${(row.proposals / (step * 4)) * 100}%` }} />
            </div>
            <small>{weekLabel(row.week)}</small>
          </li>
        ))}
      </ol>
    </div>
  )
}

// The acceptance rate as a half ring (TailAdmin's target gauge).
function Gauge({ value }: { value: number | null }) {
  return (
    <div className="console-gauge">
      <svg aria-hidden="true" viewBox="0 0 200 110">
        <path d="M 16 100 A 84 84 0 0 1 184 100" pathLength={100} />
        {value ? <path className="value" d="M 16 100 A 84 84 0 0 1 184 100" pathLength={100} strokeDasharray={`${value} 200`} /> : null}
      </svg>
      <strong>{value === null ? "-" : `${value}%`}</strong>
    </div>
  )
}

const trendKeys = [
  { key: "signups", label: "가입" },
  { key: "proposals", label: "제안" },
  { key: "accepted", label: "수락" },
] as const

// Eight weeks of one figure as a line over a soft area, picked with a
// segmented switch (TailAdmin's statistics chart, Toss's switch).
function TrendChart({ weekly }: { weekly: AdminOverview["weekly"] }) {
  const [key, setKey] = useState<(typeof trendKeys)[number]["key"]>("proposals")
  const values = weekly.map((row) => row[key])
  const top = Math.max(1, ...values)
  const width = 640
  const height = 180
  const x = (index: number) => (values.length > 1 ? (index / (values.length - 1)) * width : width / 2)
  const y = (value: number) => height - (value / top) * (height - 16) - 4
  const line = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ")
  return (
    <section className="console-card wide">
      <div className="console-card-head">
        <div>
          <h2>{t("최근 8주 추이")}</h2>
          <p>{t("주마다 새로 생긴 수예요.")}</p>
        </div>
        <div aria-label={t("추이 항목")} className="console-segment" role="group">
          {trendKeys.map((item) => (
            <button aria-pressed={key === item.key} key={item.key} onClick={() => setKey(item.key)} type="button">
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      <figure className="console-area">
        <svg aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
          <path className="area" d={`${line} L ${x(values.length - 1)} ${height} L ${x(0)} ${height} Z`} />
          <path className="line" d={line} />
        </svg>
        <figcaption>
          {weekly.map((row, index) => (
            <span key={row.week}>
              <b>{values[index]}</b>
              {weekLabel(row.week)}
            </span>
          ))}
        </figcaption>
      </figure>
    </section>
  )
}

const revenueKinds = [
  { key: "fee", label: "수수료" },
  { key: "report", label: "상세 리포트" },
  { key: "pro", label: "캠퍼스 파트너스" },
  { key: "ad", label: "상단 광고" },
] as const

// The overview: the figures as cards, the weeks as bars beside the
// acceptance gauge, what needs the operators now and the revenue, the
// trend, then every figure (members' own beside the totals with the demo).
function Overview({ data, onGo }: { data: AdminOverview; onGo: (section: Section) => void }) {
  const { attention, revenue, weekly, stats } = data
  const todo = [
    { label: t("답변을 기다리는 문의"), count: attention.inquiries, go: "inquiries" as Section, icon: "chat" as IconName },
    { label: t("처리를 기다리는 신고"), count: attention.reports, go: "reports" as Section, icon: "close" as IconName },
    { label: t("확인할 계좌 입금"), count: attention.transfers, go: "payments" as Section, icon: "won" as IconName },
    { label: t("7일 넘게 답 없는 제안"), count: attention.stale, go: "operations" as Section, icon: "send" as IconName },
    { label: t("취소 요청된 계약서"), count: attention.cancels, go: "operations" as Section, icon: "file" as IconName },
    { label: t("현장 이상 신호"), count: attention.alerts, go: "live" as Section, icon: "scan" as IconName },
    { label: t("정지된 계정"), count: attention.suspended, go: "reports" as Section, icon: "lock" as IconName },
  ]
  const thisWeek = weekly.at(-1)
  const lastWeek = weekly.at(-2)
  const answered = stats.accepted.real + stats.declined.real
  const rate = answered === 0 ? null : Math.round((stats.accepted.real / answered) * 100)
  const members = stats.students.real + stats.brands.real
  const revenueTop = Math.max(1, ...revenueKinds.map((item) => revenue.byKind[item.key]))
  return (
    <div className="console-grid">
      <StatCard
        badge={<span className="console-badge up">{t("이번 주 +{count}", { count: stats.newThisWeek.real })}</span>}
        icon="users"
        label={t("회원")}
        value={members.toLocaleString(locale)}
      />
      <StatCard
        badge={<span className="console-badge">{t("누적 {amount}", { amount: fullWon(revenue.total) })}</span>}
        icon="won"
        label={t("이번 달 매출")}
        value={fullWon(revenue.thisMonth)}
      />
      <StatCard
        badge={
          <ChangeBadge
            fallback={t("지난주 {count}건", { count: lastWeek?.proposals ?? 0 })}
            suffix={t("지난주 대비")}
            value={thisWeek && lastWeek ? change(thisWeek.proposals, lastWeek.proposals) : null}
          />
        }
        icon="send"
        label={t("이번 주 제안")}
        value={(thisWeek?.proposals ?? 0).toLocaleString(locale)}
      />
      <StatCard
        badge={<span className="console-badge">{t("파트너스 {count}곳", { count: revenue.partners })}</span>}
        icon="check"
        label={t("확정된 협찬")}
        value={stats.sponsorships.real.toLocaleString(locale)}
      />

      <section className="console-card span-2">
        <div className="console-card-head">
          <div>
            <h2>{t("주간 가입 · 제안")}</h2>
            <p>{t("실제 회원과 데모를 더한 수예요.")}</p>
          </div>
          <ul className="console-legend">
            <li className="signups">{t("가입")}</li>
            <li className="proposals">{t("제안")}</li>
          </ul>
        </div>
        <WeeklyBars weekly={weekly} />
      </section>

      <section className="console-card span-2 console-rate">
        <div className="console-card-head">
          <div>
            <h2>{t("제안 수락률")}</h2>
            <p>{t("실제 회원이 답한 제안 가운데 수락한 몫이에요.")}</p>
          </div>
        </div>
        <Gauge value={rate} />
        <dl>
          <div>
            <dt>{t("보낸 제안")}</dt>
            <dd>{stats.proposals.real.toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt>{t("수락")}</dt>
            <dd>{stats.accepted.real.toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt>{t("거절")}</dt>
            <dd>{stats.declined.real.toLocaleString(locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="console-card span-2">
        <h2>{t("지금 처리할 일")}</h2>
        <ul className="console-todo">
          {todo.map((item) => (
            <li key={item.label}>
              <button className={item.count > 0 ? "hot" : undefined} onClick={() => onGo(item.go)} type="button">
                <span aria-hidden="true" className="console-todo-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span>{item.label}</span>
                <strong>{t("{count}건", { count: item.count })}</strong>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="console-card span-2">
        <div className="console-card-head">
          <div>
            <h2>{t("매출 구성")}</h2>
            <p>{t("결제 완료된 금액이에요.")}</p>
          </div>
          <strong className="console-total">{fullWon(revenue.total)}</strong>
        </div>
        <ul className="console-split-bars">
          {revenueKinds.map((item) => (
            <li key={item.key}>
              <span>{t(item.label)}</span>
              <strong>{fullWon(revenue.byKind[item.key])}</strong>
              <i style={{ width: `${(revenue.byKind[item.key] / revenueTop) * 100}%` }} />
            </li>
          ))}
        </ul>
      </section>

      <TrendChart weekly={weekly} />

      <div className="console-card wide">
        <StatsPanel stats={stats} />
      </div>
    </div>
  )
}

// Every proposal, filtered by its state, newest first.
function Proposals({ token, onNotice }: { token: string; onNotice: (message: string) => void }) {
  const [rows, setRows] = useState<AdminProposalRow[]>()
  const [status, setStatus] = useState("")
  const [examples, setExamples] = useState(false)
  const [open, setOpen] = useState<string>()
  useEffect(() => {
    api.adminProposals(token).then(
      (result) => setRows(result.proposals),
      (error: unknown) => onNotice(errorMessage(error)),
    )
  }, [token, onNotice])
  const shown = (rows ?? []).filter((row) => (examples || !row.example) && (!status || row.status === status))
  const statuses = [...new Set((rows ?? []).map((row) => row.status))]
  const table = useTable(shown, {
    from: (row) => row.from,
    to: (row) => row.to,
    event: (row) => row.event,
    date: (row) => row.date,
    status: (row) => row.status,
    createdAt: (row) => row.createdAt,
  })
  return (
    <div className={open ? "console-split open" : "console-split"}>
    <section className="console-card">
      <div className="console-filters">
        <select aria-label={t("상태")} onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="">{t("모든 상태")}</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {t(item)}
            </option>
          ))}
        </select>
        <label className="console-check">
          <input checked={examples} onChange={(event) => setExamples(event.target.checked)} type="checkbox" />
          {t("예시 데이터도 보기")}
        </label>
        <CsvButton
          name="proposals"
          rows={() => [
            [t("보낸 쪽"), t("받은 쪽"), t("방향"), t("행사"), t("날짜"), t("상태"), t("계약서"), t("보낸 날")],
            ...shown.map((row) => [
              row.from,
              row.to,
              row.kind === "request" ? t("학생단체 → 브랜드") : t("브랜드 → 학생단체"),
              row.event,
              row.date,
              t(row.status),
              row.confirmed ? t("양쪽 확인") : "",
              row.createdAt,
            ]),
          ]}
        />
      </div>
      {!rows ? (
        <p className="field-hint">{t("불러오고 있어요…")}</p>
      ) : (
        <table className="console-table">
          <thead>
            <tr>
              <SortHeader label={t("보낸 쪽")} sortKey="from" table={table} />
              <SortHeader label={t("받은 쪽")} sortKey="to" table={table} />
              <SortHeader label={t("행사")} sortKey="event" table={table} />
              <SortHeader label={t("날짜")} sortKey="date" table={table} />
              <SortHeader label={t("상태")} sortKey="status" table={table} />
              <th scope="col">{t("계약서")}</th>
            </tr>
          </thead>
          <tbody>
            {table.page.map((row) => (
              <tr className={open === row.id ? "selected" : undefined} key={row.id} onClick={() => setOpen(row.id)}>
                <th scope="row">
                  {row.from}
                  <small>{row.kind === "request" ? t("학생단체 → 브랜드") : t("브랜드 → 학생단체")}</small>
                </th>
                <td>{row.to}</td>
                <td>{row.event}</td>
                <td>{row.date || "—"}</td>
                <td>
                  <em className="console-tag">{t(row.status)}</em>
                </td>
                <td>{row.confirmed ? t("양쪽 확인") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && <Pager table={table} unit={t("건")} />}
    </section>
      {open && <ProposalDrawer id={open} key={open} onClose={() => setOpen(undefined)} onNotice={onNotice} token={token} />}
    </div>
  )
}

// ⌘K (Ctrl+K): jump to a screen, run an action, or open a member by name,
// email or school, with the arrows and Enter.
type PaletteItem = { id: string; label: string; hint: string; run: () => void }

function CommandPalette({
  token,
  items,
  onMember,
  onClose,
}: {
  token: string
  items: PaletteItem[]
  onMember: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [members, setMembers] = useState<AdminMember[]>([])
  const [active, setActive] = useState(0)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setMembers([])
      return
    }
    const timer = window.setTimeout(() => {
      api.adminAccounts(token, { q }).then(
        (result) => setMembers(result.accounts.slice(0, 6)),
        () => setMembers([]),
      )
    }, 200)
    return () => window.clearTimeout(timer)
  }, [query, token])
  const words = query.trim().toLowerCase()
  const shown: PaletteItem[] = [
    ...items.filter((item) => !words || `${item.label} ${item.hint}`.toLowerCase().includes(words)),
    ...members.map((member) => ({
      id: `member-${member.id}`,
      label: member.name,
      hint: `${t("회원")} · ${member.email}`,
      run: () => onMember(member.id),
    })),
  ]
  const pick = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }
  return (
    <div className="console-palette-scrim" onClick={onClose} role="presentation">
      <div aria-label={t("명령 팔레트")} aria-modal="true" className="console-palette" onClick={(event) => event.stopPropagation()} role="dialog">
        <input
          aria-activedescendant={shown[active] ? `palette-${shown[active].id}` : undefined}
          aria-controls="palette-list"
          aria-label={t("화면 · 기능 · 회원 찾기")}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose()
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setActive((index) => Math.min(shown.length - 1, index + 1))
            }
            if (event.key === "ArrowUp") {
              event.preventDefault()
              setActive((index) => Math.max(0, index - 1))
            }
            if (event.key === "Enter") pick(shown[active])
          }}
          placeholder={t("화면, 기능, 회원 이름을 입력하세요")}
          role="combobox"
          aria-expanded="true"
          value={query}
        />
        <ul id="palette-list" role="listbox">
          {shown.map((item, index) => (
            <li
              aria-selected={index === active}
              className={index === active ? "active" : undefined}
              id={`palette-${item.id}`}
              key={item.id}
              onClick={() => pick(item)}
              onMouseEnter={() => setActive(index)}
              role="option"
            >
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </li>
          ))}
          {shown.length === 0 && <li className="empty">{t("맞는 항목이 없어요.")}</li>}
        </ul>
      </div>
    </div>
  )
}

// A short two-note chime for new work, through Web Audio (no file).
function chime() {
  try {
    const context = new AudioContext()
    for (const [index, frequency] of [880, 1320].entries()) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + index * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.12 + 0.25)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(context.currentTime + index * 0.12)
      oscillator.stop(context.currentTime + index * 0.12 + 0.3)
    }
  } catch {
    // No sound where Web Audio is missing.
  }
}

const themeKey = "uniconnect-admin-theme"
const idleMs = 30 * 60 * 1000

const shortcuts = [
  { keys: "⌘K · Ctrl+K", text: "명령 팔레트: 화면 · 기능 · 회원으로 바로 가기" },
  { keys: "/", text: "회원 검색으로" },
  { keys: "?", text: "이 도움말 열고 닫기" },
  { keys: "Esc", text: "팔레트 · 도움말 닫기" },
  { keys: "← →", text: "브라우저 뒤로 · 앞으로 (화면 이동 기록)" },
]
const soundKey = "uniconnect-admin-sound"

// The operators' console (/admin, mounted on its own by main.tsx, with no
// member screens around it): the ADMIN_TOKEN from the server's environment
// opens it; a side menu leads to the overview, members, proposals,
// payments and revenue, questions and partner requests, reports and
// suspensions, and errors.
export function AdminPage({ onNotice }: { onNotice: (message: string) => void }) {
  const [token, setToken] = useState(readToken)
  const [tokenDraft, setTokenDraft] = useState("")
  // Where the console is, from the address (/admin?view=members&member=<id>),
  // so the browser's back and forward buttons and swipes move through it.
  const [place, setPlace] = useState(readPlace)
  const section = place.section
  const go = useCallback((next: Place) => {
    const current = readPlace()
    if (current.section === next.section && current.member === next.member) return
    window.history.pushState(null, "", placePath(next))
    setPlace(next)
    window.scrollTo(0, 0)
  }, [])
  const setSection = useCallback((next: Section) => go({ section: next }), [go])
  // The side menu: narrowed to icons on wide screens, a drawer on narrow ones.
  const [narrow, setNarrow] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [search, setSearch] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const [groupSame, setGroupSame] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sound, setSound] = useState(() => readStored(soundKey, true))
  const [dark, setDark] = useState(() => readStored(themeKey, false))
  useEffect(() => {
    if (dark) document.body.dataset.consoleTheme = "dark"
    else delete document.body.dataset.consoleTheme
  }, [dark])
  // ⌘K or Ctrl+K opens the command palette from anywhere.
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    document.addEventListener("keydown", open)
    return () => document.removeEventListener("keydown", open)
  }, [])
  // "?" anywhere but a text box shows the keyboard shortcuts.
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    const help = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key === "Escape") setHelpOpen(false)
      if (event.key !== "?" || target?.closest("input, textarea, select, [contenteditable]")) return
      event.preventDefault()
      setHelpOpen((value) => !value)
    }
    document.addEventListener("keydown", help)
    return () => document.removeEventListener("keydown", help)
  }, [])
  // Reads everything again each minute while the operators watch.
  const [autoRefresh, setAutoRefresh] = useState(false)
  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => setReload((count) => count + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh])
  // "/" anywhere but a text box jumps to the member search.
  useEffect(() => {
    const jump = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key !== "/" || event.metaKey || event.ctrlKey || target?.closest("input, textarea, select, [contenteditable]")) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener("keydown", jump)
    return () => document.removeEventListener("keydown", jump)
  }, [])
  const pick = (next: Section) => {
    setMenuOpen(false)
    setProfileOpen(false)
    setSection(next)
  }
  useEffect(() => {
    const back = () => setPlace(readPlace())
    window.addEventListener("popstate", back)
    return () => window.removeEventListener("popstate", back)
  }, [])
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [inquiries, setInquiries] = useState<AdminInquiry[] | null>(null)
  const [reports, setReports] = useState<AdminReport[]>([])
  const [suspended, setSuspended] = useState<SuspendedAccount[]>([])
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [tab, setTab] = useState<Tab>("waiting")
  const [kind, setKind] = useState("")
  const [reportTab, setReportTab] = useState<"open" | "done">("open")
  const [paymentTab, setPaymentTab] = useState<"pending" | "paid" | "cancelled">("pending")
  const [error, setError] = useState("")
  const [loadedAt, setLoadedAt] = useState<string>()
  const [reload, setReload] = useState(0)

  const signOut = useCallback((message = "") => {
    writeToken("")
    setToken("")
    setOverview(null)
    setInquiries(null)
    setReports([])
    setSuspended([])
    setErrors([])
    setPayments([])
    setError(message)
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([
      api.adminOverview(token),
      api.adminInquiries(token),
      api.adminReports(token),
      api.adminErrors(token),
      api.adminPayments(token),
    ])
      .then(([seen, listed, reported, failed, paid]) => {
        if (cancelled) return
        writeToken(token)
        setOverview(seen)
        setInquiries(listed.inquiries)
        setReports(reported.reports)
        setSuspended(reported.suspended)
        setErrors(failed.errors)
        setPayments(paid.payments)
        setLoadedAt(new Date().toISOString())
        setError("")
      })
      .catch((caught) => {
        if (cancelled) return
        if (caught instanceof ApiError && caught.status === 403) signOut(t("관리자 토큰이 맞지 않아요."))
        else setError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [token, signOut, reload])

  const answer = async (inquiry: AdminInquiry, text: string) => {
    try {
      const result = await api.answerInquiry(token, inquiry.id, text)
      setInquiries((current) =>
        (current ?? []).map((item) => (item.id === inquiry.id ? { ...item, ...result.inquiry } : item)),
      )
      onNotice(t("답변을 보냈어요."))
    } catch (caught) {
      onNotice(errorMessage(caught))
    }
  }

  const handle = (inquiry: AdminInquiry, handling: { assignee: string; held: boolean }) =>
    void api.adminHandling(token, inquiry.id, handling).then(
      (result) => {
        setInquiries((current) => (current ?? []).map((item) => (item.id === inquiry.id ? { ...item, handling: result.handling } : item)))
        onNotice(handling.held && !inquiry.handling?.heldAt ? t("보류로 옮겼어요.") : t("담당을 저장했어요."))
      },
      (error: unknown) => onNotice(errorMessage(error)),
    )

  // Settles a report, then reads the reports and suspended accounts again.
  const resolve = async (report: AdminReport, action: ReportAction) => {
    try {
      await api.resolveReport(token, report.id, action)
      const reported = await api.adminReports(token)
      setReports(reported.reports)
      setSuspended(reported.suspended)
      onNotice(t("신고를 처리했어요."))
    } catch (caught) {
      onNotice(errorMessage(caught))
    }
  }

  const unsuspend = async (account: SuspendedAccount) => {
    try {
      await api.unsuspendAccount(token, account.id)
      setSuspended((current) => current.filter((item) => item.id !== account.id))
      onNotice(t("{name}의 정지를 풀었어요.", { name: account.name }))
    } catch (caught) {
      onNotice(errorMessage(caught))
    }
  }

  // Settles a payment, then reads the payments again.
  const settle = async (change: () => Promise<unknown>, done: string) => {
    try {
      await change()
      setPayments((await api.adminPayments(token)).payments)
      onNotice(done)
    } catch (caught) {
      onNotice(errorMessage(caught))
    }
  }

  // What waits for the operators, in the tab's title, with a chime when it
  // grows while the console is open.
  const pendingCount =
    (inquiries ?? []).filter((inquiry) => !inquiry.answer && !inquiry.handling?.heldAt).length +
    reports.filter((report) => !report.resolution).length +
    payments.filter((payment) => payment.status === "pending").length
  const lastCount = useRef<number | null>(null)
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) uniconnect Admin` : "uniconnect Admin"
    if (inquiries && lastCount.current !== null && pendingCount > lastCount.current && sound) chime()
    if (inquiries) lastCount.current = pendingCount
  }, [pendingCount, inquiries, sound])

  // Thirty minutes without a press or a key signs the console out, so an
  // open tab on a shared computer doesn't stay in.
  useEffect(() => {
    if (!token) return
    let last = Date.now()
    const touch = () => {
      last = Date.now()
    }
    const events = ["pointerdown", "keydown", "wheel"] as const
    for (const name of events) document.addEventListener(name, touch, { passive: true })
    const timer = window.setInterval(() => {
      if (Date.now() - last > idleMs) signOut(t("30분 동안 쓰지 않아 나갔어요. 토큰을 다시 넣어 주세요."))
    }, 60_000)
    return () => {
      for (const name of events) document.removeEventListener(name, touch)
      window.clearInterval(timer)
    }
  }, [token, signOut])

  if (!token || !overview) {
    return (
      <div className="console-login">
        <form
          className="console-login-card"
          onSubmit={(event) => {
            event.preventDefault()
            if (tokenDraft.trim()) setToken(tokenDraft.trim())
          }}
        >
          <img alt="uniconnect" src={logo} />
          <h1>{t("운영자 콘솔")}</h1>
          <p>{t("서버의 ADMIN_TOKEN으로 들어와요. 토큰은 이 탭에만 기억되고 탭을 닫으면 지워져요.")}</p>
          <PasswordField
            autoComplete="off"
            label={t("관리자 토큰")}
            onChange={(event) => setTokenDraft(event.target.value)}
            placeholder={t("서버의 ADMIN_TOKEN")}
            toggleLabel={t("토큰 보기")}
            value={tokenDraft}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button wide" disabled={!tokenDraft.trim() || (Boolean(token) && !error)} type="submit">
            {token && !error ? t("확인하고 있어요…") : t("들어가기")}
          </button>
        </form>
      </div>
    )
  }

  const unanswered = (inquiries ?? []).filter((inquiry) => !inquiry.answer)
  const waiting = unanswered.filter((inquiry) => !inquiry.handling?.heldAt)
  const heldList = unanswered.filter((inquiry) => inquiry.handling?.heldAt)
  const answered = (inquiries ?? []).filter((inquiry) => inquiry.answer)
  const kinds = [...new Set((inquiries ?? []).map((inquiry) => inquiry.category))]
  const list = (tab === "waiting" ? waiting : tab === "held" ? heldList : answered).filter((inquiry) => !kind || inquiry.category === kind)
  const openReports = reports.filter((report) => !report.resolution)
  const doneReports = reports.filter((report) => report.resolution)
  const shownReports = reportTab === "open" ? openReports : doneReports
  const shownPayments = payments.filter((payment) => payment.status === paymentTab)
  const badges: Partial<Record<Section, number>> = {
    inquiries: waiting.length,
    reports: openReports.length,
    payments: payments.filter((payment) => payment.status === "pending").length,
    operations: overview.attention.stale + overview.attention.cancels,
    live: overview.attention.alerts,
  }
  const current = sectionInfo.find((item) => item.key === section)!
  const todoCount = waiting.length + openReports.length + (badges.payments ?? 0)

  return (
    <div className={narrow ? "console narrow" : "console"}>
      <aside className={menuOpen ? "console-side open" : "console-side"}>
        <button aria-label={t("운영자 콘솔 처음으로")} className="console-brand" onClick={() => pick("overview")} type="button">
          <img alt="" src={logo} />
          <span>Admin</span>
        </button>
        <nav aria-label={t("운영자 메뉴")}>
          {menuGroups.map((group) => (
            <div className="console-nav-group" key={group}>
              <h2>{t(group)}</h2>
              {sectionInfo
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    aria-current={section === item.key ? "page" : undefined}
                    className={section === item.key ? "active" : undefined}
                    key={item.key}
                    onClick={() => pick(item.key)}
                    title={narrow ? t(item.label) : undefined}
                    type="button"
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{t(item.label)}</span>
                    {badges[item.key] ? <em>{badges[item.key]}</em> : null}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <a className="console-side-foot" href="/">
          <Icon name="globe" size={16} />
          <span>{t("사이트로 가기")}</span>
        </a>
      </aside>
      {menuOpen && <button aria-label={t("메뉴 닫기")} className="console-scrim" onClick={() => setMenuOpen(false)} type="button" />}
      <div className="console-frame">
        <header className="console-bar">
          <button
            aria-expanded={menuOpen}
            aria-label={t("메뉴 접기 · 펴기")}
            className="console-round"
            onClick={() => {
              if (window.matchMedia("(max-width: 960px)").matches) setMenuOpen((open) => !open)
              else setNarrow((value) => !value)
            }}
            type="button"
          >
            <Icon name="menu" size={18} />
          </button>
          <form
            className="console-search"
            onSubmit={(event) => {
              event.preventDefault()
              const q = search.trim()
              if (q) go({ section: "members", q })
            }}
            role="search"
          >
            <Icon name="search" size={16} />
            <input
              aria-keyshortcuts="/"
              aria-label={t("회원 찾기")}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("회원 이름 · 이메일 · 학교")}
              ref={searchRef}
              value={search}
            />
            <kbd aria-hidden="true">/</kbd>
          </form>
          <div className="console-bar-end">
            <button aria-keyshortcuts="Meta+K Control+K" aria-label={t("명령 팔레트 열기")} className="console-round wide" onClick={() => setPaletteOpen(true)} type="button">
              <kbd>⌘K</kbd>
            </button>
            <button aria-label={t("처리할 일 {count}건", { count: todoCount })} className="console-round" onClick={() => pick("overview")} type="button">
              <Icon name="bell" size={18} />
              {todoCount > 0 && <i className="console-dot" />}
            </button>
            <div className="console-profile">
              <button aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)} type="button">
                <span aria-hidden="true">{t("운")}</span>
                {t("운영자")}
                <Icon name="chevron" size={14} />
              </button>
              {profileOpen && (
                <div className="console-profile-menu">
                  <button
                    aria-pressed={dark}
                    onClick={() => {
                      setDark(!dark)
                      writeStored(themeKey, !dark)
                    }}
                    type="button"
                  >
                    {dark ? t("밝은 모드") : t("다크 모드")}
                  </button>
                  <button
                    aria-pressed={sound}
                    onClick={() => {
                      setSound(!sound)
                      writeStored(soundKey, !sound)
                    }}
                    type="button"
                  >
                    {sound ? t("알림 소리 끄기") : t("알림 소리 켜기")}
                  </button>
                  <a href="/">{t("사이트로 가기")}</a>
                  <button onClick={() => signOut()} type="button">
                    {t("나가기")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      <main className="console-main">
        <header className="console-top">
          <div>
            <small>{t("운영자 콘솔")}</small>
            <h1>{t(current.label)}</h1>
          </div>
          <div>
            {loadedAt && <small>{t("{time} 기준", { time: formatDateTime(loadedAt) })}</small>}
            <label className="console-check">
              <input checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} type="checkbox" />
              {t("1분마다")}
            </label>
            <button className="console-text-button" onClick={() => setReload((count) => count + 1)} type="button">
              {t("새로고침")}
            </button>
          </div>
        </header>

        {section === "overview" && <Overview data={overview} onGo={setSection} />}

        {section === "members" && (
          <Members
            key={place.q ?? ""}
            memberId={place.member}
            onNotice={onNotice}
            query={place.q}
            onOpenMember={(member) => go({ section: "members", member })}
            token={token}
          />
        )}

        {section === "proposals" && <Proposals onNotice={onNotice} token={token} />}

        {section === "payments" && <RevenuePanel payments={payments} />}

        {section === "payments" && (
          <section className="console-card">
            <div className="console-filters">
              <TabBar
                items={[
                  { value: "pending", label: <>{t("결제 대기")}<em>{payments.filter((item) => item.status === "pending").length}</em></> },
                  { value: "paid", label: <>{t("결제 완료")}<em>{payments.filter((item) => item.status === "paid").length}</em></> },
                  { value: "cancelled", label: <>{t("취소 · 환불")}<em>{payments.filter((item) => item.status === "cancelled").length}</em></> },
                ]}
                label={t("결제 상태")}
                onChange={setPaymentTab}
                value={paymentTab}
              />
              <CsvButton
                name="payments"
                rows={() => [
                  [t("주문 번호"), t("상품"), t("내용"), t("금액"), t("회원"), t("상태"), t("결제 수단"), t("요청"), t("결제"), t("취소 사유")],
                  ...payments.map((payment) => [
                    payment.id,
                    t(paymentKinds[payment.kind]),
                    payment.orderName,
                    payment.amount,
                    payment.accountName,
                    payment.status === "paid" ? t("결제 완료") : payment.status === "pending" ? t("결제 대기") : t("취소 · 환불"),
                    payment.method === "card" ? t("카드") : payment.method === "transfer" ? t("계좌 입금") : "",
                    payment.requestedAt,
                    payment.paidAt ?? "",
                    payment.cancelReason ?? "",
                  ]),
                ]}
              />
            </div>
            {shownPayments.length === 0 ? (
              <p className="day-empty">{t("해당하는 결제가 없어요.")}</p>
            ) : (
              <div className="admin-list">
                {shownPayments.map((payment) => (
                  <PaymentCard
                    key={payment.id}
                    onOpenMember={(member) => go({ section: "members", member })}
                    onCancel={(item) =>
                      void settle(
                        () => api.adminCancelPayment(token, item.id, item.status === "paid" ? t("운영자 환불") : t("운영자 취소")),
                        item.status === "paid" ? t("환불했어요.") : t("주문을 취소했어요."),
                      )
                    }
                    onPaid={(item) => void settle(() => api.adminMarkPaid(token, item.id), t("입금을 확인했어요."))}
                    payment={payment}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {section === "inquiries" && (
          <section className="console-card">
            <div className="console-filters">
              <TabBar
                items={[
                  { value: "waiting", label: <>{t("답변 대기")}<em>{waiting.length}</em></> },
                  { value: "held", label: <>{t("보류")}<em>{heldList.length}</em></> },
                  { value: "answered", label: <>{t("답변 완료")}<em>{answered.length}</em></> },
                ]}
                label={t("질문 상태")}
                onChange={setTab}
                value={tab}
              />
              <select aria-label={t("질문 종류")} onChange={(event) => setKind(event.target.value)} value={kind}>
                <option value="">{t("모든 종류")}</option>
                {kinds.map((item) => (
                  <option key={item} value={item}>
                    {t(item)}
                  </option>
                ))}
              </select>
            </div>
            {list.length === 0 ? (
              <p className="day-empty">{tab === "waiting" ? t("답을 기다리는 질문이 없어요.") : tab === "held" ? t("보류한 질문이 없어요.") : t("아직 답한 질문이 없어요.")}</p>
            ) : (
              <div className="admin-list" key={tab}>
                {list.map((inquiry) => (
                  <InquiryCard
                    inquiry={inquiry}
                    key={inquiry.id}
                    onAnswer={answer}
                    onHandle={handle}
                    onOpenMember={(member) => go({ section: "members", member })}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {section === "reports" && (
          <>
            <section className="console-card">
              <TabBar
                items={[
                  { value: "open", label: <>{t("처리 대기")}<em>{openReports.length}</em></> },
                  { value: "done", label: <>{t("처리 완료")}<em>{doneReports.length}</em></> },
                ]}
                label={t("신고 상태")}
                onChange={setReportTab}
                value={reportTab}
              />
              {shownReports.length === 0 ? (
                <p className="day-empty">{reportTab === "open" ? t("처리를 기다리는 신고가 없어요.") : t("아직 처리한 신고가 없어요.")}</p>
              ) : (
                <div className="admin-list" key={reportTab}>
                  {shownReports.map((report) => (
                    <ReportCard key={report.id} onResolve={resolve} report={report} />
                  ))}
                </div>
              )}
            </section>
            <section className="console-card">
              <h2>{t("정지된 계정")}</h2>
              {suspended.length === 0 ? (
                <p className="day-empty">{t("정지된 계정이 없어요.")}</p>
              ) : (
                <ul className="admin-suspended">
                  {suspended.map((account) => (
                    <li key={account.id}>
                      <span>
                        {account.name} · {t(account.role)} · {account.email}
                        <small>{formatDateTime(account.suspendedAt)}</small>
                      </span>
                      <button className="cancel-button" onClick={() => void unsuspend(account)} type="button">
                        {t("정지 풀기")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {section === "insights" && <Insights onNotice={onNotice} token={token} />}

        {section === "operations" && <Operations onNotice={onNotice} token={token} />}

        {section === "live" && <Live onNotice={onNotice} token={token} />}

        {section === "content" && <Content onNotice={onNotice} token={token} />}

        {section === "system" && <SystemPanel onNotice={onNotice} token={token} />}

        {section === "notices" && <Notices onNotice={onNotice} token={token} />}

        {section === "log" && <ActivityLog onNotice={onNotice} token={token} />}

        {section === "health" && <ServiceHealth onNotice={onNotice} token={token} />}

        {section === "errors" && (
          <section className="console-card">
            <div className="console-filters">
              <label className="console-check">
                <input checked={groupSame} onChange={(event) => setGroupSame(event.target.checked)} type="checkbox" />
                {t("같은 오류 묶기")}
              </label>
            </div>
            {errors.length === 0 ? (
              <p className="day-empty">{t("기록된 오류가 없어요.")}</p>
            ) : (
              <div className="admin-list">
                {(groupSame ? groupErrors(errors) : errors.map((entry) => ({ entry, count: 1 }))).slice(0, 100).map(({ entry, count }) => (
                  <article className="admin-card admin-error" key={entry.id}>
                    <div className="admin-card-head">
                      <span className="admin-category">{entry.source === "server" ? t("서버") : t("화면")}</span>
                      <span className="admin-card-meta">
                        {count > 1 && <span className="console-badge down">{t("{count}번", { count })}</span>}
                        <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                      </span>
                    </div>
                    <p className="admin-question">{entry.message}</p>
                    <p className="admin-from">
                      {entry.where} · {entry.path}
                    </p>
                    {entry.stack && <pre className="admin-stack">{entry.stack}</pre>}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      </div>
      {helpOpen && (
        <div className="console-palette-scrim" onClick={() => setHelpOpen(false)} role="presentation">
          <div aria-label={t("키보드 단축키")} aria-modal="true" className="console-palette console-help" onClick={(event) => event.stopPropagation()} role="dialog">
            <header>
              <h2>{t("키보드 단축키")}</h2>
              <button aria-label={t("닫기")} autoFocus className="console-icon" onClick={() => setHelpOpen(false)} type="button">
                <Icon name="close" size={16} />
              </button>
            </header>
            <dl>
              {shortcuts.map((item) => (
                <div key={item.keys}>
                  <dt>
                    <kbd>{item.keys}</kbd>
                  </dt>
                  <dd>{t(item.text)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      {paletteOpen && (
        <CommandPalette
          items={[
            ...sectionInfo.map((item) => ({ id: `go-${item.key}`, label: t(item.label), hint: t("화면"), run: () => pick(item.key) })),
            { id: "reload", label: t("새로고침"), hint: t("기능"), run: () => setReload((count) => count + 1) },
            { id: "help", label: t("키보드 단축키"), hint: t("기능"), run: () => setHelpOpen(true) },
            {
              id: "theme",
              label: dark ? t("밝은 모드") : t("다크 모드"),
              hint: t("기능"),
              run: () => {
                setDark(!dark)
                writeStored(themeKey, !dark)
              },
            },
            { id: "site", label: t("사이트로 가기"), hint: t("기능"), run: () => window.location.assign("/") },
            { id: "out", label: t("나가기"), hint: t("기능"), run: () => signOut() },
          ]}
          onClose={() => setPaletteOpen(false)}
          onMember={(member) => go({ section: "members", member })}
          token={token}
        />
      )}
    </div>
  )
}

// /admin on its own (main.tsx): the console with its own notices, and no
// member screens around it.
export function AdminConsole() {
  const { notice, noticeId, showNotice, hideNotice, pauseNotice } = useNotice()
  return (
    <>
      <AdminPage onNotice={showNotice} />
      <Presence show={notice !== ""}>
        <Toast id={noticeId} message={notice} onDismiss={hideNotice} onPause={pauseNotice} />
      </Presence>
    </>
  )
}
