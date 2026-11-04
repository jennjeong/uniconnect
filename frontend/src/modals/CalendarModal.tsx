import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import {
  calendarApps,
  googleCalendarLink,
  lastCalendarApp,
  opensEach,
  outlookCalendarLink,
  rememberCalendarApp,
  type CalendarApp,
} from "../lib/calendarApps"
import { calendarPage, formatPeriod, todayIso } from "../lib/date"
import { saveFile } from "../lib/download"
import { calendarFile, type CalendarEntry } from "../lib/ics"

const appLink = (app: CalendarApp, entry: CalendarEntry) =>
  app === "google" ? googleCalendarLink(entry) : outlookCalendarLink(entry)

const appLabel = (app: CalendarApp) => t(calendarApps.find((item) => item.id === app)?.label ?? app)

// 캘린더에 추가. 휴대폰의 공유 시트처럼 짠다. 페이지가 그 시트를 캘린더 앱으로
// 채울 수 없기 때문이다(Chrome은 캘린더 파일을 공유하지 않고, iPhone의 시트는
// 캘린더 파일에 캘린더 앱을 내놓지 않는다). 다가오는 날짜를 골랐는지 여부와
// 함께 보여 주고, 이어서 마지막에 고른 것을 맨 앞에 둔 캘린더 앱 아이콘, 그리고
// 동작이 나온다. 구글 캘린더와 아웃룩은 날짜의 추가 페이지를 새 탭이나 앱에서
// 열고, 여럿을 고르면 하나씩 연다. 애플 캘린더와 나머지 앱은 고른 날짜의 캘린더
// 파일을 열어 앱이 추가를 묻게 한다.
export function CalendarModal({
  entries,
  subscribe = false,
  onClose,
  onNotice,
}: {
  entries: CalendarEntry[]
  // 끝에 두는 회원 자신의 구독 링크(데모 계정에는 없다).
  subscribe?: boolean
  onClose: () => void
  onNotice?: (message: string) => void
}) {
  const [picked, setPicked] = useState(() => new Set(entries.map((entry) => entry.id)))
  // 구글 캘린더나 아웃룩. 고른 날짜가 하나씩 열리기를 기다리는 동안.
  const [opening, setOpening] = useState<CalendarApp | null>(null)
  // 한 번만 읽어서 시트가 열려 있는 동안 아이콘 자리가 바뀌지 않는다.
  const [last] = useState(lastCalendarApp)
  const chosen = entries.filter((entry) => picked.has(entry.id))
  const cover = calendarPage((chosen[0] ?? entries[0]).date)
  const today = calendarPage(todayIso())
  const apps = [...calendarApps].sort((a, b) => Number(b.id === last) - Number(a.id === last))

  const pick = (ids: string[]) => {
    setPicked(new Set(ids))
    setOpening(null)
  }
  const toggle = (id: string) =>
    pick(picked.has(id) ? [...picked].filter((item) => item !== id) : [...picked, id])

  const saveCalendar = (notice: string) => {
    saveFile(`uniconnect-${todayIso()}.ics`, calendarFile(chosen, t("uniconnect 행사 일정")), "text/calendar;charset=utf-8")
    onNotice?.(notice)
    onClose()
  }

  const choose = (app: CalendarApp) => {
    rememberCalendarApp(app)
    if (opensEach(app)) {
      setOpening(app)
      return
    }
    saveCalendar(
      app === "apple"
        ? t("캘린더 파일을 열면 Apple 캘린더가 열리고 거기서 일정을 추가할 수 있어요.")
        : t("캘린더 파일을 열면 쓰는 캘린더 앱이 열리고 거기서 일정을 추가할 수 있어요."),
    )
  }

  const copy = async () => {
    const text = chosen.map((entry) => `${entry.title} · ${formatPeriod(entry.date, entry.endDate)}`).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      onNotice?.(t("일정을 복사했어요."))
    } catch {
      onNotice?.(t("일정을 복사하지 못했어요."))
    }
  }

  return (
    <Modal kicker="Calendar" name="calendar" onClose={onClose} title={t("캘린더에 추가")}>
      <div className="share-sheet">
        <div className="share-head">
          <span aria-hidden="true" className="share-page">
            <small>{cover.month}</small>
            <strong>{cover.day}</strong>
          </span>
          <div>
            <strong>{t("일정 {count}개 선택됨", { count: chosen.length })}</strong>
            {chosen.length < entries.length && (
              <button className="share-pill" onClick={() => pick(entries.map((entry) => entry.id))} type="button">
                {t("모두 고르기")}
              </button>
            )}
          </div>
        </div>

        <ul aria-label={t("넣을 일정")} className="share-dates">
          {entries.map((entry) => {
            const page = calendarPage(entry.date)
            const on = picked.has(entry.id)
            return (
              <li key={entry.id}>
                <button
                  aria-pressed={on}
                  className={on ? "share-date picked" : "share-date"}
                  onClick={() => toggle(entry.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="share-page">
                    <small>{page.month}</small>
                    <strong>{page.day}</strong>
                  </span>
                  <strong>{entry.title}</strong>
                  <small>{formatPeriod(entry.date, entry.endDate)}</small>
                  <span aria-hidden="true" className="share-check">
                    {on && <Icon name="check" size={13} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <ul aria-label={t("캘린더 앱")} className="share-apps">
          {apps.map((app) => {
            const icon = (
              <span aria-hidden="true" className={`share-app-icon app-${app.id}`}>
                {app.id === "other" ? (
                  <Icon name="more" size={30} />
                ) : (
                  <>
                    <small>{today.weekday}</small>
                    <strong>{today.day}</strong>
                  </>
                )}
              </span>
            )
            return (
              <li key={app.id}>
                {/* 날짜 하나를 고르면 그 추가 페이지가 링크로 바로 열린다. */}
                {opensEach(app.id) && chosen.length === 1 ? (
                  <a
                    className="share-app"
                    href={appLink(app.id, chosen[0])}
                    onClick={() => {
                      rememberCalendarApp(app.id)
                      onClose()
                    }}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {icon}
                    <span>{t(app.label)}</span>
                  </a>
                ) : (
                  <button
                    aria-expanded={opensEach(app.id) ? opening === app.id : undefined}
                    className={opening === app.id ? "share-app active" : "share-app"}
                    disabled={chosen.length === 0}
                    onClick={() => choose(app.id)}
                    type="button"
                  >
                    {icon}
                    <span>{t(app.label)}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {!opening && (
          <p className="field-hint">
            {chosen.length === 0
              ? t("넣을 일정을 하나 이상 골라 주세요.")
              : t("Google 캘린더와 Outlook은 일정 추가 화면이, Apple 캘린더와 다른 앱은 캘린더 파일이 열려요.")}
          </p>
        )}

        {opening ? (
          <div className="share-each">
            <p className="field-hint">
              {t("일정을 하나씩 열어요. {app}의 일정 추가 화면이 새 창이나 앱으로 열려요.", { app: appLabel(opening) })}
            </p>
            <ul className="calendar-entries">
              {chosen.map((entry) => (
                <li key={entry.id}>
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{formatPeriod(entry.date, entry.endDate)}</small>
                  </span>
                  <a
                    aria-label={t("{title} {app}에서 열기", { title: entry.title, app: appLabel(opening) })}
                    className="primary-button"
                    href={appLink(opening, entry)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("열기")}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="share-actions">
            <li>
              <button disabled={chosen.length === 0} onClick={() => void copy()} type="button">
                <Icon name="copy" size={20} />
                {t("일정 복사")}
              </button>
            </li>
            <li>
              <button
                disabled={chosen.length === 0}
                onClick={() => saveCalendar(t("캘린더 파일을 저장했어요. 쓰는 캘린더 앱에서 가져올 수 있어요."))}
                type="button"
              >
                <Icon name="download" size={20} />
                {t("캘린더 파일로 저장")}
              </button>
            </li>
          </ul>
        )}
        {subscribe && <CalendarSubscription onNotice={onNotice} />}
      </div>
    </Modal>
  )
}

// 구독 링크: 캘린더 앱이 구독하는 비공개 주소로, 새 날짜와 바뀐 날짜가 저절로
// 들어온다(backend routes/calendar.ts). 요청하면 만들고 나중에 다시 보여 준다.
// 유출되면 새로 요청해 바꾸는데, 이미 구독한 캘린더가 멈추므로 두 번 확인을
// 요청한다.
function CalendarSubscription({ onNotice }: { onNotice?: (message: string) => void }) {
  // 불러오는 동안은 undefined, 만들어지기 전에는 null.
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [replacing, setReplacing] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.calendarFeed().then(
      (result) => {
        if (!cancelled) setUrl(result.url)
      },
      () => {
        if (!cancelled) setUrl(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const change = async (make: boolean) => {
    setBusy(true)
    try {
      if (make) setUrl((await api.createCalendarFeed()).url)
      else {
        await api.deleteCalendarFeed()
        setUrl(null)
        onNotice?.(t("구독 링크를 지웠어요. 구독한 캘린더에 더는 일정이 들어가지 않아요."))
      }
      setReplacing(false)
    } catch (error) {
      onNotice?.(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      onNotice?.(t("구독 링크를 복사했어요."))
    } catch {
      onNotice?.(t("구독 링크를 복사하지 못했어요."))
    }
  }

  if (url === undefined) return null
  const webcal = url?.replace(/^https?:/, "webcal:")
  return (
    <section aria-labelledby="calendar-subscribe-title" className="share-subscribe">
      <strong id="calendar-subscribe-title">{t("구독 링크")}</strong>
      <p className="field-hint">{t("캘린더 앱에서 구독하면 새 일정과 바뀐 일정이 저절로 들어가요.")}</p>
      {url && webcal ? (
        <>
          <input
            aria-label={t("구독 링크 주소")}
            className="share-subscribe-url"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={url}
          />
          <div className="share-subscribe-actions">
            <button className="cancel-button" onClick={() => void copy(url)} type="button">
              <Icon name="copy" size={15} /> {t("링크 복사")}
            </button>
            <a
              className="cancel-button"
              href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("Google 캘린더에서 구독")}
            </a>
            <a className="cancel-button" href={webcal}>
              {t("Apple · Outlook에서 구독")}
            </a>
          </div>
          {replacing ? (
            <div className="share-subscribe-confirm" role="group" aria-label={t("새 링크로 바꾸기")}>
              <p className="field-hint">{t("새 링크로 바꿀까요? 이미 구독한 캘린더는 새 링크로 다시 구독해야 해요.")}</p>
              <div className="share-subscribe-actions">
                <button className="cancel-button" onClick={() => setReplacing(false)} type="button">
                  {t("취소")}
                </button>
                <button className="primary-button" disabled={busy} onClick={() => void change(true)} type="button">
                  {t("새 링크 만들기")}
                </button>
              </div>
            </div>
          ) : (
            <p className="field-hint">
              {t("링크를 아는 사람은 내 일정을 볼 수 있어요. 새 링크로 바꾸면 예전 링크는 바로 막혀요.")}{" "}
              <button className="subtle-link" onClick={() => setReplacing(true)} type="button">
                {t("새 링크로 바꾸기")}
              </button>{" "}
              <button className="subtle-link" disabled={busy} onClick={() => void change(false)} type="button">
                {t("링크 지우기")}
              </button>
            </p>
          )}
        </>
      ) : (
        <button className="primary-button" disabled={busy} onClick={() => void change(true)} type="button">
          {t("구독 링크 만들기")}
        </button>
      )}
    </section>
  )
}
