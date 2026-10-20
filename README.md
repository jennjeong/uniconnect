# uniconnect

학생단체와 브랜드를 연결하는 협찬 매칭 서비스 **유니커넥트**의 웹/앱 프로토타입입니다.
Figma Make 프로젝트 [Create Web/App Service](https://www.figma.com/make/mhCaKcZdpbXcN9ZrN5pcjP/Create-Web-App-Service)에서 시작했고, 지금은 프론트엔드와 백엔드로 나뉜 모노레포입니다.

- 프론트엔드 `frontend/`: React 19 + Vite 8 + Tailwind CSS v4 (TypeScript)
- 백엔드 `backend/`: Node.js + Express 5 (TypeScript), JSON 파일 저장소
- 패키지 매니저: pnpm 10 워크스페이스 (`pnpm-workspace.yaml`, `pnpm-lock.yaml`)

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

로그인하지 않으면 사이드바에서 고른 유형의 데모 데이터를 둘러볼 수 있고, 제안하기·행사 등록은 로그인 후에 할 수 있습니다.

### 데이터

- 처음 실행할 때 데모 데이터로 `backend/data/db.json`을 만들고, 이후 변경 사항을 여기에 저장합니다. (git에는 포함되지 않음)
- 처음 상태로 되돌리려면 서버를 끄고 `backend/data/db.json`을 지운 뒤 다시 실행하세요.
- JSON 파일 저장소는 프로토타입용입니다. 실제 서비스 전에는 데이터베이스로 바꿔야 합니다.

### 이메일 인증

아직 메일 발송 서비스가 연결되지 않았습니다. 개발 중에는 인증번호를 API 응답(`devCode`)에 담아 회원가입 화면에 보여 주고, 서버 로그에도 `[mail]`로 출력합니다.
실제 메일을 보낼 때는 `backend/src/lib/mailer.ts`의 `sendVerificationCode`를 구현하고 `EXPOSE_EMAIL_CODES=false`로 설정하세요.

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
| GET | `/api/matches?role=` | 추천 매칭 (로그인하면 내 유형 기준) | |
| GET | `/api/events?role=` | 행사·캠페인 목록 (로그인 전에는 데모 계정 것) | |
| POST | `/api/events` | 행사·캠페인 등록 | 필요 |
| DELETE | `/api/events/:id` | 행사·캠페인 삭제 | 필요 |
| GET | `/api/proposals` | 보낸 협찬 제안 (매칭 id 목록) | |
| POST | `/api/proposals` | 협찬 제안 보내기 `{ matchId }` | 필요 |
| DELETE | `/api/proposals/:matchId` | 협찬 제안 취소 | 필요 |
| GET | `/api/metrics` | QR 스캔·쿠폰 수령·매장 방문 수 | |
| POST | `/api/metrics/:kind` | `scans` · `coupons` · `visits` 1 증가 (데모 측정용) | |

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
│   │   ├── pages/             대시보드 · 추천 매칭 · 내 행사 · 성과 측정 · 리포트
│   │   ├── modals/            행사 등록 · 알림 · 리포트 · QR · 내 정보 · 로그인 · 회원가입
│   │   ├── layout/            사이드바 · 상단바 · 모바일 메뉴
│   │   ├── components/        아이콘, 로고 타일, 일치율 링 등 공용 UI
│   │   ├── data/ lib/ hooks/  메뉴·회원 유형 상수, 포맷 함수, 알림 토스트
│   │   ├── types.ts           API 응답 타입
│   │   └── index.css          전역 스타일 (Tailwind v4)
│   ├── vite.config.ts         Vite 설정 (/api 프록시, Figma Make 플러그인)
│   └── .figma/make/           Figma Make 실행 환경 스크립트 (site.json은 빌드에서도 사용)
├── backend/                   Express API
│   └── src/
│       ├── index.ts           서버 시작
│       ├── app.ts             라우터 연결, 오류 처리, 빌드된 웹 제공
│       ├── routes/            auth · matches · events · proposals · metrics
│       ├── middleware/        Bearer 토큰 세션
│       ├── lib/               비밀번호 해시, 이메일 규칙, 메일 발송 자리, 입력 검증
│       ├── data/seed.ts       데모 데이터와 데모 계정
│       ├── store.ts           JSON 파일 저장소
│       └── app.test.ts        API 테스트
├── package.json               루트 스크립트 (dev, build, start, test, typecheck)
└── pnpm-workspace.yaml
```
