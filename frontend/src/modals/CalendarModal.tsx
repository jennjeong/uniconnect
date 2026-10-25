import { useState } from "react"

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
import { formatFullDate, todayIso } from "../lib/date"
import { saveFile } from "../lib/download"
import { calendarFile, type CalendarEntry } from "../lib/ics"

// 캘린더에 추가: the calendar app first (the last one picked comes picked),
// then its way in. Google Calendar and Outlook open each entry's add page in
// a new tab or their app; Apple Calendar and the other apps open the
// calendar file with every entry, where the app asks to add them.
export function CalendarModal({
  entries,
  onClose,
  onNotice,
}: {
  entries: CalendarEntry[]
  onClose: () => void
  onNotice?: (message: string) => void
}) {
  const [app, setApp] = useState<CalendarApp | null>(lastCalendarApp)
  const picked = calendarApps.find((item) => item.id === app)

  const openFile = () => {
    saveFile(`uniconnect-${todayIso()}.ics`, calendarFile(entries, t("uniconnect 행사 일정")), "text/calendar;charset=utf-8")
    onNotice?.(
      app === "apple"
        ? t("캘린더 파일을 열면 Apple 캘린더가 열리고, 거기서 일정을 추가할 수 있어요.")
        : t("캘린더 파일을 열면 쓰는 캘린더 앱이 열리고, 거기서 일정을 추가할 수 있어요."),
    )
    onClose()
  }

  return (
    <Modal kicker="Calendar" name="calendar" onClose={onClose} title={t("캘린더에 추가")}>
      <div className="calendar-modal">
        <p className="auth-lead">{t("어떤 캘린더 앱을 쓰세요? 고른 앱이 열리고, 거기서 일정을 추가할 수 있어요.")}</p>
        <div aria-label={t("캘린더 앱")} className="calendar-app-list" role="radiogroup">
          {calendarApps.map((item) => (
            <label className={app === item.id ? "role-option active" : "role-option"} key={item.id}>
              <input
                checked={app === item.id}
                name="calendar-app"
                onChange={() => {
                  setApp(item.id)
                  rememberCalendarApp(item.id)
                }}
                type="radio"
                value={item.id}
              />
              <strong>{t(item.label)}</strong>
              <span>{t(item.detail)}</span>
            </label>
          ))}
        </div>

        {app && picked && opensEach(app) && (
          <>
            <p className="field-hint">
              {t("일정을 하나씩 열어요. {app}의 일정 추가 화면이 새 창이나 앱으로 열려요.", { app: t(picked.label) })}
            </p>
            <ul className="calendar-entries">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span>
                    <strong>{entry.title}</strong>
                    <small>
                      {formatFullDate(entry.date)}
                      {entry.endDate && ` ~ ${formatFullDate(entry.endDate)}`}
                    </small>
                  </span>
                  <a
                    aria-label={t("{title} {app}에서 열기", { title: entry.title, app: t(picked.label) })}
                    className="primary-button"
                    href={app === "google" ? googleCalendarLink(entry) : outlookCalendarLink(entry)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("열기")}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}

        {app && !opensEach(app) && (
          <>
            <p className="field-hint">
              {t("일정 {count}개를 한 번에 넣어요. 캘린더 파일이 열리면 앱에서 추가를 눌러 주세요.", { count: entries.length })}
            </p>
            <button className="primary-button wide" onClick={openFile} type="button">
              {t("캘린더 앱 열기")}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
