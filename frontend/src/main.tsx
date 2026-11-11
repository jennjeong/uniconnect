import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { lang } from './i18n'
import { currentCheckIn } from './lib/checkin'
import { installErrorReports } from './lib/errorReports'
import { watchInstall } from './lib/install'
import { keepOutOfSearch } from './lib/pageMeta'
import { keepReferral } from './lib/referral'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

// 스크린 리더와 브라우저 자체 기능이 페이지의 언어를 읽는다.
document.documentElement.lang = lang

// 앱 다운로드(앱으로 설치)와 이를 가능하게 하는 서비스 워커(public/sw.js). 개발
// 서버에 방해가 되므로 빌드된 앱에서만 쓴다.
watchInstall()
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

// 페이지가 잡지 못한 오류는 운영자의 로그로 보낸다. 개발 서버가 이미 보여
// 주므로 빌드된 앱에서만 보낸다.
if (import.meta.env.PROD) installErrorReports()
// 초대 링크의 코드는 가입할 때까지 기다린다(친구 초대).
keepReferral()

// 행사 QR을 스캔한 참가자는 앱 대신 체크인 페이지를, 스폰서의 가게 직원은 자기
// 페이지(/check-in/<code>/staff)를, 학생단체의 직원은 자기
// 페이지(/check-in/<code>/group)를 본다. 어느 것도 검색 결과에 나오면 안 된다.
const checkIn = currentCheckIn()
if (checkIn) {
  document.body.classList.add('checkin-body')
  keepOutOfSearch()
}

// 운영자 콘솔(/admin)도 회원용 헤더, 메뉴, 푸터 없이 단독으로 선다.
const adminConsole = window.location.pathname.replace(/\/$/, '') === '/admin'
if (adminConsole) {
  document.body.classList.add('console-body')
  document.title = 'uniconnect Admin'
  keepOutOfSearch()
}

// 체크인 페이지들은 QR로 들어온 사람만 쓰므로 따로 받는다. 첫 화면의 번들이 그만큼 가볍다.
const CheckInPage = React.lazy(() => import('./checkin/CheckInPage').then((module) => ({ default: module.CheckInPage })))
const GroupCheckInPage = React.lazy(() =>
  import('./checkin/GroupCheckInPage').then((module) => ({ default: module.GroupCheckInPage })),
)
const StaffCheckInPage = React.lazy(() =>
  import('./checkin/StaffCheckInPage').then((module) => ({ default: module.StaffCheckInPage })),
)

// 거기서만 불러오므로 회원은 내려받지 않는다.
const AdminConsole = React.lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminConsole })))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {checkIn ? (
      <React.Suspense fallback={null}>
        {checkIn.page === 'staff' ? (
          <StaffCheckInPage code={checkIn.code} />
        ) : checkIn.page === 'group' ? (
          <GroupCheckInPage code={checkIn.code} />
        ) : (
          <CheckInPage code={checkIn.code} />
        )}
      </React.Suspense>
    ) : adminConsole ? (
      <React.Suspense fallback={null}>
        <AdminConsole />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
