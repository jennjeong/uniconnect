# uniconnect

학생단체와 브랜드를 연결하는 협찬 매칭 서비스 **유니커넥트**의 웹/앱 프로토타입입니다.
Figma Make 프로젝트 [Create Web/App Service](https://www.figma.com/make/mhCaKcZdpbXcN9ZrN5pcjP/Create-Web-App-Service)에서 시작했고, 지금은 프론트엔드와 백엔드로 나뉜 모노레포입니다.

- 프론트엔드 `frontend/`: React 19 + Vite 8 + Tailwind CSS v4 (TypeScript). 글꼴은 Pretendard. 3D·그라디언트 배경은 three.js와 WebGL2(getlayers.ai 프롬프트), 로그인 팝업 머리는 [ShaderGradient](https://github.com/ruucm/shadergradient)
- 백엔드 `backend/`: Node.js + Express 5 (TypeScript), JSON 파일 저장소
- 패키지 매니저: pnpm 10 워크스페이스 (`pnpm-workspace.yaml`, `pnpm-lock.yaml`)

## 회원 유형별 화면

학생단체(협찬 받기)와 브랜드(협찬 하기)는 같은 디자인을 쓰지만 메뉴와 기능이 다릅니다.

| | 학생단체 | 브랜드 |
| --- | --- | --- |
| 대시보드 | 다가오는 행사의 진행 현황, 추천 브랜드, 최근 행사 성과 | 답을 기다리는 제안, 협찬별 ROAS, 추천 학생단체 |
| 파트너 찾기 | 추천 매칭: 추천 · 인기 · 전체 · 업종별 브랜드, 브랜드마다 상세 정보 | 단체 찾기: 추천 · 행사 임박 · 전체 · 분야별 학생단체, 단체마다 상세 정보 |
| 제안 | 브랜드에 협찬 제안을 보내고 수락·거절 결과를 확인 | 받은 제안: 학생단체가 보낸 제안을 수락하거나 거절, 수락한 제안은 제안부터 성과 리포트까지 날짜별 진행 단계 |
| 일정 | 내 행사 달력 (하루 또는 기간, 달력 아래 그달 일정 목록) | 행사 일정 달력 (하루 또는 기간, 예산 포함, 확정된 협찬 일정도 표시, 달력 아래 그달 일정 목록) |
| 성과 | 성과 측정(현장 QR)과 리포트(PDF) | 성과 분석: 협찬별 집행액 · 쿠폰 · 방문 · 방문당 비용 · ROAS (목표를 달성하면 짙은 파란색, 아직이면 은색), 요약과 협찬별 보고서를 담은 분석 보고서 PDF |
| 소개 | 내 정보 → 편집하기: 소개, 협찬하면 얻는 것, 회원 수 · 활동 · 행사 규모, SNS, 지난 활동 | 내 정보 → 편집하기: 소개, 제공하는 협찬, 위치 · 제공 서비스, SNS, 포트폴리오 |
| 메시지 | 브랜드 상세 정보의 문의하기, 상단 말풍선 버튼의 메시지 목록, 보낸 메시지의 읽음 표시와 수정 · 삭제 | 단체 상세 정보의 문의하기, 상단 말풍선 버튼의 메시지 목록, 보낸 메시지의 읽음 표시와 수정 · 삭제 |

소개를 편집하면 상대 쪽 찾기와 상세 정보에 바로 반영되고, 학생단체의 '다음 행사'는 그 단체의 행사 달력에서 가져옵니다. 메시지는 열려 있는 대화에서 몇 초마다 새로 확인해서 상대의 답장이 바로 보입니다. 내가 보낸 메시지에는 상대가 읽었는지(`읽음` · `안 읽음`)가 표시되고, 메시지 옆 ⋯ 버튼으로 고치거나 지울 수 있습니다. 고친 메시지에는 양쪽 모두에 `수정됨`이 붙고, 지운 메시지 자리에는 양쪽 모두에 삭제된 메시지라고 남습니다.

두 화면은 연결되어 있습니다. 학생단체가 계정이 있는 브랜드(데모에서는 오후의 커피)에 제안하면 그 브랜드의 받은 제안에 도착하고, 브랜드가 수락하면 학생단체 화면에 `협찬 확정`이 표시되며 해당 행사는 `집행 예정`으로 바뀝니다.

## 디자인

사업계획서의 핵심인 '연결'에 맞춰 [getlayers.ai](https://www.getlayers.ai/templates)의 프롬프트를 옮긴 밝은 테마입니다. 흰 바탕에 은색 면과 얇은 선, 짙은 파란색 포인트를 쓰고, 글자에는 검정 대신 슬레이트 회색을 씁니다. 학생단체와 브랜드가 **맞닿고**, 협찬이 다음 협찬으로 **이어지고**, **함께라서 생기는 힘**이 숫자로 남는 흐름을 화면마다 하나씩 맡겼습니다.

| 가져온 프롬프트 | 쓰인 곳 | 담은 뜻 |
| --- | --- | --- |
| Antipode (그라디언트) | 대시보드 첫 화면, 브랜드 · 단체 상세 배너 | 맞닿음: 짙은 파란 덩어리와 은색 덩어리가 기대어 만나는 곳이 가장 밝게 빛남 |
| Stride (템플릿) | 떠 있는 알약 헤더, 스크롤하면 둥근 카드로 줄어드는 첫 화면, 서로 반대로 흐르는 로고 띠, 아이콘 칩이 박힌 소개 문장, 숫자 벤토, 크롬 체인이 화면에 머무는 협찬 단계, 메시 그라디언트 푸터와 서로 걸린 크롬 고리, 글자와 카드가 흐림 속에서 떠오르는 효과 | 이어짐: 끊기지 않는 협찬의 고리 |
| Interference (그라디언트) | 리포트 · 성과 측정 · 성과 분석의 숫자 패널 | 함께라서 생기는 힘: 두 물결이 겹치는 곳에서 더 밝아짐 |
| ShaderGradient | 로그인 · 회원가입 팝업 머리 (남색과 은색으로) | |

- 시작 화면에서는 로고 마크가 연결고리로 그려집니다. 학교와 가게가 나타나고, 각자 U자의 절반을 아래로 그려 바닥에서 맞물리며(작은 튕김과 파동), 이름이 옆으로 들어온 뒤 맞물린 자리에서 남색 테두리의 원이 열리며 메인 화면이 나타납니다. 브라우저 세션마다 한 번만 재생합니다.
- 로고는 학교(학생단체)와 가게(브랜드)를 U자로 잇는 마크를 학생단체 쪽은 짙은 파란색, 브랜드 쪽은 은색으로 다시 칠했습니다. 헤더에서는 버튼 테두리 없이 놓이고, 짙은 파란 화면 위를 지날 때는 흰 로고로 바뀝니다.
- 목표를 달성한 그래프는 짙은 파란색, 아직인 그래프는 은색이고, 목표 기준선은 어느 쪽 위에서도 보이도록 흰 테두리의 주황빛 선입니다. 일치율 링도 점수가 높을수록 짙은 파란색이 됩니다.
- 강조할 글자에는 포인트 색을 더했습니다. 큰 제목은 한 줄을 파란 포인트로 칠하는데(예: '브랜드 팬을', '협찬의 고리'), 흰 바탕에서는 밝은 파랑, 짙은 파란 바탕에서는 빛나는 하늘색입니다. 흰 · 은색 카드의 큰 숫자와 섹션 라벨은 짙은 파랑입니다.
- 글꼴은 Pretendard 한 가지를 굵기마다 역할을 나눠 씁니다. Bold(700) 큰 제목 · 큰 숫자 · 강조, Medium(500) 본문, SemiBold(600) 라벨 · 버튼 · 카드 제목 · 전체 메뉴, ExtraBold(800) 배지와 개수, Black(900) 푸터 워드마크이고, ExtraLight(200)는 장식용 문구(넓은 화면에서 체인 옆 '함께라서 더 단단하게')에만 씁니다. 웹에서는 같은 서체를 가변 글꼴로 나눠 둔 `pretendard` 패키지에서 화면에 쓰인 글자만 내려받습니다.
- 본문은 최대 1240px 폭에 모이고, 브랜드·단체 카드는 화면 폭에 맞춰 한 줄에 네 개까지 자동으로 놓입니다. 넓은 화면에서는 헤더에 메뉴가 바로 보이고, 1360px보다 좁으면 다가오는 일정과 유형 전환이, 1100px보다 좁으면 메뉴도 Menu 버튼의 전체 화면 메뉴로 옮겨 갑니다. 휴대폰에서는 Menu와 등록 버튼이 동그란 아이콘이 되고, 카드가 한 줄에 하나씩 놓이며 팝업은 아래에서 올라옵니다.
- 움직이는 그라디언트 위의 글자는 남색 그늘이나 반투명 남색 유리 위에 두어, 빛이 지나가도 명도 대비 기준을 지킵니다.
- three.js는 3D 장면이 있는 화면을 처음 열 때 따로 내려받습니다. 기기에서 동작 줄이기를 켜면 로딩 화면을 생략하고 움직임을 멈춥니다. WebGL을 쓸 수 없으면 같은 색의 정지 배경이 보입니다.
- PDF 리포트는 인쇄하기 좋은 밝은 색에 같은 남색 포인트로 만듭니다.

## 출시 준비

- 화면마다 브라우저 탭 제목과 검색용 설명이 따로 있어요(`frontend/src/lib/pageMeta.ts`).
- 없는 주소는 홈과 주요 메뉴로 안내하는 404 화면을 보여 주고, 빌드한 서버(`npm start`)는 실제 404 상태로 응답해요.
- 대시보드 맨 아래와 FAQ 페이지(`/faq`, 메뉴의 내 정보 옆)에 자주 묻는 질문 5개가 있어요. 실제 기능만 설명하고, 이용 요금·환불처럼 정해지지 않은 내용은 넣지 않았어요.
- FAQ 페이지에서 로그인한 사용자는 관리자에게 질문을 보내고, 답변을 '내 질문'에서 볼 수 있어요. 관리자 화면은 아직 없고, 서버에 `ADMIN_TOKEN`을 설정한 뒤 아래 관리자 API로 질문을 보고 답해요.
- 아래 값은 실제 정보가 정해지면 `frontend/.figma/make/site.json`에 넣어요.
  - GA4 측정 ID(`analytics.googleAnalyticsId`): 넣으면 제안·문의 클릭과 실제 제안 접수, 가입이 이벤트로 기록돼요.
  - 공유 이미지(`openGraph.image`): `https://<실제 도메인>/og-image.png` 처럼 절대 주소로 넣어요(1200×630, `frontend/public/og-image.png`).
  - 검색 노출(`robots.index`): 지금은 `false`라 검색엔진 수집을 막아 두었어요. 공개할 때 `true`로 바꿔요.

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

로그인하지 않으면 헤더의 유형 전환(좁은 화면에서는 Menu)에서 고른 유형의 데모 데이터를 둘러볼 수 있고, 제안하기·제안 수락·행사 등록은 로그인 후에 할 수 있습니다.

### 화면 주소

화면마다 주소가 있어서 새로고침해도 같은 화면이 열리고, 브라우저의 뒤로·앞으로 버튼으로 화면을 오갈 수 있습니다.

애플 기기처럼 옆으로 밀어서도 오갑니다. 화면 어디서든 왼쪽에서 오른쪽으로 밀면 이전 화면, 오른쪽에서 왼쪽으로 밀면 다음 화면으로 넘어갑니다(휴대폰은 한 손가락, 맥은 트랙패드 두 손가락). 미는 동안 이전 화면은 왼쪽, 다음 화면은 오른쪽 가장자리에서 둥근 화살표가 따라 나오고, 놓으면 넘어갈 만큼 밀면 짙은 파랑으로 바뀌며, 새 화면은 그쪽에서 밀려 들어옵니다. 화면 가장자리에서 시작한 스와이프는 사파리의 기본 제스처에 맡기고, 팝업 · 메뉴가 열려 있을 때와 입력칸이나 가로로 스크롤되는 줄 위에서는 넘어가지 않습니다.

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
| POST | `/api/events` | 행사·캠페인 등록 (`date`는 `YYYY-MM-DD`, 여러 날이면 마지막 날 `endDate`(최대 90일), 협찬 유형 1개 이상, `기타`는 `typeNote` 함께, 브랜드는 `budget`(원) 선택) | 필요 |
| DELETE | `/api/events/:id` | 행사·캠페인 삭제 | 필요 |
| GET | `/api/proposals` | 보낸 협찬 제안 `{ proposals, statuses }` (`statuses`는 브랜드가 답한 결과) | |
| POST | `/api/proposals` | 협찬 제안 보내기 `{ matchId }` (학생단체→브랜드, 브랜드→학생단체). 계정이 있는 브랜드에는 다음 행사 정보와 함께 받은 제안으로 전달 | 필요 |
| DELETE | `/api/proposals/:matchId` | 협찬 제안 취소 (수락된 제안은 409) | 필요 |
| GET | `/api/requests` | 브랜드가 받은 협찬 제안 (최신순, 로그인 전에는 데모 브랜드 것) | |
| POST | `/api/requests/:id/accept` · `/decline` | 받은 제안 수락·거절 (브랜드만, 이미 답한 제안은 409) | 필요 |
| GET | `/api/profile` | 내 소개(상대가 보는 목록 항목), 아직 없으면 `null` | 필요 |
| PUT | `/api/profile` | 소개 저장 `{ intro, offer, tags, facts, sns, portfolio }` (처음 저장하면 목록에 등록) | 필요 |
| GET | `/api/inquiries` | 내가 관리자에게 보낸 질문과 답변 | 필요 |
| POST | `/api/inquiries` | 관리자에게 질문 `{ category, question }` (종류는 이용 방법 · 계정 · 가입 · 제안 · 매칭 · 오류 신고 · 기타, 5~1,000자) | 필요 |
| GET | `/api/admin/inquiries` | 모든 질문 (답변 대기 먼저, 보낸 계정 포함) | `X-Admin-Token` |
| POST | `/api/admin/inquiries/:id/answer` | 질문에 답변 `{ answer }` | `X-Admin-Token` |
| GET | `/api/conversations` | 내 대화 목록 (상대, 마지막 메시지, 읽지 않은 수) | |
| POST | `/api/conversations` | 대화 시작 `{ partnerId }` (이미 있으면 그 대화, 소개가 없으면 409) | 필요 |
| GET | `/api/conversations/:id` | 대화의 모든 메시지 (읽음 처리, 내 메시지에는 상대가 읽었는지 `read`, 고치거나 지운 메시지에는 `editedAt` · `deletedAt`) | 필요 |
| POST | `/api/conversations/:id/messages` | 메시지 보내기 `{ text }` (1,000자까지) | 필요 |
| PUT | `/api/conversations/:id/messages/:messageId` | 내가 보낸 메시지 고치기 `{ text }` (상대 메시지는 403, 지운 메시지는 409) | 필요 |
| DELETE | `/api/conversations/:id/messages/:messageId` | 내가 보낸 메시지 지우기 (내용을 비우고 `deletedAt` 표시, 상대 메시지는 403) | 필요 |
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
│   │   │                      브랜드: 대시보드 · 단체 찾기 · 받은 제안 · 행사 일정 · 성과 분석
│   │   │                      공통: 행사·캠페인 등록 · 내 정보 · 브랜드·단체 상세 정보
│   │   ├── modals/            리포트 · 목표 · 참여 기록 · QR · 로그인 · 회원가입
│   │   ├── layout/            헤더(알림 패널) · 전체 화면 메뉴 · 푸터
│   │   ├── components/        페이지 머리말, 알약 버튼, 은색 카드, 대시보드 구성(첫 화면 · 로고 띠 · 숫자 벤토 · 협찬 단계), 로딩 화면, 제목 애니메이션 등 공용 UI
│   │   ├── scenes/            WebGL 장면: Antipode · Interference 그라디언트, Stride 메시와 크롬 체인 · 고리
│   │   ├── data/ lib/ hooks/  회원 유형별 메뉴, 화면 주소(route.ts)와 스와이프 이동(swipe.ts), 포맷·날짜·성과 계산 함수, 알림 토스트
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
