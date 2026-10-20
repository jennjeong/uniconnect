# uniconnect

학생단체와 브랜드를 연결하는 협찬 매칭 서비스 **유니커넥트**의 웹/앱 프로토타입입니다.
Figma Make 프로젝트 [Create Web/App Service](https://www.figma.com/make/mhCaKcZdpbXcN9ZrN5pcjP/Create-Web-App-Service)에서 시작했고, 지금은 프론트엔드와 백엔드로 나뉜 모노레포입니다.

- 프론트엔드 `frontend/`: React 19 + Vite 8 + Tailwind CSS v4 (TypeScript)
- 백엔드 `backend/`: Node.js + Express 5 (TypeScript), JSON 파일 저장소
- 패키지 매니저: pnpm 10 워크스페이스 (`pnpm-workspace.yaml`, `pnpm-lock.yaml`)

## 회원 유형별 화면

학생단체(협찬 받기)와 브랜드(협찬 하기)는 같은 디자인을 쓰지만 메뉴와 기능이 다릅니다.

| | 학생단체 | 브랜드 |
| --- | --- | --- |
| 대시보드 | 다가오는 행사의 진행 현황, 추천 브랜드, 최근 행사 성과 | 답을 기다리는 제안, 협찬별 ROAS, 추천 학생단체 |
| 파트너 찾기 | 추천 매칭: 추천 · 인기 · 전체 · 업종별 브랜드, 브랜드마다 상세 정보 | 단체 찾기: 추천 · 행사 임박 · 전체 · 분야별 학생단체, 단체마다 상세 정보 |
| 제안 | 브랜드에 협찬 제안을 보내고 수락·거절 결과를 확인 | 받은 제안: 학생단체가 보낸 제안을 수락하거나 거절 |
| 일정 | 내 행사 달력 | 캠페인 달력 (예산 포함, 확정된 협찬 일정도 표시) |
| 성과 | 성과 측정(현장 QR)과 리포트(PDF) | 성과 분석: 협찬별 집행액 · 쿠폰 · 방문 · 방문당 비용 · ROAS (목표를 달성하면 초록색) |
| 소개 | 내 정보 → 편집하기: 소개, 협찬하면 얻는 것, 회원 수 · 활동 · 행사 규모, SNS, 지난 활동 | 내 정보 → 편집하기: 소개, 제공하는 협찬, 위치 · 제공 서비스, SNS, 포트폴리오 |
| 메시지 | 브랜드 상세 정보의 문의하기, 상단 말풍선 버튼의 메시지 목록 | 단체 상세 정보의 문의하기, 상단 말풍선 버튼의 메시지 목록 |

소개를 편집하면 상대 쪽 찾기와 상세 정보에 바로 반영되고, 학생단체의 '다음 행사'는 그 단체의 행사 달력에서 가져옵니다. 메시지는 열려 있는 대화에서 몇 초마다 새로 확인해서 상대의 답장이 바로 보입니다.

두 화면은 연결되어 있습니다. 학생단체가 계정이 있는 브랜드(데모에서는 오후의 커피)에 제안하면 그 브랜드의 받은 제안에 도착하고, 브랜드가 수락하면 학생단체 화면에 `협찬 확정`이 표시되며 해당 행사는 `집행 예정`으로 바뀝니다.

## 로컬 실행

Node.js 22 이상이 필요합니다. pnpm이 없다면 Node.js에 포함된 corepack으로 같은 버전을 실행할 수 있습니다.

```bash
corepack pnpm@10.34.3 install
npm run dev
```

`npm run dev`는 두 서버를 함께 띄웁니다.

- 웹: http://localhost:8443 (Vite, `/api` 요청은 백엔드로 전달)
- API: http://localhost:4000/api (Express)

### 데모 계정

로그인할 때 회원 유형도 계정과 같게 골라야 합니다.

| 회원 유형 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 협찬 받기 (학생단체) | `muse@syu.ac.kr` | `uniconnect2026` |
| 협찬 하기 (브랜드) | `hello@afternoon-coffee.kr` | `uniconnect2026` |

로그인하지 않으면 사이드바에서 고른 유형의 데모 데이터를 둘러볼 수 있고, 제안하기·제안 수락·행사 등록은 로그인 후에 할 수 있습니다.

### 화면 주소

화면마다 주소가 있어서 새로고침해도 같은 화면이 열리고, 브라우저의 뒤로·앞으로 버튼과 사파리의 스와이프(아이폰 가장자리, 맥 트랙패드)로 화면을 오갈 수 있습니다.

| 학생단체 | 브랜드 | 공통 |
| --- | --- | --- |
| `/matches`, `/matches/<브랜드 id>`, `/events`, `/measurement`, `/reports` | `/groups`, `/groups/<단체 id>`, `/inbox`, `/campaigns`, `/analytics` | `/` 대시보드, `/new` 등록, `/me` 내 정보, `/me/edit` 소개 편집, `/messages`, `/messages/<대화 id>` |

로그인하지 않았을 때는 주소에 맞는 유형의 화면을 보여 줍니다.

### 데이터

- 처음 실행할 때 데모 데이터로 `backend/data/db.json`을 만들고, 이후 변경 사항을 여기에 저장합니다. (git에는 포함되지 않음)
- 브랜드·학생단체 목록은 각 계정이 내 정보에서 고친 소개를 저장합니다. 그 전 버전의 데이터 파일은 처음 한 번만 `seed.ts`의 최신 목록(SNS, 포트폴리오 포함)으로 바뀝니다.
- 처음 상태로 되돌리려면 서버를 끄고 `backend/data/db.json`을 지운 뒤 다시 실행하세요.
- JSON 파일 저장소는 프로토타입용입니다. 실제 서비스 전에는 데이터베이스로 바꿔야 합니다.

### 이메일 인증

아직 메일 발송 서비스가 연결되지 않았습니다. 개발 중에는 인증번호를 API 응답(`devCode`)에 담아 회원가입 화면에 보여 주고, 서버 로그에도 `[mail]`로 출력합니다.
실제 메일을 보낼 때는 `backend/src/lib/mailer.ts`의 `sendVerificationCode`를 구현하고 `EXPOSE_EMAIL_CODES=false`로 설정하세요.

### 현장 QR 참여

성과 측정의 `현장 QR 열기`는 실제로 스캔되는 QR 코드를 보여 줍니다. 참여자가 스캔하면 `/check-in/<행사 코드>` 참여 화면이 열리고, 이때 QR 스캔이 1건 기록됩니다. 참여자는 그 화면에서 쿠폰을 받고(쿠폰 수령), 매장 직원이 `직원 확인 완료`를 누르면 매장 방문이 기록됩니다. 같은 휴대폰에서 다시 열어도 한 번만 집계됩니다.

QR은 지금 연 주소를 담습니다. 휴대폰으로 스캔해 보려면 컴퓨터에서 `localhost` 대신 Vite가 알려 주는 네트워크 주소(예: `http://192.168.x.x:8443`)로 앱을 열어 주세요.

## 빌드와 배포

```bash
npm run build
NODE_ENV=production npm start
```

`npm run build`는 `backend/dist/`와 `frontend/dist/`를 만듭니다. `npm start`로 실행한 Express 서버가 API와 빌드된 웹을 한 주소에서 함께 제공합니다. production에서는 호스팅 환경이 주는 `PORT`를 사용합니다.

### 환경 변수

| 변수 | 위치 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `API_PORT` | 백엔드 | `4000` | API 포트 (Vite가 `PORT`를 쓰기 때문에 따로 둠) |
| `PORT` | 백엔드 | 없음 | `NODE_ENV=production`일 때 사용할 포트 |
| `DATA_FILE` | 백엔드 | `backend/data/db.json` | 데이터 파일 경로 |
| `CORS_ORIGIN` | 백엔드 | 없음 | 웹을 다른 주소에서 호스팅할 때 허용할 origin |
| `EXPOSE_EMAIL_CODES` | 백엔드 | 개발 `true`, production `false` | 인증번호를 응답에 포함할지 여부 (메일 서비스 없이 시연할 때 `true`) |
| `VITE_API_URL` | 프론트엔드 | 비어 있음 | 백엔드를 다른 주소에 둘 때 API origin (예: `https://api.example.com`) |

## API

로그인이 필요한 요청은 `Authorization: Bearer <token>` 헤더를 보냅니다. 오류는 `{ "error": "메시지" }` 형태로 돌려줍니다.

| 메서드 | 경로 | 설명 | 로그인 |
| --- | --- | --- | --- |
| GET | `/api/health` | 상태 확인 | |
| POST | `/api/auth/email-code` | 가입 인증번호 발송 `{ role, email }` | |
| POST | `/api/auth/email-code/verify` | 인증번호 확인 `{ email, code }` → `verificationToken` | |
| POST | `/api/auth/signup` | 회원가입 → `{ token, account }` | |
| POST | `/api/auth/login` | 로그인 `{ role, email, password }` → `{ token, account }` | |
| GET | `/api/auth/me` | 내 계정 | 필요 |
| POST | `/api/auth/logout` | 로그아웃 | |
| GET | `/api/matches?role=` | 추천 매칭 상위 3곳 (로그인하면 내 유형 기준) | |
| GET | `/api/brands` | 학생단체가 둘러보는 브랜드 전체 (일치율·협찬 횟수 포함) | |
| GET | `/api/groups` | 브랜드가 둘러보는 학생단체 전체 (학교·다음 행사·예상 인원 포함) | |
| GET | `/api/events?role=` | 행사·캠페인 목록 (로그인 전에는 데모 계정 것) | |
| POST | `/api/events` | 행사·캠페인 등록 (`date`는 `YYYY-MM-DD`, 협찬 유형 1개 이상, `기타`는 `typeNote` 함께, 브랜드는 `budget`(원) 선택) | 필요 |
| DELETE | `/api/events/:id` | 행사·캠페인 삭제 | 필요 |
| GET | `/api/proposals` | 보낸 협찬 제안 `{ proposals, statuses }` (`statuses`는 브랜드가 답한 결과) | |
| POST | `/api/proposals` | 협찬 제안 보내기 `{ matchId }` (학생단체→브랜드, 브랜드→학생단체). 계정이 있는 브랜드에는 다음 행사 정보와 함께 받은 제안으로 전달 | 필요 |
| DELETE | `/api/proposals/:matchId` | 협찬 제안 취소 (수락된 제안은 409) | 필요 |
| GET | `/api/requests` | 브랜드가 받은 협찬 제안 (최신순, 로그인 전에는 데모 브랜드 것) | |
| POST | `/api/requests/:id/accept` · `/decline` | 받은 제안 수락·거절 (브랜드만, 이미 답한 제안은 409) | 필요 |
| GET | `/api/profile` | 내 소개(상대가 보는 목록 항목), 아직 없으면 `null` | 필요 |
| PUT | `/api/profile` | 소개 저장 `{ intro, offer, tags, facts, sns, portfolio }` (처음 저장하면 목록에 등록) | 필요 |
| GET | `/api/conversations` | 내 대화 목록 (상대, 마지막 메시지, 읽지 않은 수) | |
| POST | `/api/conversations` | 대화 시작 `{ partnerId }` (이미 있으면 그 대화, 소개가 없으면 409) | 필요 |
| GET | `/api/conversations/:id` | 대화의 모든 메시지 (읽음 처리) | 필요 |
| POST | `/api/conversations/:id/messages` | 메시지 보내기 `{ text }` (1,000자까지) | 필요 |
| GET | `/api/analytics` | 브랜드의 협찬별 집행액·쿠폰·방문·추정 매출·목표 ROAS (측정 중인 행사는 실시간 수치) | |
| GET | `/api/metrics` | QR 스캔·쿠폰 수령·매장 방문 수 | |
| POST | `/api/metrics/:kind` | `scans` · `coupons` · `visits` 1 증가하고 참여 기록 추가 (현장 참여 화면이 호출) | |
| GET | `/api/metrics/log?kind=` | 최근 참여 기록 (최신순, `kind`로 항목 선택) | |
| GET | `/api/report` | 측정한 행사의 목표 수치와 결과 (리포트·PDF용) | |

## 검사

```bash
npm test
npm run typecheck
```

`npm test`는 백엔드 API 테스트(`backend/src/app.test.ts`)를 실행합니다.

## 구조

```text
.
├── frontend/                  React 앱
│   ├── src/
│   │   ├── App.tsx            화면 상태, API 호출, 페이지·모달 전환
│   │   ├── api/               fetch 래퍼(client.ts)와 엔드포인트 함수(index.ts)
│   │   ├── pages/             학생단체: 대시보드 · 추천 매칭 · 내 행사 · 성과 측정 · 리포트
│   │   │                      브랜드: 대시보드 · 단체 찾기 · 받은 제안 · 캠페인 · 성과 분석
│   │   │                      공통: 행사·캠페인 등록 · 내 정보 · 브랜드·단체 상세 정보
│   │   ├── modals/            리포트 · 목표 · 참여 기록 · QR · 로그인 · 회원가입
│   │   ├── layout/            사이드바 · 상단바(알림 패널) · 모바일 메뉴
│   │   ├── components/        아이콘, 로고 타일, 일치율 링 등 공용 UI
│   │   ├── data/ lib/ hooks/  회원 유형별 메뉴, 화면 주소(route.ts), 포맷·날짜·성과 계산 함수, 알림 토스트
│   │   ├── types.ts           API 응답 타입
│   │   └── index.css          전역 스타일 (Tailwind v4)
│   ├── vite.config.ts         Vite 설정 (/api 프록시, Figma Make 플러그인)
│   └── .figma/make/           Figma Make 실행 환경 스크립트 (site.json은 빌드에서도 사용)
├── backend/                   Express API
│   └── src/
│       ├── index.ts           서버 시작
│       ├── app.ts             라우터 연결, 오류 처리, 빌드된 웹 제공
│       ├── routes/            auth · matches · brands · groups · events · proposals · requests · metrics · report · analytics · profile · conversations
│       ├── middleware/        Bearer 토큰 세션
│       ├── lib/               비밀번호 해시, 이메일 규칙, 메일 발송 자리, 입력 검증
│       ├── data/seed.ts       데모 데이터와 데모 계정
│       ├── store.ts           JSON 파일 저장소
│       └── app.test.ts        API 테스트
├── package.json               루트 스크립트 (dev, build, start, test, typecheck)
└── pnpm-workspace.yaml
```
