import { useCallback, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { AdminMember, AdminMemberDetail } from "../types"
import { CsvButton, NoteEditor, Pager, SortHeader, readStored, useTable, writeStored } from "./AdminTools"

// 운영자의 회원 화면(pages/AdminPage.tsx). 검색하고 필터(뷰로 저장)하고
// 정렬하고 페이지로 나누며, 여러 명에게 한 작업을 하려고 고르고, 하나는 목록
// 옆에 기록과 도구와 함께 연다.

type Notice = (message: string) => void
type Filters = { q: string; role: string; state: string; tag: string }

const viewsKey = "uniconnect-admin-views"
const columnsKey = "uniconnect-admin-columns"

// 숨길 수 있는 열을 순서대로.
const optionalColumns = [
  { key: "type", label: "유형" },
  { key: "createdAt", label: "가입" },
  { key: "lastSeen", label: "마지막 접속" },
  { key: "events", label: "행사" },
  { key: "sent", label: "보낸 제안" },
  { key: "sponsorships", label: "협찬" },
  { key: "tags", label: "태그" },
] as const

type Column = (typeof optionalColumns)[number]["key"]

const seenAt = (row: AdminMember) => (row.lastSeen ? new Date(row.lastSeen).getTime() : 0)
const when = (value: string | number | undefined) => (value ? formatDateTime(new Date(value).toISOString()) : "—")

const stateTag = (row: AdminMember) =>
  row.suspendedAt ? (
    <em className="console-tag red">{t("정지됨")}</em>
  ) : row.demo ? (
    <em className="console-tag">{t("데모")}</em>
  ) : row.partnersUntil ? (
    <em className="console-tag blue">PARTNERS</em>
  ) : (
    <em className="console-tag">{t("활동")}</em>
  )

export function Members({
  token,
  memberId,
  query = "",
  onOpenMember,
  onNotice,
}: {
  token: string
  memberId?: string
  // 상단 바에 입력한 검색어.
  query?: string
  onOpenMember: (id?: string) => void
  onNotice: Notice
}) {
  const [filters, setFilters] = useState<Filters>({ q: query, role: "", state: "", tag: "" })
  const [rows, setRows] = useState<AdminMember[]>()
  const [open, setOpen] = useState<AdminMemberDetail>()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulkTag, setBulkTag] = useState("")
  const [reload, setReload] = useState(0)
  const [views, setViews] = useState(() => readStored<{ name: string; filters: Filters }[]>(viewsKey, []))
  const [columns, setColumns] = useState(() => new Set(readStored<Column[]>(columnsKey, ["type", "createdAt", "lastSeen", "events", "sent", "tags"])))
  const [choosing, setChoosing] = useState(false)
  // 회원 여러 명을 정지시킬 때는 실행 전에 한 번 더 묻는다.
  const [sureBulk, setSureBulk] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      api.adminAccounts(token, filters).then(
        (result) => {
          if (!cancelled) setRows(result.accounts)
        },
        (error: unknown) => onNotice(errorMessage(error)),
      )
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [token, filters, onNotice, reload])

  const load = useCallback(
    (id: string) =>
      api.adminAccount(token, id).then(
        (result) => setOpen(result.account),
        (error: unknown) => onNotice(errorMessage(error)),
      ),
    [token, onNotice],
  )

  // 주소에 든 회원. 바뀌면 다시 읽는다.
  useEffect(() => {
    if (memberId) void load(memberId)
    else setOpen(undefined)
  }, [memberId, load])

  const show = (id: string) => (id === memberId ? load(id) : Promise.resolve(onOpenMember(id)))
  const table = useTable(rows ?? [], {
    name: (row) => row.name,
    createdAt: (row) => row.createdAt,
    lastSeen: seenAt,
    events: (row) => row.events,
    sent: (row) => row.sent,
    sponsorships: (row) => row.sponsorships,
  })
  const pageIds = table.page.map((row) => row.id)
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id))
  const knownTags = [...new Set((rows ?? []).flatMap((row) => row.tags))].sort()

  // 열린 회원에게 변경이 있으면 그 행도 갱신한다.
  const changed = (account: AdminMemberDetail, message: string) => {
    setOpen(account)
    setReload((count) => count + 1)
    onNotice(message)
  }
  const bulk = (action: "suspend" | "logout" | "tag" | "untag") =>
    void api.adminBulk(token, { ids: [...picked], action, ...(action === "tag" || action === "untag" ? { tag: bulkTag } : {}) }).then(
      (result) => {
        onNotice(t("{count}명에게 적용했어요.", { count: result.done }))
        setPicked(new Set())
        setReload((count) => count + 1)
        if (open) void load(open.id)
      },
      (error: unknown) => onNotice(errorMessage(error)),
    )
  const toggleColumn = (key: Column) => {
    const next = new Set(columns)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setColumns(next)
    writeStored(columnsKey, [...next])
  }
  const csvRows = (list: AdminMember[]) => [
    [t("이름"), t("이메일"), t("유형"), t("종류"), t("학교"), t("가입"), t("마지막 접속"), t("행사"), t("보낸 제안"), t("협찬"), t("태그"), t("상태")],
    ...list.map((row) => [
      row.name,
      row.email,
      t(row.role),
      t(row.type),
      row.school,
      row.createdAt,
      row.lastSeen ? new Date(row.lastSeen).toISOString() : "",
      row.events,
      row.sent,
      row.sponsorships,
      row.tags.join(" "),
      row.suspendedAt ? t("정지됨") : row.demo ? t("데모") : row.partnersUntil ? "PARTNERS" : t("활동"),
    ]),
  ]

  return (
    <div className={open ? "console-split open" : "console-split"}>
      <section className="console-card">
        <div className="console-filters">
          <input
            aria-label={t("이름 · 이메일 · 학교로 찾기")}
            onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            placeholder={t("이름 · 이메일 · 학교로 찾기")}
            value={filters.q}
          />
          <select aria-label={t("회원 유형")} onChange={(event) => setFilters({ ...filters, role: event.target.value })} value={filters.role}>
            <option value="">{t("모든 유형")}</option>
            <option value="학생단체">{t("학생단체")}</option>
            <option value="브랜드">{t("브랜드")}</option>
          </select>
          <select aria-label={t("상태")} onChange={(event) => setFilters({ ...filters, state: event.target.value })} value={filters.state}>
            <option value="">{t("모든 상태")}</option>
            <option value="partners">{t("캠퍼스 파트너스")}</option>
            <option value="suspended">{t("정지됨")}</option>
            <option value="demo">{t("데모 계정")}</option>
            <option value="dormant30">{t("30일 넘게 미접속")}</option>
            <option value="dormant60">{t("60일 넘게 미접속")}</option>
            <option value="dormant90">{t("90일 넘게 미접속")}</option>
            <option value="duplicates">{t("중복 의심")}</option>
          </select>
          <select aria-label={t("태그")} onChange={(event) => setFilters({ ...filters, tag: event.target.value })} value={filters.tag}>
            <option value="">{t("모든 태그")}</option>
            {knownTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        <div className="console-filters">
          <select
            aria-label={t("저장한 보기")}
            onChange={(event) => {
              const view = views.find((item) => item.name === event.target.value)
              if (view) setFilters(view.filters)
            }}
            value=""
          >
            <option value="">{t("저장한 보기 {count}", { count: views.length })}</option>
            {views.map((view) => (
              <option key={view.name} value={view.name}>
                {view.name}
              </option>
            ))}
          </select>
          <button
            className="console-text-button"
            onClick={() => {
              const name =
                [filters.q, filters.role && t(filters.role), filters.state && t(filters.state), filters.tag].filter(Boolean).join(" · ") || t("전체")
              const next = [...views.filter((item) => item.name !== name), { name, filters }]
              setViews(next)
              writeStored(viewsKey, next)
              onNotice(t("'{name}' 보기를 저장했어요.", { name }))
            }}
            type="button"
          >
            {t("지금 필터 저장")}
          </button>
          {views.length > 0 && (
            <button
              className="console-text-button"
              onClick={() => {
                setViews([])
                writeStored(viewsKey, [])
              }}
              type="button"
            >
              {t("보기 비우기")}
            </button>
          )}
          <button aria-expanded={choosing} className="console-text-button" onClick={() => setChoosing(!choosing)} type="button">
            {t("열 고르기")}
          </button>
          <CsvButton name="members" rows={() => csvRows(table.sorted)} />
        </div>
        {choosing && (
          <div className="console-columns">
            {optionalColumns.map((column) => (
              <label className="console-check" key={column.key}>
                <input checked={columns.has(column.key)} onChange={() => toggleColumn(column.key)} type="checkbox" />
                {t(column.label)}
              </label>
            ))}
          </div>
        )}
        {picked.size > 0 && (
          <div className="console-bulk" role="region" aria-label={t("고른 회원에게")}>
            <strong>{t("{count}명 고름", { count: picked.size })}</strong>
            <button className="console-text-button" onClick={() => bulk("logout")} type="button">
              {t("로그아웃")}
            </button>
            {sureBulk ? (
              <button
                className="console-text-button danger"
                onClick={() => {
                  setSureBulk(false)
                  bulk("suspend")
                }}
                type="button"
              >
                {t("{count}명 정지 확인", { count: picked.size })}
              </button>
            ) : (
              <button className="console-text-button danger" onClick={() => setSureBulk(true)} type="button">
                {t("정지")}
              </button>
            )}
            <input aria-label={t("붙일 태그")} maxLength={20} onChange={(event) => setBulkTag(event.target.value)} placeholder={t("태그")} value={bulkTag} />
            <button className="console-text-button" disabled={!bulkTag.trim()} onClick={() => bulk("tag")} type="button">
              {t("태그 붙이기")}
            </button>
            <button className="console-text-button" disabled={!bulkTag.trim()} onClick={() => bulk("untag")} type="button">
              {t("태그 떼기")}
            </button>
            <CsvButton name="members-picked" rows={() => csvRows((rows ?? []).filter((row) => picked.has(row.id)))} />
            <button className="console-inline" onClick={() => setPicked(new Set())} type="button">
              {t("고르기 취소")}
            </button>
          </div>
        )}
        {!rows ? (
          <p className="field-hint">{t("불러오고 있어요…")}</p>
        ) : (
          <table className="console-table">
            <thead>
              <tr>
                <th className="console-pick" scope="col">
                  <input
                    aria-label={t("이 쪽 모두 고르기")}
                    checked={allPicked}
                    onChange={() => {
                      const next = new Set(picked)
                      for (const id of pageIds) {
                        if (allPicked) next.delete(id)
                        else next.add(id)
                      }
                      setPicked(next)
                    }}
                    type="checkbox"
                  />
                </th>
                <SortHeader label={t("회원")} sortKey="name" table={table} />
                {columns.has("type") && <th scope="col">{t("유형")}</th>}
                {columns.has("createdAt") && <SortHeader label={t("가입")} sortKey="createdAt" table={table} />}
                {columns.has("lastSeen") && <SortHeader label={t("마지막 접속")} sortKey="lastSeen" table={table} />}
                {columns.has("events") && <SortHeader label={t("행사")} sortKey="events" table={table} />}
                {columns.has("sent") && <SortHeader label={t("보낸 제안")} sortKey="sent" table={table} />}
                {columns.has("sponsorships") && <SortHeader label={t("협찬")} sortKey="sponsorships" table={table} />}
                {columns.has("tags") && <th scope="col">{t("태그")}</th>}
                <th scope="col">{t("상태")}</th>
              </tr>
            </thead>
            <tbody>
              {table.page.map((row) => (
                <tr className={open?.id === row.id ? "selected" : undefined} key={row.id} onClick={() => void show(row.id)}>
                  <td className="console-pick" onClick={(event) => event.stopPropagation()}>
                    <input
                      aria-label={t("{name} 고르기", { name: row.name })}
                      checked={picked.has(row.id)}
                      onChange={() => {
                        const next = new Set(picked)
                        if (next.has(row.id)) next.delete(row.id)
                        else next.add(row.id)
                        setPicked(next)
                      }}
                      type="checkbox"
                    />
                  </td>
                  <th scope="row">
                    <button className="console-link" onClick={() => void show(row.id)} type="button">
                      {row.name}
                    </button>
                    <small>{row.email}</small>
                  </th>
                  {columns.has("type") && (
                    <td>
                      {t(row.role)}
                      <small>{t(row.type)}</small>
                    </td>
                  )}
                  {columns.has("createdAt") && <td>{row.createdAt.slice(0, 10)}</td>}
                  {columns.has("lastSeen") && <td>{row.lastSeen ? new Date(row.lastSeen).toISOString().slice(0, 10) : "—"}</td>}
                  {columns.has("events") && <td>{row.events}</td>}
                  {columns.has("sent") && <td>{row.sent}</td>}
                  {columns.has("sponsorships") && <td>{row.sponsorships}</td>}
                  {columns.has("tags") && (
                    <td>
                      {row.tags.map((tag) => (
                        <em className="console-tag" key={tag}>
                          {tag}
                        </em>
                      ))}
                      {row.duplicate && <em className="console-tag red">{t("중복 의심")}</em>}
                    </td>
                  )}
                  <td>{stateTag(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows && <Pager table={table} unit={t("명")} />}
      </section>
      {open && <MemberDetail member={open} onChanged={changed} onClose={() => onOpenMember(undefined)} onNotice={onNotice} onOpenMember={(id) => void show(id)} token={token} />}
    </div>
  )
}

// 목록 옆의 회원 한 명: 사실 정보, 운영자의 메모와 태그, 도구(로그아웃, 사업자
// 확인, Campus Partners, 정지), 기록, 그리고 활동 타임라인.
function MemberDetail({
  token,
  member: open,
  onClose,
  onChanged,
  onNotice,
  onOpenMember,
}: {
  token: string
  member: AdminMemberDetail
  onClose: () => void
  onChanged: (account: AdminMemberDetail, message: string) => void
  onNotice: Notice
  onOpenMember: (id: string) => void
}) {
  const [tagDraft, setTagDraft] = useState("")
  const [number, setNumber] = useState(open.businessNumber ?? "")
  const [days, setDays] = useState(30)
  const [allTimeline, setAllTimeline] = useState(false)
  const [sureStop, setSureStop] = useState(false)
  useEffect(() => setSureStop(false), [open.id])
  useEffect(() => setNumber(open.businessNumber ?? ""), [open.id, open.businessNumber])
  const act = (work: Promise<{ account: AdminMemberDetail }>, message: string) =>
    void work.then(
      (result) => onChanged(result.account, message),
      (error: unknown) => onNotice(errorMessage(error)),
    )
  const saveTags = (tags: string[]) => act(api.adminTags(token, open.id, tags), t("태그를 바꿨어요."))
  return (
    <aside aria-label={open.name} className="console-card console-detail">
      <header>
        <div>
          <strong>{open.name}</strong>
          <small>
            {t(open.role)} · {t(open.type)} {open.school && `· ${open.school}`}
          </small>
        </div>
        <button aria-label={t("닫기")} className="console-icon" onClick={onClose} type="button">
          <Icon name="close" size={16} />
        </button>
      </header>
      <dl className="console-facts">
        <div>
          <dt>{t("이메일")}</dt>
          <dd>
            {open.email}{" "}
            <button
              className="console-inline"
              onClick={() =>
                void navigator.clipboard.writeText(open.email).then(
                  () => onNotice(t("이메일을 복사했어요.")),
                  () => onNotice(open.email),
                )
              }
              type="button"
            >
              {t("복사")}
            </button>
          </dd>
        </div>
        {open.contact && (
          <div>
            <dt>{t("담당자")}</dt>
            <dd>
              {open.contact.name} · {t(open.contact.position)} · {open.contact.phone}
            </dd>
          </div>
        )}
        <div>
          <dt>{t("가입")}</dt>
          <dd>{when(open.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("마지막 접속")}</dt>
          <dd>{when(open.lastSeen)}</dd>
        </div>
        <div>
          <dt>{t("로그인한 기기")}</dt>
          <dd>{open.sessions}</dd>
        </div>
        <div>
          <dt>{t("소개")}</dt>
          <dd>{open.listed ? (open.paused ? t("숨기는 중") : t("공개 중")) : t("아직 없음")}</dd>
        </div>
        <div>
          <dt>{t("캠퍼스 파트너스")}</dt>
          <dd>{open.partnersUntil ? t("{date}까지", { date: open.partnersUntil }) : "—"}</dd>
        </div>
        <div>
          <dt>{t("문의 · 받은 신고")}</dt>
          <dd>
            {open.inquiries} · {open.reportsAbout}
          </dd>
        </div>
      </dl>

      {open.duplicates.length > 0 && (
        <div className="console-warnbox">
          <strong>{t("같은 연락처 · 사업자번호를 쓰는 계정")}</strong>
          {open.duplicates.map((item) => (
            <button className="console-inline" key={item.id} onClick={() => onOpenMember(item.id)} type="button">
              {item.name} · {item.by === "business" ? t("사업자번호") : t("전화번호")}
            </button>
          ))}
        </div>
      )}

      <NoteEditor member={open} onNotice={onNotice} onSaved={(account) => onChanged(account, t("메모를 저장했어요."))} token={token} />

      <div className="console-tags">
        <h3>{t("태그")}</h3>
        <div>
          {open.tags.map((tag) => (
            <button className="console-chip" key={tag} onClick={() => saveTags(open.tags.filter((item) => item !== tag))} type="button">
              {tag} <Icon name="close" size={12} />
            </button>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!tagDraft.trim()) return
              saveTags([...open.tags, tagDraft.trim()])
              setTagDraft("")
            }}
          >
            <input aria-label={t("새 태그")} maxLength={20} onChange={(event) => setTagDraft(event.target.value)} placeholder={t("+ 태그")} value={tagDraft} />
          </form>
        </div>
      </div>

      <h3>{t("운영 도구")}</h3>
      <div className="console-tools">
        <button className="console-text-button" disabled={open.sessions === 0} onClick={() => act(api.adminLogout(token, open.id), t("로그인한 기기를 모두 로그아웃했어요."))} type="button">
          {t("모든 기기 로그아웃")}
        </button>
        <span className="console-tool">
          <select aria-label={t("파트너스 기간")} onChange={(event) => setDays(Number(event.target.value))} value={days}>
            <option value={30}>{t("30일")}</option>
            <option value={90}>{t("90일")}</option>
            <option value={365}>{t("1년")}</option>
          </select>
          <button className="console-text-button" onClick={() => act(api.adminGrantPartners(token, open.id, days), t("캠퍼스 파트너스를 부여했어요."))} type="button">
            {t("파트너스 부여")}
          </button>
        </span>
        {open.role === "브랜드" && (
          <span className="console-tool">
            <input aria-label={t("사업자등록번호")} inputMode="numeric" maxLength={12} onChange={(event) => setNumber(event.target.value)} placeholder="000-00-00000" value={number} />
            {open.business ? (
              <button className="console-text-button" onClick={() => act(api.adminBusiness(token, open.id, { verified: false }), t("사업자 확인을 취소했어요."))} type="button">
                {t("사업자 확인 취소")}
              </button>
            ) : (
              <button className="console-text-button" onClick={() => act(api.adminBusiness(token, open.id, { verified: true, number }), t("사업자로 확인했어요."))} type="button">
                {t("사업자 확인")}
              </button>
            )}
          </span>
        )}
      </div>

      <h3>{t("행사 · 캠페인 {count}", { count: open.eventList.length })}</h3>
      <ul className="console-list">
        {open.eventList.map((event) => (
          <li key={event.id}>
            {event.name} <small>{event.date}</small>
          </li>
        ))}
      </ul>
      <h3>{t("결제 {count}", { count: open.payments.length })}</h3>
      <ul className="console-list">
        {open.payments.map((payment) => (
          <li key={payment.id}>
            {payment.orderName} · {fullWon(payment.amount)}{" "}
            <em>{t(payment.status === "paid" ? "결제 완료" : payment.status === "pending" ? "결제 대기" : "취소 · 환불")}</em>
          </li>
        ))}
      </ul>
      <h3>{t("타임라인")}</h3>
      <ol className="console-timeline">
        {(allTimeline ? open.timeline : open.timeline.slice(0, 8)).map((item, index) => (
          <li key={`${item.at}-${index}`}>
            <time>{when(item.at)}</time>
            <strong>{t(item.kind)}</strong>
            {item.text && <span>{item.text}</span>}
          </li>
        ))}
      </ol>
      {open.timeline.length > 8 && (
        <button className="console-inline" onClick={() => setAllTimeline(!allTimeline)} type="button">
          {allTimeline ? t("줄이기") : t("모두 보기 ({count})", { count: open.timeline.length })}
        </button>
      )}
      {!open.demo &&
        (open.suspendedAt ? (
          <button
            className="cancel-button"
            onClick={() =>
              void api.unsuspendAccount(token, open.id).then(
                () => api.adminAccount(token, open.id).then((result) => onChanged(result.account, t("{name}의 정지를 풀었어요.", { name: open.name }))),
                (error: unknown) => onNotice(errorMessage(error)),
              )
            }
            type="button"
          >
            {t("정지 풀기")}
          </button>
        ) : (
          <div className="admin-report-actions">
            {sureStop ? (
              <>
                <button
                  className="decline-button"
                  onClick={() => act(api.adminSuspend(token, open.id), t("{name}을 정지했어요. 로그인한 기기도 모두 로그아웃됐어요.", { name: open.name }))}
                  type="button"
                >
                  {t("정지할게요")}
                </button>
                <button className="cancel-button" onClick={() => setSureStop(false)} type="button">
                  {t("취소")}
                </button>
              </>
            ) : (
              <button className="decline-button" onClick={() => setSureStop(true)} type="button">
                {t("계정 정지")}
              </button>
            )}
          </div>
        ))}
    </aside>
  )
}
