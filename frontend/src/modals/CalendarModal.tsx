import { useState } from "react"

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

// 캘린더에 추가, laid out like the phone's share sheet, which a page can't
// fill with calendar apps itself (Chrome won't share a calendar file, and
// iPhone's sheet offers no calendar for one): the coming dates, each picked
// or not, then the calendar apps as icons, the one picked last first, then
// the actions. Google Calendar and Outlook open a date's add page in a new
// tab or their app, one at a time when several are picked; Apple Calendar
// and the other apps open the calendar file with the picked dates, where
// the app asks to add them.
export function CalendarModal({
  entries,
  onClose,
  onNotice,
}: {
  entries: CalendarEntry[]
  onClose: () => void
  onNotice?: (message: string) => void
}) {
  const [picked, setPicked] = useState(() => new Set(entries.map((entry) => entry.id)))
  // Google Calendar or Outlook, while the picked dates wait to open one by one.
  const [opening, setOpening] = useState<CalendarApp | null>(null)
  // Read once, so the icons keep their places while the sheet is open.
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
        ? t("캘린더 파일을 열면 Apple 캘린더가 열리고, 거기서 일정을 추가할 수 있어요.")
        : t("캘린더 파일을 열면 쓰는 캘린더 앱이 열리고, 거기서 일정을 추가할 수 있어요."),
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
                {/* One date picked: its add page opens at once, as a link. */}
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
      </div>
    </Modal>
  )
}
