import { useEffect, useMemo, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { saveFile } from "../lib/download"
import type { AdminAnnouncement, AdminHealth, AdminLogRow, AdminMemberDetail, ErrorEntry } from "../types"

// Tools of the operators' console (pages/AdminPage.tsx): notes on members,
// answer templates, CSV files, the site's notices, the log of what the
// operators did and which services are set up.

const dayMs = 24 * 60 * 60 * 1000

// A convenience kept in this browser (views, columns, templates), or the
// fallback when storage is missing or unreadable.
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Kept until the page closes.
  }
}

// A console table's sort and pages: the rows sorted by the picked key
// (pressing it again turns the order), twenty to a page.
export function useTable<T>(rows: T[], keys: Record<string, (row: T) => string | number>, pageSize = 20) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null)
  const [pageIndex, setPage] = useState(0)
  const sorted = useMemo(() => {
    if (!sort || !Object.prototype.hasOwnProperty.call(keys, sort.key)) return rows
    const value = keys[sort.key]
    return [...rows].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))
      return sort.desc ? -order : order
    })
    // keys is written inline by each table, so only the rows and sort count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(pageIndex, pages - 1)
  return {
    sort,
    sortBy: (key: string) => {
      setSort((before) => (before?.key === key ? { key, desc: !before.desc } : { key, desc: false }))
      setPage(0)
    },
    sorted,
    page: sorted.slice(current * pageSize, (current + 1) * pageSize),
    pageIndex: current,
    pages,
    total: sorted.length,
    setPage,
  }
}

type Table = ReturnType<typeof useTable<never>>

// A column header that sorts by its key, with the order shown.
export function SortHeader({ label, sortKey, table }: { label: string; sortKey: string; table: Pick<Table, "sort" | "sortBy"> }) {
  const active = table.sort?.key === sortKey
  return (
    <th aria-sort={active ? (table.sort!.desc ? "descending" : "ascending") : "none"} scope="col">
      <button className="console-sort" onClick={() => table.sortBy(sortKey)} type="button">
        {label}
        <span aria-hidden="true">{active ? (table.sort!.desc ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  )
}

// The count and the pages under a table.
export function Pager({ table, unit }: { table: Pick<Table, "pageIndex" | "pages" | "total" | "setPage">; unit: string }) {
  return (
    <div className="console-pager">
      <span>
        {table.total.toLocaleString()}
        {unit}
      </span>
      {table.pages > 1 && (
        <span>
          <button aria-label={t("앞 쪽")} className="console-inline" disabled={table.pageIndex === 0} onClick={() => table.setPage(table.pageIndex - 1)} type="button">
            ‹
          </button>
          {t("{page} / {pages}쪽", { page: table.pageIndex + 1, pages: table.pages })}
          <button
            aria-label={t("다음 쪽")}
            className="console-inline"
            disabled={table.pageIndex >= table.pages - 1}
            onClick={() => table.setPage(table.pageIndex + 1)}
            type="button"
          >
            ›
          </button>
        </span>
      )}
    </div>
  )
}

// Whole days since a moment, 0 on the day itself.
export const daysSince = (at: string, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(at)) / dayMs))

// How long something has waited, red from `late` days on.
export function WaitBadge({ at, late, text }: { at: string; late: number; text: (days: number) => string }) {
  const days = daysSince(at)
  return <span className={days >= late ? "console-badge down" : "console-badge"}>{days === 0 ? t("오늘") : text(days)}</span>
}

// A table as a CSV file Excel opens in Korean (with a byte-order mark).
export function csvOf(rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return rows.map((row) => row.map(cell).join(",")).join("\r\n")
}

export function CsvButton({ name, rows }: { name: string; rows: () => (string | number | null | undefined)[][] }) {
  return (
    <button
      className="console-text-button"
      onClick={() => saveFile(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, `﻿${csvOf(rows())}`, "text/csv;charset=utf-8")}
      type="button"
    >
      {t("CSV로 저장")}
    </button>
  )
}

// The operators' note on a member, saved with a press (blank removes it).
export function NoteEditor({
  token,
  member,
  onSaved,
  onNotice,
}: {
  token: string
  member: AdminMemberDetail
  onSaved: (member: AdminMemberDetail) => void
  onNotice: (message: string) => void
}) {
  const [draft, setDraft] = useState(member.note?.text ?? "")
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(member.note?.text ?? ""), [member.id, member.note?.text])
  const changed = draft.trim() !== (member.note?.text ?? "")
  return (
    <form
      className="console-note"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        api
          .adminSaveNote(token, member.id, draft.trim())
          .then(
            (result) => {
              onSaved(result.account)
              onNotice(draft.trim() ? t("메모를 저장했어요.") : t("메모를 지웠어요."))
            },
            (error: unknown) => onNotice(errorMessage(error)),
          )
          .finally(() => setBusy(false))
      }}
    >
      <label>
        <span>
          {t("운영자 메모")}
          {member.note && <small>{formatDateTime(member.note.at)}</small>}
        </span>
        <textarea
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("운영자만 봐요. 신고 · 문의 처리 이력을 남겨 두세요.")}
          rows={3}
          value={draft}
        />
      </label>
      <button className="console-text-button" disabled={busy || !changed} type="submit">
        {t("메모 저장")}
      </button>
    </form>
  )
}

// Answers the operators write often, kept in this browser: three to start
// with, and any answer saved as one.
type Template = { name: string; text: string; own?: boolean }

const templateKey = "uniconnect-admin-templates"

const starterTemplates: Template[] = [
  { name: "확인 후 다시 안내", text: "문의 주셔서 감사해요. 내용을 확인한 뒤 이 답변을 고쳐 다시 알려 드릴게요." },
  { name: "결제 · 환불", text: "결제 내역을 확인했어요. 환불은 영업일 기준 3~5일 안에 결제한 수단으로 돌아가요." },
  {
    name: "추천 매칭",
    text: "추천 매칭의 일치율은 업종 · 관심사 · 협찬 이력으로 매겨져요. 내 정보에서 소개와 태그를 자세히 적어 두면 더 잘 맞는 상대가 추천돼요.",
  },
]

function readTemplates(): Template[] {
  try {
    const saved = JSON.parse(localStorage.getItem(templateKey) ?? "[]") as Template[]
    return [...starterTemplates, ...saved.map((item) => ({ ...item, own: true }))]
  } catch {
    return starterTemplates
  }
}

function writeTemplates(list: Template[]) {
  try {
    localStorage.setItem(templateKey, JSON.stringify(list.filter((item) => item.own).map(({ name, text }) => ({ name, text }))))
  } catch {
    // Without storage the templates last until the page closes.
  }
}

// Picks a template into the answer, or keeps the answer as one.
export function TemplatePicker({ draft, onPick }: { draft: string; onPick: (text: string) => void }) {
  const [list, setList] = useState(readTemplates)
  const [chosen, setChosen] = useState("")
  const picked = list.find((item) => item.name === chosen)
  return (
    <div className="console-templates">
      <select
        aria-label={t("답변 템플릿")}
        onChange={(event) => {
          setChosen(event.target.value)
          const item = list.find((entry) => entry.name === event.target.value)
          if (item) onPick(item.text)
        }}
        value={chosen}
      >
        <option value="">{t("템플릿 넣기")}</option>
        {list.map((item) => (
          <option key={item.name} value={item.name}>
            {item.own ? item.name : t(item.name)}
          </option>
        ))}
      </select>
      <button
        className="console-text-button"
        disabled={!draft.trim()}
        onClick={() => {
          const name = draft.trim().slice(0, 16)
          const next = [...list.filter((item) => item.name !== name), { name, text: draft.trim(), own: true }]
          setList(next)
          writeTemplates(next)
          setChosen(name)
        }}
        type="button"
      >
        {t("템플릿으로 저장")}
      </button>
      {picked?.own && (
        <button
          className="console-text-button"
          onClick={() => {
            const next = list.filter((item) => item !== picked)
            setList(next)
            writeTemplates(next)
            setChosen("")
          }}
          type="button"
        >
          {t("템플릿 지우기")}
        </button>
      )}
    </div>
  )
}

// The same error more than once as one row with its count and latest time.
export function groupErrors(errors: ErrorEntry[]) {
  const groups = new Map<string, { entry: ErrorEntry; count: number }>()
  for (const entry of errors) {
    const key = `${entry.source}|${entry.where}|${entry.message}`
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { entry, count: 1 })
  }
  return [...groups.values()]
}

const audienceLabels: Record<AdminAnnouncement["audience"], string> = { all: "모두", 학생단체: "학생단체", 브랜드: "브랜드" }

// The site's notices: a form for a new one, then the live ones with a press
// to take each down, then those that ended.
export function Notices({ token, onNotice }: { token: string; onNotice: (message: string) => void }) {
  const [items, setItems] = useState<AdminAnnouncement[]>()
  const [form, setForm] = useState({ text: "", tone: "info" as AdminAnnouncement["tone"], audience: "all" as AdminAnnouncement["audience"], from: "", until: "" })
  const [busy, setBusy] = useState(false)
  const load = () =>
    api.adminAnnouncements(token).then(
      (result) => setItems(result.announcements),
      (error: unknown) => onNotice(errorMessage(error)),
    )
  useEffect(() => {
    void load()
    // Loads once per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  return (
    <div className="console-grid">
      <section className="console-card span-2">
        <h2>{t("새 공지")}</h2>
        <p className="field-hint">{t("사이트 맨 위에 띠로 보여요. 회원은 닫을 수 있어요.")}</p>
        <form
          className="console-form"
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            api
              .adminPostAnnouncement(token, { ...form, text: form.text.trim(), from: form.from || undefined, until: form.until || undefined })
              .then(
                () => {
                  setForm({ ...form, text: "", from: "", until: "" })
                  onNotice(t("공지를 올렸어요."))
                  return load()
                },
                (error: unknown) => onNotice(errorMessage(error)),
              )
              .finally(() => setBusy(false))
          }}
        >
          <label>
            {t("내용")}
            <textarea
              maxLength={200}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
              placeholder={t("예: 11월 2일 새벽 2시부터 30분 동안 점검해요.")}
              rows={3}
              value={form.text}
            />
          </label>
          {form.text.trim() && (
            <div className="console-preview">
              <small>{t("미리 보기")}</small>
              <p className={`site-notice ${form.tone}`}>
                <span>{form.text.trim()}</span>
              </p>
            </div>
          )}
          <div className="console-form-row">
            <label>
              {t("종류")}
              <select onChange={(event) => setForm({ ...form, tone: event.target.value as AdminAnnouncement["tone"] })} value={form.tone}>
                <option value="info">{t("안내")}</option>
                <option value="warning">{t("주의")}</option>
              </select>
            </label>
            <label>
              {t("보는 사람")}
              <select
                onChange={(event) => setForm({ ...form, audience: event.target.value as AdminAnnouncement["audience"] })}
                value={form.audience}
              >
                {Object.entries(audienceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("시작하는 날")}
              <input onChange={(event) => setForm({ ...form, from: event.target.value })} type="date" value={form.from} />
            </label>
            <label>
              {t("마지막 날")}
              <input onChange={(event) => setForm({ ...form, until: event.target.value })} type="date" value={form.until} />
            </label>
          </div>
          <button className="primary-button" disabled={busy || !form.text.trim()} type="submit">
            {t("공지 올리기")}
          </button>
        </form>
      </section>
      <section className="console-card span-2">
        <h2>{t("공지 목록")}</h2>
        {!items ? (
          <p className="field-hint">{t("불러오고 있어요…")}</p>
        ) : items.length === 0 ? (
          <p className="day-empty">{t("아직 올린 공지가 없어요.")}</p>
        ) : (
          <ul className="console-notices">
            {items.map((item) => (
              <li className={item.live ? `live ${item.tone}` : undefined} key={item.id}>
                <div>
                  <p>{item.text}</p>
                  <small>
                    {t(audienceLabels[item.audience])} · {formatDateTime(item.createdAt)}
                    {item.from && ` · ${t("{date}부터", { date: item.from })}`}
                    {item.until && ` · ${t("{date}까지", { date: item.until })}`}
                    {` · ${t("닫은 사람 {count}", { count: item.dismissals ?? 0 })}`}
                  </small>
                </div>
                {item.live ? (
                  <button
                    className="console-text-button"
                    onClick={() =>
                      void api.adminEndAnnouncement(token, item.id).then(
                        () => {
                          onNotice(t("공지를 내렸어요."))
                          return load()
                        },
                        (error: unknown) => onNotice(errorMessage(error)),
                      )
                    }
                    type="button"
                  >
                    {t("내리기")}
                  </button>
                ) : (
                  <em className="console-tag">{t("끝남")}</em>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const actionLabels: Record<string, string> = {
  "account-logged-out": "강제 로그아웃",
  "account-tagged": "태그 변경",
  "business-set": "사업자 확인 변경",
  "partners-granted": "파트너스 부여",
  "demo-reset": "예시 데이터 초기화",
  "proposal-nudged": "답 부탁 알림",
  "post-hidden": "모집 글 숨김",
  "post-shown": "모집 글 다시 보임",
  "post-closed": "모집 글 마감",
  "review-hidden": "후기 숨김",
  "review-shown": "후기 다시 보임",
  "review-pinned": "후기 고정",
  "review-unpinned": "후기 고정 풂",
  "inquiry-handled": "문의 담당 · 보류",
  "faq-changed": "FAQ 변경",
  "settings-changed": "설정 변경",
  "payment-paid": "입금 확인",
  "payment-cancelled": "결제 취소 · 환불",
  "report-resolved": "신고 처리",
  "account-suspended": "계정 정지",
  "account-unsuspended": "정지 풀기",
  "inquiry-answered": "문의 답변",
  "note-saved": "메모 저장",
  "announcement-posted": "공지 올림",
  "announcement-ended": "공지 내림",
}

const kindLabels: Record<string, string> = {
  proposal: "제안",
  post: "모집 글",
  review: "후기",
  site: "사이트",
  account: "회원",
  payment: "결제",
  inquiry: "문의",
  report: "신고",
  announcement: "공지",
}

// What the operators did, newest first, filtered by kind.
export function ActivityLog({ token, onNotice }: { token: string; onNotice: (message: string) => void }) {
  const [entries, setEntries] = useState<AdminLogRow[]>()
  const [kind, setKind] = useState("")
  useEffect(() => {
    api.adminLog(token).then(
      (result) => setEntries(result.entries),
      (error: unknown) => onNotice(errorMessage(error)),
    )
  }, [token, onNotice])
  const shown = (entries ?? []).filter((entry) => !kind || entry.target.kind === kind)
  return (
    <section className="console-card">
      <div className="console-filters">
        <select aria-label={t("대상")} onChange={(event) => setKind(event.target.value)} value={kind}>
          <option value="">{t("모든 대상")}</option>
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
        <CsvButton
          name="activity-log"
          rows={() => [
            [t("시각"), t("한 일"), t("대상"), t("이름"), t("내용")],
            ...shown.map((entry) => [entry.at, t(actionLabels[entry.action] ?? entry.action), t(kindLabels[entry.target.kind] ?? entry.target.kind), entry.label, entry.detail]),
          ]}
        />
      </div>
      {!entries ? (
        <p className="field-hint">{t("불러오고 있어요…")}</p>
      ) : shown.length === 0 ? (
        <p className="day-empty">{t("아직 기록이 없어요. 입금 확인, 신고 처리, 답변 같은 일이 여기 쌓여요.")}</p>
      ) : (
        <table className="console-table plain">
          <thead>
            <tr>
              <th scope="col">{t("시각")}</th>
              <th scope="col">{t("한 일")}</th>
              <th scope="col">{t("대상")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDateTime(entry.at)}</td>
                <td>
                  {t(actionLabels[entry.action] ?? entry.action)}
                  {entry.detail && <small>{entry.detail}</small>}
                </td>
                <td>
                  <em className="console-tag">{t(kindLabels[entry.target.kind] ?? entry.target.kind)}</em> {entry.label ?? t("지워진 항목")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="field-hint">{t("최근 500건까지 남아요. 탈퇴한 회원에 대한 기록은 함께 지워져요.")}</p>
    </section>
  )
}

const checkLabels: Record<string, { label: string; off: string }> = {
  mail: { label: "메일 보내기 (Resend)", off: "인증 코드와 알림 메일이 서버 로그에만 남아요." },
  siteUrl: { label: "사이트 주소 (SITE_URL)", off: "알림 메일에 링크가 빠져요." },
  operatorEmail: { label: "오류 알림 메일 (OPERATOR_EMAIL)", off: "새 오류를 메일로 받지 못해요." },
  cron: { label: "일정 알림 (CRON_SECRET)", off: "행사 3일 전 알림 메일이 나가지 않아요." },
  kakaoLocal: { label: "가까운 가게 (Kakao Local)", off: "가까운 순 탭에 실제 가게가 나오지 않아요." },
  kakaoLogin: { label: "카카오 로그인", off: "카카오로 로그인할 수 없어요." },
  naverLogin: { label: "네이버 로그인", off: "네이버로 로그인할 수 없어요." },
  geocoder: { label: "주소 → 지도 (Nominatim)", off: "매장 주소에 거리가 붙지 않아요." },
  nts: { label: "사업자 확인 (국세청)", off: "브랜드가 사업자 등록을 확인할 수 없어요." },
}

const paymentModes: Record<AdminHealth["payments"], string> = {
  off: "꺼짐 · 계좌 입금만",
  test: "테스트 모드",
  live: "실결제",
}

// Which services this copy of the API is set up for, and what is missing
// without each.
export function ServiceHealth({ token, onNotice }: { token: string; onNotice: (message: string) => void }) {
  const [health, setHealth] = useState<AdminHealth>()
  useEffect(() => {
    api.adminHealth(token).then(setHealth, (error: unknown) => onNotice(errorMessage(error)))
  }, [token, onNotice])
  if (!health) return <p className="field-hint">{t("불러오고 있어요…")}</p>
  return (
    <div className="console-grid">
      <section className="console-card span-2">
        <h2>{t("서버")}</h2>
        <dl className="console-facts">
          <div>
            <dt>{t("데이터 저장")}</dt>
            <dd>{health.storage === "postgres" ? t("Postgres (Neon)") : t("서버 파일")}</dd>
          </div>
          <div>
            <dt>{t("카드 결제")}</dt>
            <dd>
              <em className={health.payments === "live" ? "console-tag blue" : health.payments === "test" ? "console-tag" : "console-tag red"}>
                {t(paymentModes[health.payments])}
              </em>
            </dd>
          </div>
          <div>
            <dt>{t("실행 위치")}</dt>
            <dd>{health.vercel ? `Vercel${health.region ? ` · ${health.region}` : ""}` : t("직접 실행")}</dd>
          </div>
          <div>
            <dt>{t("배포 커밋")}</dt>
            <dd>{health.commit ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("데이터")}</dt>
            <dd>
              {t("계정 {accounts} · 세션 {sessions} · 결제 {payments} · 기록 {log}", {
                accounts: health.data.accounts,
                sessions: health.data.sessions,
                payments: health.data.payments,
                log: health.data.logEntries,
              })}
            </dd>
          </div>
        </dl>
      </section>
      <section className="console-card span-2">
        <h2>{t("연결된 서비스")}</h2>
        <ul className="console-checks">
          {health.checks.map((check) => (
            <li className={check.on ? "on" : undefined} key={check.key}>
              <span aria-hidden="true">{check.on ? "✓" : "–"}</span>
              <div>
                <strong>{t(checkLabels[check.key]?.label ?? check.key)}</strong>
                <small>{check.on ? t("연결됨") : t(checkLabels[check.key]?.off ?? "설정되지 않았어요.")}</small>
              </div>
            </li>
          ))}
        </ul>
        <p className="field-hint">{t("값은 보여 주지 않고 설정 여부만 보여요. 바꾸려면 Vercel의 Environment Variables에서 고친 뒤 다시 배포하세요.")}</p>
      </section>
    </div>
  )
}
