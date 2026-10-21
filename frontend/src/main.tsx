import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CheckInPage } from './checkin/CheckInPage'
import { currentCheckInCode } from './lib/checkin'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

// Participants who scan an event QR get the check-in page instead of the app.
const checkInCode = currentCheckInCode()
if (checkInCode) document.body.classList.add('checkin-body')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {checkInCode ? <CheckInPage code={checkInCode} /> : <App />}
  </React.StrictMode>,
)
