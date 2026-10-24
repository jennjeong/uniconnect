import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CheckInPage } from './checkin/CheckInPage'
import { StaffCheckInPage } from './checkin/StaffCheckInPage'
import { lang } from './i18n'
import { currentCheckIn } from './lib/checkin'
import { watchInstall } from './lib/install'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

// Screen readers and the browser's own features read the page's language.
document.documentElement.lang = lang

// Installing as an app (the menu's 앱 설치) and the service worker that
// allows it (public/sw.js): only in the built app, as it would get in the way
// of the development server.
watchInstall()
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

// Participants who scan an event QR get the check-in page instead of the
// app, and the sponsor's store staff their own page (/check-in/<code>/staff).
const checkIn = currentCheckIn()
if (checkIn) document.body.classList.add('checkin-body')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {checkIn ? (
      checkIn.staff ? <StaffCheckInPage code={checkIn.code} /> : <CheckInPage code={checkIn.code} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
