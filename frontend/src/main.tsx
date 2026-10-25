import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CheckInPage } from './checkin/CheckInPage'
import { StaffCheckInPage } from './checkin/StaffCheckInPage'
import { lang } from './i18n'
import { currentCheckIn } from './lib/checkin'
import { keepOutOfSearch } from './lib/pageMeta'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

// Screen readers and the browser's own features read the page's language.
document.documentElement.lang = lang

// The site is a web page, not an app to install. A visitor from when it was
// installable may still have its service worker and the copies it kept, so
// both go here (public/sw.js removes them from the worker's side too).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => registrations.forEach((registration) => void registration.unregister()))
    .catch(() => undefined)
}
if ('caches' in window) {
  caches
    .keys()
    .then((keys) => keys.filter((key) => key.startsWith('uniconnect-')).forEach((key) => void caches.delete(key)))
    .catch(() => undefined)
}

// Participants who scan an event QR get the check-in page instead of the
// app, and the sponsor's store staff their own page (/check-in/<code>/staff).
// Neither belongs in search results.
const checkIn = currentCheckIn()
if (checkIn) {
  document.body.classList.add('checkin-body')
  keepOutOfSearch()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {checkIn ? (
      checkIn.staff ? <StaffCheckInPage code={checkIn.code} /> : <CheckInPage code={checkIn.code} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
