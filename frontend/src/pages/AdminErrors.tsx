import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { TabBar } from "../components/TabBar"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import type { ErrorEntry, ErrorGroup } from "../types"

type Notice = (message: string) => void
type Tab = "open" | "handled" | "raw"

// 콘솔의 오류 목록(#315의 묶음, backend lib/errorLog.ts): 같은 오류를 처음·최근 발생, 횟수,
// 배포와 함께 하나로 보이고, 운영자가 확인함으로 둔다. 확인한 뒤 다시 나면 '다시 남'이다.
// 지금 배포에서 난 것과 이전 배포에서만 난 것을 나눠, 과거 기록을 지금의 장애로 보이지 않게 한다.
export function ErrorsPanel({ token, onNotice }: { token: string; onNotice: Notice }) {
  const [data, setData] = useState<{ errors: ErrorEntry[]; groups: ErrorGroup[]; deploy: string | null }>()
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<Tab>("open")
  const [busy, setBusy] = useState<string>()
  const load = () => {
    setFailed(false)
    api.adminErrors(token).then(
      (result) => setData({ errors: result.errors, groups: result.groups ?? [], deploy: result.deploy ?? null }),
      (error: unknown) => {
        setFailed(true)
        onNotice(errorMessage(error))
      },
    )
  }
  useEffect(load, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed && !data) {
    return (
      <section className="console-card">
        <p role="alert">{t("오류 목록을 불러오지 못했어요.")}</p>
        <button className="cancel-button" onClick={load} type="button">
          {t("다시 시도")}
        </button>
      </section>
    )
  }
  if (!data) return <p className="field-hint">{t("불러오고 있어요…")}</p>

  const open = data.groups.filter((group) => group.state !== "handled")
  const handled = data.groups.filter((group) => group.state === "handled")
  const shown = tab === "open" ? open : handled
  const mark = async (group: ErrorGroup, value: boolean) => {
    setBusy(group.key)
    try {
      const { group: next } = await api.adminMarkErrorGroup(token, group.key, value)
      setData((current) => current && { ...current, groups: current.groups.map((item) => (item.key === group.key ? next : item)) })
      onNotice(value ? t("확인함으로 두었어요.") : t("다시 열었어요."))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="console-card">
      <div className="console-filters">
        <TabBar
          items={[
            { value: "open", label: <>{t("확인할 오류")}<em>{open.length}</em></> },
            { value: "handled", label: <>{t("확인함")}<em>{handled.length}</em></> },
            { value: "raw", label: <>{t("낱낱의 기록")}<em>{data.errors.length}</em></> },
          ]}
          label={t("오류 보기")}
          onChange={setTab}
          value={tab}
        />
      </div>
      <p className="field-hint">
        {data.deploy ? t("지금 배포: {deploy}", { deploy: data.deploy }) : t("배포 정보가 없는 서버예요(로컬 등).")}{" "}
        {t("같은 출처 · 메시지 · 위치는 한 묶음이에요. 이전 배포에서만 난 오류는 지금의 장애가 아닐 수 있어요.")}
      </p>
      {tab === "raw" ? (
        data.errors.length === 0 ? (
          <p className="day-empty">{t("기록된 오류가 없어요.")}</p>
        ) : (
          <div className="admin-list">
            {data.errors.slice(0, 100).map((entry) => (
              <article className="admin-card admin-error" key={entry.id}>
                <div className="admin-card-head">
                  <span className="admin-category">{entry.source === "server" ? t("서버") : t("화면")}</span>
                  <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                </div>
                <p className="admin-question">{entry.message}</p>
                <p className="admin-from">
                  {entry.where} · {entry.path}
                </p>
                {entry.stack && <pre className="admin-stack">{entry.stack}</pre>}
              </article>
            ))}
          </div>
        )
      ) : shown.length === 0 ? (
        <p className="day-empty">{tab === "open" ? t("확인할 오류가 없어요.") : t("확인한 오류가 없어요.")}</p>
      ) : (
        <div className="admin-list">
          {shown.map((group) => {
            const now = data.deploy !== null && group.lastDeploy === data.deploy
            return (
              <article className="admin-card admin-error" key={group.key}>
                <div className="admin-card-head">
                  <span className="admin-category">
                    {group.source === "server" ? t("서버") : t("화면")}
                    {group.state === "again" && <em className="console-tag red">{t("확인 뒤 다시 남")}</em>}
                  </span>
                  <span className="admin-card-meta">
                    <span className="console-badge down">{t("{count}번", { count: group.count })}</span>
                    <em className={now ? "console-tag red" : "console-tag"}>
                      {now ? t("지금 배포에서 남") : t("이전 배포 {deploy}", { deploy: group.lastDeploy ?? "—" })}
                    </em>
                  </span>
                </div>
                <p className="admin-question">{group.message}</p>
                <p className="admin-from">
                  {group.where} · {group.path}
                </p>
                <p className="admin-from">
                  {t("처음 {first} · 최근 {last}", { first: formatDateTime(group.firstAt), last: formatDateTime(group.lastAt) })}
                  {group.handledAt && ` · ${t("확인 {time}", { time: formatDateTime(group.handledAt) })}`}
                </p>
                {group.stack && (
                  <details>
                    <summary>{t("원문 보기")}</summary>
                    <pre className="admin-stack">{group.stack}</pre>
                  </details>
                )}
                <div className="admin-report-actions">
                  <button className="console-text-button" disabled={busy === group.key} onClick={() => void mark(group, group.state !== "handled")} type="button">
                    {group.state === "handled" ? t("다시 열기") : t("확인함으로 두기")}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
