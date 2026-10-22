import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CheckInPage } from './checkin/CheckInPage'
import { StaffCheckInPage } from './checkin/StaffCheckInPage'
import { currentCheckIn } from './lib/checkin'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

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
