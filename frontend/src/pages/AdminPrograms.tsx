import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { programSchoolLabels, programStatusLabels } from "../data/programs"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { AdminProgram, AdminProgramGroup, Program, ProgramCandidateDraft, ProgramStatus } from "../types"

type Notice = (message: string) => void

// 캠퍼스 캠페인(콘솔, #402): 브랜드의 요청서를 보고 견적을 쓰고, 결제한 캠페인에 후보 단체를
// 담고, 단계를 옮긴다. 후보는 그 브랜드가 단체 찾기에서 찾을 수 있는 회원 단체만 담긴다.
export function Programs({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [programs, setPrograms] = useState<AdminProgram[]>()
  const [open, setOpen] = useState<string>()
  const load = () =>
    api.adminPrograms(token).then(
      (result) => setPrograms(result.programs),
      (error: unknown) => onNotice(errorMessage(error)),
    )
  useEffect(() => {
    void load()
    // 토큰마다 한 번 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  // 바뀐 캠페인을 목록에 반영한다.
  const replace = (program: Partial<AdminProgram> & { id: string }) =>
    setPrograms((current) => current?.map((item) => (item.id === program.id ? { ...item, ...program } : item)))
  const selected = programs?.find((item) => item.id === open)

  return (
    <div className="console-grid">
      <section className="console-card wide">
        <div className="console-card-head">
          <div>
            <h2>{t("캠퍼스 캠페인")}</h2>
            <p>{t("요청서에 견적을 쓰고, 결제한 캠페인에 후보 단체를 담아요. 브랜드가 후보를 골라 제안을 보내요.")}</p>
          </div>
        </div>
        {!programs ? (
          <p className="field-hint">{t("불러오고 있어요…")}</p>
        ) : programs.length === 0 ? (
          <p className="day-empty">{t("아직 들어온 캠페인 요청이 없어요.")}</p>
        ) : (
          <table className="console-table">
            <thead>
              <tr>
                <th scope="col">{t("캠페인")}</th>
                <th scope="col">{t("브랜드")}</th>
                <th scope="col">{t("단계")}</th>
                <th scope="col">{t("학교")}</th>
                <th scope="col">{t("매출")}</th>
                <th scope="col">{t("남는 금액")}</th>
                <th scope="col">{t("요청일")}</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((program) => (
                <tr aria-selected={program.id === open} key={program.id} onClick={() => setOpen(program.id)}>
                  <th scope="row">
                    <button className="console-text-button" onClick={() => setOpen(program.id)} type="button">
                      {program.brief.name}
                    </button>
                  </th>
                  <td>{program.brandName}</td>
                  <td>
                    <em className="console-tag">{t(programStatusLabels[program.status])}</em>
                  </td>
                  <td>{t("{sent}/{want}곳", { sent: program.schools.filter((school) => school.state !== "후보").length, want: program.brief.schools })}</td>
                  <td>{fullWon(program.margin.revenue)}</td>
                  <td>{fullWon(program.margin.margin)}</td>
                  <td>{formatDateTime(program.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {selected && <ProgramPanel key={selected.id} onChange={replace} onNotice={onNotice} program={selected} token={token} />}
    </div>
  )
}

function ProgramPanel({ program, token, onNotice, onChange }: { program: AdminProgram; token: string; onNotice: Notice; onChange: (program: Partial<AdminProgram> & { id: string }) => void }) {
  const [busy, setBusy] = useState(false)
  const { brief, status } = program
  const run = async (work: () => Promise<{ program: Program }>, notice: string) => {
    setBusy(true)
    try {
      onChange((await work()).program)
      onNotice(notice)
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const move = (next: ProgramStatus) => {
    const reason = next === "취소" ? window.prompt(t("취소 사유를 적어 주세요. 브랜드에게 보여요.")) : ""
    if (reason === null) return
    void run(() => api.adminMoveProgram(token, program.id, next, reason), t("단계를 옮겼어요."))
  }
  const sourcing = status === "섭외 중" || status === "집행 중"

  return (
    <>
      <section className="console-card span-2" aria-label={t("요청서")}>
        <h2>{brief.name}</h2>
        <dl className="console-facts">
          <div>
            <dt>{t("브랜드")}</dt>
            <dd>{program.brandName}</dd>
          </div>
          <div>
            <dt>{t("제품")}</dt>
            <dd>{brief.product}</dd>
          </div>
          <div>
            <dt>{t("지역")}</dt>
            <dd>{brief.regions.length ? brief.regions.join(" · ") : t("어디든")}</dd>
          </div>
          <div>
            <dt>{t("기간")}</dt>
            <dd>{brief.from === brief.to ? brief.from : `${brief.from} – ${brief.to}`}</dd>
          </div>
          <div>
            <dt>{t("학교 수")}</dt>
            <dd>{t("{count}개 학교", { count: brief.schools })}</dd>
          </div>
          {brief.perSchool > 0 && (
            <div>
              <dt>{t("학교당 수량")}</dt>
              <dd>{brief.perSchool.toLocaleString()}</dd>
            </div>
          )}
          {brief.audience && (
            <div>
              <dt>{t("대상")}</dt>
              <dd>{brief.audience}</dd>
            </div>
          )}
          {brief.asks && (
            <div>
              <dt>{t("요청 사항")}</dt>
              <dd>{brief.asks}</dd>
            </div>
          )}
          {brief.budget !== undefined && (
            <div>
              <dt>{t("예산")}</dt>
              <dd>{fullWon(brief.budget)}</dd>
            </div>
          )}
          <div>
            <dt>{t("단계")}</dt>
            <dd>
              <em className="console-tag">{t(programStatusLabels[status])}</em>
            </dd>
          </div>
        </dl>
        {status !== "완료" && status !== "취소" && (
          <div className="console-program-actions">
            {status === "집행 중" && (
              <button className="console-text-button" disabled={busy} onClick={() => move("섭외 중")} type="button">
                {t("섭외 중으로")}
              </button>
            )}
            {status === "섭외 중" && (
              <button className="console-text-button" disabled={busy} onClick={() => move("집행 중")} type="button">
                {t("집행 중으로")}
              </button>
            )}
            {status === "집행 중" && (
              <button className="console-text-button" disabled={busy} onClick={() => move("완료")} type="button">
                {t("집행 완료로")}
              </button>
            )}
            <button className="console-text-button" disabled={busy} onClick={() => move("취소")} type="button">
              {t("캠페인 취소")}
            </button>
          </div>
        )}
      </section>

      {(status === "접수" || status === "견적") && <QuoteForm busy={busy} onSave={(body) => void run(() => api.adminQuoteProgram(token, program.id, body), t("견적을 보냈어요."))} program={program} />}

      <MarginForm
        busy={busy}
        onSave={(body) =>
          void run(
            () => api.adminProgramOps(token, program.id, body).then((result) => ({ program: { ...program, ops: result.ops, margin: result.margin } })),
            t("손익을 저장했어요."),
          )
        }
        program={program}
      />

      {sourcing && <Candidates busy={busy} onSave={(list) => void run(() => api.adminProgramCandidates(token, program.id, list), t("후보를 저장했어요."))} program={program} token={token} onNotice={onNotice} />}
    </>
  )
}

type QuoteBody = { fee: number; costs: { label: string; amount: number }[]; note?: string }

function QuoteForm({ program, busy, onSave }: { program: AdminProgram; busy: boolean; onSave: (body: QuoteBody) => void }) {
  const [fee, setFee] = useState(String(program.quote?.fee ?? ""))
  const [costs, setCosts] = useState(program.quote?.costs.map((cost) => ({ label: cost.label, amount: String(cost.amount) })) ?? [])
  const [note, setNote] = useState(program.quote?.note ?? "")
  const setCost = (index: number, key: "label" | "amount", value: string) =>
    setCosts((current) => current.map((cost, at) => (at === index ? { ...cost, [key]: value } : cost)))
  return (
    <section className="console-card span-2">
      <h2>{program.quote ? t("견적 고치기") : t("견적 쓰기")}</h2>
      <p className="field-hint">{t("운영비는 부가세 전 금액이에요. 실비는 브랜드가 직접 지급하고, 금액만 보여요.")}</p>
      <form
        className="console-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave({
            fee: Number(fee),
            costs: costs.filter((cost) => cost.label.trim()).map((cost) => ({ label: cost.label.trim(), amount: Number(cost.amount) || 0 })),
            ...(note.trim() ? { note: note.trim() } : {}),
          })
        }}
      >
        <label>
          {t("운영비 (원)")}
          <input inputMode="numeric" min={10000} onChange={(event) => setFee(event.target.value)} required type="number" value={fee} />
        </label>
        {costs.map((cost, index) => (
          <div className="console-form-row" key={index}>
            <label>
              {t("실비 항목")}
              <input maxLength={40} onChange={(event) => setCost(index, "label", event.target.value)} value={cost.label} />
            </label>
            <label>
              {t("금액 (원)")}
              <input inputMode="numeric" min={0} onChange={(event) => setCost(index, "amount", event.target.value)} type="number" value={cost.amount} />
            </label>
            <button className="console-text-button" onClick={() => setCosts((current) => current.filter((_, at) => at !== index))} type="button">
              {t("빼기")}
            </button>
          </div>
        ))}
        {costs.length < 10 && (
          <button className="console-text-button" onClick={() => setCosts((current) => [...current, { label: "", amount: "" }])} type="button">
            {t("실비 항목 더하기")}
          </button>
        )}
        <label>
          {t("메모 (브랜드에게 보여요)")}
          <textarea maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
        </label>
        <button className="primary-button" disabled={busy || !fee} type="submit">
          {t("견적 보내기")}
        </button>
      </form>
    </section>
  )
}

function Candidates({
  program,
  token,
  busy,
  onSave,
  onNotice,
}: {
  program: AdminProgram
  token: string
  busy: boolean
  onSave: (list: ProgramCandidateDraft[]) => void
  onNotice: Notice
}) {
  const [list, setList] = useState<(ProgramCandidateDraft & { name: string })[]>(() =>
    program.schools.map((school) => ({ groupId: school.groupId, name: `${school.name} · ${school.school}`, ...(school.event ? { eventId: school.event.id } : {}), ...(school.note ? { note: school.note } : {}) })),
  )
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<AdminProgramGroup[]>()
  const states = new Map(program.schools.map((school) => [school.groupId, school.state]))
  const search = () =>
    api.adminProgramGroups(token, program.id, query.trim()).then(
      (result) => setFound(result.groups),
      (error: unknown) => onNotice(errorMessage(error)),
    )
  const add = (group: AdminProgramGroup) =>
    setList((current) =>
      current.some((item) => item.groupId === group.id)
        ? current
        : [...current, { groupId: group.id, name: `${group.name} · ${group.school}`, ...(group.events[0] ? { eventId: group.events[0].id } : {}) }],
    )
  const update = (groupId: string, patch: Partial<ProgramCandidateDraft>) =>
    setList((current) => current.map((item) => (item.groupId === groupId ? { ...item, ...patch } : item)))

  return (
    <section className="console-card wide" aria-label={t("후보 단체")}>
      <h2>{t("후보 단체 {count}곳", { count: list.length })}</h2>
      <p className="field-hint">{t("저장하면 새 후보가 생겼을 때 브랜드에게 메일이 가요. 제안을 보낸 단체는 빼도 진행 상태가 남아요.")}</p>
      {list.length > 0 && (
        <ul className="console-list console-program-list">
          {list.map((item) => {
            const state = states.get(item.groupId)
            return (
              <li key={item.groupId}>
                {item.name}
                {state && <em className="console-tag">{t(programSchoolLabels[state])}</em>}
                <input
                  aria-label={t("{name} 메모", { name: item.name })}
                  maxLength={100}
                  onChange={(event) => update(item.groupId, { note: event.target.value })}
                  placeholder={t("브랜드에게 남길 한 줄")}
                  value={item.note ?? ""}
                />
                <button className="console-inline" onClick={() => setList((current) => current.filter((entry) => entry.groupId !== item.groupId))} type="button">
                  {t("빼기")}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button
        className="primary-button"
        disabled={busy}
        onClick={() => onSave(list.map(({ groupId, eventId, note }) => ({ groupId, ...(eventId ? { eventId } : {}), ...(note?.trim() ? { note: note.trim() } : {}) })))}
        type="button"
      >
        {t("후보 저장")}
      </button>

      <form
        className="console-program-search"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
        role="search"
      >
        <input aria-label={t("단체 찾기")} onChange={(event) => setQuery(event.target.value)} placeholder={t("단체 이름이나 학교")} value={query} />
        <button className="console-text-button" type="submit">
          {t("찾기")}
        </button>
      </form>
      {found &&
        (found.length === 0 ? (
          <p className="day-empty">{t("이 브랜드가 찾을 수 있는 단체가 없어요.")}</p>
        ) : (
          <ul className="console-list console-program-list">
            {found.map((group) => {
              const added = list.find((item) => item.groupId === group.id)
              return (
                <li key={group.id}>
                  {group.name} <small>{group.school}</small>
                  {group.events.length > 0 && (
                    <select
                      aria-label={t("{name}의 행사", { name: group.name })}
                      disabled={!added}
                      onChange={(event) => update(group.id, { eventId: event.target.value || undefined })}
                      value={added?.eventId ?? group.events[0].id}
                    >
                      {group.events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name} · {event.date} · {event.people}
                        </option>
                      ))}
                      <option value="">{t("행사 정하지 않음")}</option>
                    </select>
                  )}
                  <button className="console-inline" disabled={Boolean(added)} onClick={() => add(group)} type="button">
                    {added ? t("담김") : t("담기")}
                  </button>
                </li>
              )
            })}
          </ul>
        ))}
    </section>
  )
}

// 캠페인의 손익(#404): 운영자가 실제 직접비와 운영 시간을 적으면 결제된 운영비에서 빼
// 남는 금액과 시간당 금액을 본다. 브랜드에게는 보이지 않는다.
function MarginForm({ program, busy, onSave }: { program: AdminProgram; busy: boolean; onSave: (body: { directCost: number; hours: number; note?: string }) => void }) {
  const [directCost, setDirectCost] = useState(String(program.ops?.directCost ?? ""))
  const [hours, setHours] = useState(String(program.ops?.hours ?? ""))
  const [note, setNote] = useState(program.ops?.note ?? "")
  const { margin } = program
  return (
    <section className="console-card span-2" aria-label={t("손익")}>
      <h2>{t("손익")}</h2>
      <dl className="console-facts">
        <div>
          <dt>{t("매출 (운영비, 부가세 전)")}</dt>
          <dd>{fullWon(margin.revenue)}</dd>
        </div>
        <div>
          <dt>{t("직접비")}</dt>
          <dd>{fullWon(margin.directCost)}</dd>
        </div>
        <div>
          <dt>{t("남는 금액")}</dt>
          <dd>{fullWon(margin.margin)}</dd>
        </div>
        <div>
          <dt>{t("시간당 남는 금액")}</dt>
          <dd>{margin.perHour === null ? "—" : t("{amount} ({hours}시간)", { amount: fullWon(margin.perHour), hours: margin.hours })}</dd>
        </div>
      </dl>
      <p className="field-hint">{t("실비는 브랜드가 직접 내서 매출에도 직접비에도 넣지 않아요. 환불되면 매출은 0이에요.")}</p>
      <form
        className="console-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave({ directCost: Number(directCost) || 0, hours: Number(hours) || 0, ...(note.trim() ? { note: note.trim() } : {}) })
        }}
      >
        <div className="console-form-row">
          <label>
            {t("실제 직접비 (원)")}
            <input inputMode="numeric" min={0} onChange={(event) => setDirectCost(event.target.value)} type="number" value={directCost} />
          </label>
          <label>
            {t("운영 시간")}
            <input inputMode="decimal" min={0} onChange={(event) => setHours(event.target.value)} step={0.5} type="number" value={hours} />
          </label>
        </div>
        <label>
          {t("메모 (운영자만 봐요)")}
          <textarea maxLength={300} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          {t("손익 저장")}
        </button>
      </form>
    </section>
  )
}
