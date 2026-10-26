import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CheckInPage } from './checkin/CheckInPage'
import { GroupCheckInPage } from './checkin/GroupCheckInPage'
import { StaffCheckInPage } from './checkin/StaffCheckInPage'
import { lang } from './i18n'
import { currentCheckIn } from './lib/checkin'
import { installErrorReports } from './lib/errorReports'
import { watchInstall } from './lib/install'
import { keepOutOfSearch } from './lib/pageMeta'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

// Screen readers and the browser's own features read the page's language.
document.documentElement.lang = lang

// Installing as an app (앱 다운로드) and the service worker that
// allows it (public/sw.js): only in the built app, as it would get in the way
// of the development server.
watchInstall()
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

// Errors the page didn't catch reach the operators' log, from the built app
// only, as the development server shows them anyway.
if (import.meta.env.PROD) installErrorReports()

// Participants who scan an event QR get the check-in page instead of the
// app, the sponsor's store staff their own page (/check-in/<code>/staff) and
// the student group's staff theirs (/check-in/<code>/group). None belongs in
// search results.
const checkIn = currentCheckIn()
if (checkIn) {
  document.body.classList.add('checkin-body')
  keepOutOfSearch()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {checkIn ? (
      checkIn.page === 'staff' ? (
        <StaffCheckInPage code={checkIn.code} />
      ) : checkIn.page === 'group' ? (
        <GroupCheckInPage code={checkIn.code} />
      ) : (
        <CheckInPage code={checkIn.code} />
      )
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
