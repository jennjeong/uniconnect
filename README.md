# uniconnect

학생단체와 브랜드를 잇는 캠퍼스 협찬 서비스 **유니커넥트**의 모노레포다. 매칭, 제안, 임시 전자 계약서, 현장 측정, 리포트, 후기까지 협찬 하나를 한곳에서 진행한다. [Figma Make 프로젝트](https://www.figma.com/make/mhCaKcZdpbXcN9ZrN5pcjP/Create-Web-App-Service)에서 시작했다.

- 서비스: https://uniconnect-pied.vercel.app
- 프론트엔드 `frontend/`: React 19, Vite 8, Tailwind CSS v4, TypeScript, Pretendard. 3D · 그라디언트 배경은 three.js와 WebGL2(getlayers.ai 프롬프트), 로그인 팝업 머리는 [ShaderGradient](https://github.com/ruucm/shadergradient)
- 백엔드 `backend/`: Node.js 22, Express 5, TypeScript. 개발은 JSON 파일, 운영은 Postgres(Neon)에 저장
- 패키지: pnpm 10 워크스페이스

## 시작하기

```bash
corepack pnpm@10.34.3 install
npm run dev                     # 웹 http://localhost:8443, API http://localhost:4000/api
```

| 명령 | 하는 일 |
| --- | --- |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 백엔드 API, Postgres 저장(PGlite), 프론트 단위 테스트(vitest) |
| `npm run build` → `NODE_ENV=production npm start` | `backend/dist` · `frontend/dist`를 만들고 Express 하나로 API와 웹을 제공 |
| `npm run e2e` | 빌드한 앱을 Chrome으로 눌러 보는 테스트와 접근성 검사(WCAG 2.1 A · AA). 별도 데이터 파일 사용 |

- 처음 실행하면 데모 데이터로 `backend/data/db.json`을 만든다(git 제외). 서버를 끄고 지우면 처음 상태로 돌아간다.
- 예전 버전의 데이터 파일은 처음 한 번 `seed.ts`의 최신 목록으로 바뀐다.
- 휴대폰으로 QR을 찍어 보려면 `localhost` 대신 Vite가 알려 주는 네트워크 주소로 연다.
- push와 PR마다 GitHub Actions가 설치, 타입 검사, 테스트, 빌드, e2e를 돌린다(`.github/workflows/ci.yml`).

### 데모 계정

| 회원 유형 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 협찬 받기 (학생단체, 삼육대 뮤즈) | `muse@syu.ac.kr` | `uniconnect2026` |
| 협찬 하기 (브랜드, 오후의 커피) | `hello@afternoon-coffee.kr` | `uniconnect2026` |

- 로그인할 때 회원 유형도 계정과 같게 고른다. 로그인 창의 `데모 계정으로 체험하기`를 누르면 입력 없이 들어간다(`data/demo.ts`, 시드와 같은지 `lists.sync.test.ts`가 확인).
- 데모 계정은 여러 사람이 함께 쓰므로 예시 데이터 안에서만 움직인다. 탈퇴, 비밀번호 · 이메일 변경, 2단계 인증, 기기 목록, 파일 전송, 신고 · 차단, 협찬 취소, 후기와 답글, 글쓰기, 초대는 막혀 있고 알림 메일도 가지 않는다.
- 시연용 현장 PIN은 데모 행사 가을 버스킹 데이의 직원 `1012`, 단체 `1013`이다.

## 회원 유형별 화면

학생단체와 브랜드는 같은 디자인을 쓰고 메뉴와 기능이 다르다.

| | 학생단체 | 브랜드 |
| --- | --- | --- |
| 대시보드 | 다가오는 행사 현황, 추천 브랜드, 최근 성과 | 답을 기다리는 제안, 협찬별 ROAS, 추천 단체 |
| 찾기 | 추천 매칭: 추천 · 인기 · 전체 · 업종별 · 찜, 검색, 목록 · 지도, 가까운 순(실제 가게) | 단체 찾기: 추천 · 가까운 순 · 행사 임박 · 전체 · 분야별 · 찜, 검색과 규모 · 시기 · 학교 필터, 목록 · 지도 |
| 제안 | 받은 협찬, 보낸 제안, 수락한 협찬의 날짜별 진행 단계 | 받은 제안, 보낸 제안, 수락한 제안의 날짜별 진행 단계 |
| 계약서 | 임시 전자 계약서: 할 일, 확인 방식, 증빙, 인쇄 · PDF | 같음 |
| 일정 | 내 행사 달력 | 행사 일정 달력(예산, 확정된 협찬 일정 포함) |
| 성과 | 행사별 성과와 리포트(PDF, CSV) | 성과 분석: 협찬별 집행액 · 쿠폰 · 방문 · 방문당 비용 · ROAS, 보고서 PDF, CSV |
| 소개 | 소개, 협찬하면 얻는 것, 회원 수 · 활동 · 행사 규모, SNS, 지난 활동 | 소개, 제공 협찬, 위치 · 서비스, 매장 주소, SNS, 포트폴리오 |
| 공통 | 메시지, 모집 게시판, 후기, 알림 | 같음 |

### 화면 주소

| 학생단체 | 브랜드 | 공통 |
| --- | --- | --- |
| `/matches(/<브랜드 id>)`, `/events`, `/measurement`, `/reports` | `/groups(/<단체 id>)`, `/inbox`, `/campaigns`, `/analytics`, `/insights/<협찬 id>` | `/` 소개(회원은 대시보드로), `/dashboard`, `/new`, `/edit/<행사 id>`, `/event/<행사 id>`, `/agreements(/<id>)`, `/board(/<id>)`, `/messages(/<id>)`, `/me`, `/me/edit`, `/council`, `/faq`, `/terms`, `/privacy`, `/admin` |

- 참여자와 가게는 `/check-in/<코드>`(`/staff`, `/group`), `/invite/<코드>`, `/report/<토큰>`으로 들어온다.
- 화면마다 주소가 있어 새로고침과 뒤로 · 앞으로 버튼이 동작한다. 로그인 전에는 주소에 맞는 유형의 화면을 보여 준다. 방문 기록이 지금 주소와 어긋나면 주소를 따른다(`entryView`).
- 옆으로 밀어도 오간다. 왼쪽에서 오른쪽은 이전, 반대는 다음 화면이다(휴대폰 한 손가락, 맥 트랙패드 두 손가락). 화면 가장자리, 팝업 · 메뉴가 열린 때, 입력칸과 가로 스크롤 위에서는 넘어가지 않는다.
- 화면마다 탭 제목과 검색 설명이 있다(`lib/pageMeta.ts`). 없는 주소는 404 화면을 HTTP 404로 보여 준다.

### 방문자와 회원

- 방문자는 `/`에서 소개 페이지(`pages/LandingPage.tsx`)를 보고 데모 데이터로 만든 예시 화면을 둘러본다. 예시 화면에는 `예시 화면` 표시가 붙고 메뉴 숫자 배지는 빠진다.
- 예시의 가까운 순은 삼육대 근처로 가정한 가상 가게 15곳(`data/exampleShops.ts`)을 쓴다. 카카오에 묻지 않고 링크와 전화번호도 없다.
- 제안, 수락, 행사 등록은 로그인 뒤에 한다.
- 가입한 계정에는 가입한 상대만 보이고 시드 · 데모 데이터는 어디에도 나오지 않는다(`lib/catalog.ts`의 `shownTo`). 상대가 없으면 빈 화면이 할 일을 알려 준다(`components/CatalogEmpty.tsx`).
- 로그인 · 로그아웃 때 데이터를 먼저 비우고 새로 불러와 예시가 비치지 않게 한다.
- 새 회원의 대시보드에는 소개 완성 체크리스트가 보인다. 다 채우면 사라지고 `나중에`는 그 브라우저에서 접힌다(`components/ProfileChecklist.tsx`).
- 종에는 실제 소식만 나온다. 읽음은 계정에 저장해 기기끼리 같고(`readNotices`), 새 제안이 오면 다시 읽지 않음이 된다. 일정 알림은 전날과 당일에 다시 뜬다.
- 내 정보의 `목록에서 숨기기`는 내 소개를 상대 목록에서 잠시 뺀다. 새 제안만 막히고 진행 중인 일은 그대로다.
- 찜은 계정에 저장한다(`/api/saved`). 차단 · 탈퇴한 상대는 빠지고 방문자가 누르면 로그인 창이 열린다.

## 기능

### 매칭

**일치율**(55~98%)은 보는 계정 기준으로, 그 계정이 보는 상대 안에서 서버가 계산한다.

| 항목 | 배점 |
| --- | --- |
| 업종 궁합 | 35 |
| 태그 · 분류의 겹치는 낱말 | 15 |
| 협찬 경험(브랜드 이번 학기 협찬 수, 단체 다음 행사 규모) | 20 |
| 함께한 협찬 | 15 |
| 응답 준비(계정과 소개, 단체는 45일 안의 행사) | 15 |

거리와 후기는 점수에 넣지 않는다. 상세 페이지 `매칭 정보` 탭에 높은 이유 두 가지와 항목별 막대(`scoreParts`)가 나온다.

**상세 페이지**는 프로필 형태다. 왼쪽(휴대폰은 위) 카드에 표지, 로고, 협찬, 거리, 다음 행사, 태그, `협찬 제안` · `문의하기`가 있고 넓은 화면에서는 스크롤해도 남는다. `공유하기`는 공유 창이나 링크 복사를 연다.

**가까운 순.** 학생단체 학교는 이메일 도메인(없으면 학교 이름)으로 `data/campuses.ts`에서 찾는다. 지금 노원구 근처 6개 학교가 OpenStreetMap 좌표로 들어 있다. 브랜드 매장 주소는 Nominatim으로 좌표를 찾아 저장한다.

- `NOMINATIM_URL`이 있을 때만 찾고 공개 서버 규칙에 맞춰 요청 사이를 1.1초 이상 띄운다. 출처 `Map data © OpenStreetMap contributors`를 맨 아래에 표시한다.
- 카카오 · 브이월드 지오코더는 저장을 금지해서 쓰지 않는다. 예전에 저장한 카카오 좌표는 서버를 켤 때 지운다.
- 주소를 못 찾으면 주소만 저장하고 거리는 빠진다. 다시 저장하면 다시 찾는다.
- 매장 없는 브랜드와 표에 없는 학교는 목록 뒤쪽에 놓인다.

**학교 근처 가게.** 추천 매칭의 가까운 순은 학교 1.5km 안의 실제 가게를 카카오 로컬로 찾는다. 기본은 전 종류 합쳐 가까운 30곳이고 칩으로 카페 · 음식점 · 편의점 · 학원 · 문화시설을 고른다.

- `KAKAO_REST_API_KEY`가 필요하고 카카오 앱의 카카오맵 사용 설정을 켜야 한다. 꺼져 있으면 403이 오고 서버 로그에 `[places]`가 남는다.
- 카카오는 결과의 저장 · 캐시를 금지한다(장소 ID와 카카오맵 URL 제외). 그래서 매번 새로 묻고 주소당 1분 30회로 제한한다. 전 종류 조회는 5회로 센다.
- 체인 8곳의 로고는 `assets/franchises/`에 있다. 각 회사 상표이므로 출시 전에 사용 허락을 받아야 한다(#109).
- `지도`는 학교를 가운데 둔 약도이고 300m · 600m · 900m · 1.5km로 크기를 맞춘다. 실제 지도는 `KAKAO_JS_KEY`가 있어야 나온다.

**가게 초대.** 학생단체가 `초대하기`를 누르면 QR과 메시지가 담긴 초대장(`/invite/<코드>`)이 생긴다. 가게가 브랜드로 가입해 `우리 가게로 연결하기`를 누르면 카탈로그에 올라가고 초대한 단체에 메일이 간다.

- 초대장에는 카카오가 저장을 허락한 가게 번호와 카카오맵 주소만 남긴다.
- 가게와 브랜드는 1:1로 잇고 단체당 100곳까지 초대한다.
- 가입은 회사 이메일로만 받고 가게 주인을 따로 확인하지는 않는다.

### 제안과 메시지

- 학생단체 → 브랜드는 받은 제안으로, 브랜드 → 학생단체는 받은 협찬으로 도착한다. 수락하면 양쪽에 `협찬 확정`이 보이고 행사가 `집행 예정`이 된다.
- 보내는 쪽에 끝나지 않은 행사나 캠페인이 있어야 한다. 창에서 행사를 고르고 메시지(300자, 비우면 기본 인사말)를 적는다(`modals/ProposeModal.tsx`).
- `검토 중`에서 내가 보낸 제안을 취소한다(`components/SentProposals.tsx`).
- 답 없이 행사 마지막 날이 지나면 `마감`이 되어 수락 · 거절이 막힌다. 다음 행사로 다시 제안할 수 있고 확정된 상대에게도 `다음 일정으로 다시 제안`한다.
- 메시지는 요청을 최대 20초 걸어 두는 롱 폴링이라 답장 · 읽음 · 수정 · 삭제가 바로 보인다. 인스턴스가 여럿이면 2초 안에 전해지고 가려진 탭은 요청을 걸지 않는다.
- 내 메시지는 꾹 누르기 · 우클릭 · ⋯ 버튼으로 고치고 지운다. 양쪽에 `수정됨` · 삭제 표시가 남는다.
- 사진과 2MB 이하 PDF를 보낸다. 사진은 브라우저에서 줄인다. 파일은 계정당 10MB까지이고 지우면 파일도 삭제된다.

### 모집 게시판과 행사 페이지

- `/board`에서 협찬사나 행사를 모집한다(제목 60자, 내용 1000자, 60일 안의 마감일, 열린 글 5개). 상대의 글에 `지원하기`를 누르면 제안이 간다(`postId`). 답을 기다리는 제안이 있으면 막힌다.
- 회원은 회원 글만, 방문자와 데모는 예시 글만 본다. 숨긴 소개의 글은 빠진다.
- `/event/<행사 id>`에는 장소, 소개, 혜택 묶음 4개, 사진 4장을 둔다. 그 단체를 볼 수 있는 상대만 연다. 행사 삭제나 탈퇴 때 사진도 지운다.

### 임시 전자 계약서

확정된 협찬마다 `/agreements/<제안 id>`가 생긴다.

- 흔한 할 일로 시작하고 어느 쪽이든 고칠 수 있다. 고치면 두 쪽 모두 다시 확인한다.
- 자기 할 일에 완료 표시와 링크 5개 · 사진 3장을 붙인다. 사진은 긴 변 1280px 이하로 줄여 `uploads/<제안 id>/`에 두고 두 쪽만 토큰으로 본다. 1시간 백업에는 들어가지 않는다.
- 확인과 수정은 상대에게 메일로 알린다. 계정 없는 상대와의 협찬은 내 쪽만 확인한다.
- `목표 정하기`는 행사를 연 쪽이 행사 전까지 쓴다. 예상 인원, 1인 예상 지출, 협찬 가치, 목표치, 쿠폰, PIN을 정하고 시작 뒤에는 바꿀 수 없다.
- 휴대폰 번호는 확정된 두 회원만 여기서 본다.
- **협찬 취소:** 행사가 끝나기 전에 이유와 함께 요청하고 상대가 동의하면 취소된다. 협찬 기록, 쿠폰 · PIN · 성과, 알림, 후기가 빠지고 계약서는 읽기 전용 기록으로 남는다.
- 어느 한쪽이 탈퇴하면 계약서와 사진도 지운다.

**SNS 게시물 확인.** 학생단체가 계약서에 게시물 링크(https)와 도달 수, 캡처 3장을 올리고(게시물 10개) 브랜드가 `확인`하거나 이유와 함께 `다시 요청`한다(`lib/snsPosts.ts`).

- 확인된 게시물의 도달만 리포트의 도달에 더한다. 목표 양식의 현장 밖 도달 입력칸은 없앴고, 예전에 저장한 숫자는 그대로 더한다. 확인 전 숫자는 패널에 따로 보인다.
- 같은 행사의 여러 계약서에 같은 링크가 있으면 한 번만 센다. 취소된 협찬의 게시물은 세지 않는다.
- `YOUTUBE_API_KEY`가 있으면 유튜브 링크의 공개 조회수를 가져와 적은 숫자 대신 쓴다. 올릴 때 한 번, 그 뒤 하루 한 번 새로 고친다. 비공개 · 삭제된 영상은 `가져올 수 없음`으로 표시하고 적은 숫자를 쓴다.
- 캡처는 증빙 사진처럼 두 쪽만 본다. 고치면 다시 `확인 전`이 된다. 데모 계정은 쓸 수 없다.

### 협찬 확인 방식

계약서 아래에서 방식을 여러 개 고르고 방식마다 확인할 쪽(학생단체 · 브랜드 · 모두)을 정한다(`lib/methods.ts`, `data/methods.ts`).

| 방식 | 세는 것 | 처음 확인하는 쪽 |
| --- | --- | --- |
| QR 체크인 | 행사장 QR 스캔 (자동) | 학생단체 |
| 쿠폰 발급 | 쿠폰 수령 (자동, QR과 함께) | 브랜드 |
| 매장 방문 | 직원이 쿠폰 번호로 확인 (쿠폰과 함께) | 브랜드 (고정) |
| 샘플링 · 시음 | 수량 (한 번에 1~500개) | 브랜드 |
| 부스 방문 · 스탬프 | 한 명씩 | 학생단체 |
| SNS 인증 | 한 건씩 | 학생단체 |
| 설문 응답 | 한 건씩 | 학생단체 |
| 현장 구매 · 영수증 | 한 건씩 | 브랜드 |
| 굿즈 · 사은품 지급 | 수량 (한 번에 1~500개) | 브랜드 |
| 경품 응모 · 추첨 | 한 건씩 | 학생단체 |
| 회원 가입 · 앱 설치 | 한 명씩 | 브랜드 |
| 체험 · 시연 참여 | 한 명씩 | 브랜드 |

- 두 쪽이 계약서를 모두 확인해야 확정된다(`confirmedMethods`). 그 전에는 QR · 쿠폰 · 방문으로 센다.
- 행사 전까지 바꿀 수 있고 바꾸면 다시 확인한다. 시작 뒤에는 바꿀 수 없다.
- 쿠폰이 없는 협찬은 참여 화면에 쿠폰이 없고 방문이 없으면 직원 화면에서 방문을 받지 않는다.
- 현장 확인 화면은 쪽마다 따로다. 브랜드는 `/check-in/<코드>/staff`와 직원 PIN, 학생단체는 `/group`과 단체 PIN(`groupPin`)을 쓴다. PIN을 넣으면 그 쪽 방식만 버튼으로 나오고 `되돌리기` · `빼기`로 고친다.
- 집계는 계약서, 성과, 리포트, 성과 분석, PDF에 들어간다. 브랜드 캠페인은 한 묶음으로 잰다.
- 예전 방식 데이터는 불러올 때 서버가 바꾼다.

### 현장 QR 참여

- `현장 QR 열기`의 QR을 찍으면 `/check-in/<코드>`가 열리고 스캔이 기록된다.
- 참여자는 쿠폰 번호(`UC-XXXXXX`)를 받아 매장에서 보여 준다. 직원은 자기 기기에서 4자리 PIN과 번호를 넣는다. 참여자 휴대폰은 PIN을 다루지 않는다.
- 쿠폰은 스캔당 하나, 방문은 쿠폰당 한 번 센다. 같은 휴대폰이 다시 열어도 한 번만 집계한다.
- 받는 기간: QR · 쿠폰 · 현장 기록은 행사 기간과 다음 날, 방문은 그 뒤 7일까지다. 데모 행사는 언제든 받는다.
- 틀린 PIN은 주소당 15분 10회, 행사당 15분 30회까지다. 한 행사 기록은 2만 건까지이고 기간이 지난 일회용 코드는 서버를 켤 때 지운다.
- **협찬사별 분리:** 협찬사마다 쿠폰, PIN, 집계를 따로 둔다. 다른 매장 쿠폰은 거절한다. 첫 협찬사는 기존 집계를 이어받고 나머지는 0부터 센다. 협찬 가치의 합은 행사의 협찬 가치와 같아야 하고 정하기 전에는 똑같이 나눈다.
- 브랜드도 캠페인마다 성과 분석의 `캠페인 현장 측정`으로 같은 방식을 쓴다.

### 성과와 후기

- 행사마다 측정이 쌓이고 처음에는 가장 최근 행사를 연다. 시작 전에는 `진행 전`, 끝나면 `진행 완료`로 보인다.
- 도달 = QR 스캔 + 현장 밖 도달 + 브랜드가 확인한 게시물 도달. ROAS = 방문 수 × 1인 예상 지출 ÷ 협찬 가치.
- 성과 분석에는 행사 날이 지난 협찬이 나오고 단체의 측정과 협찬 가치, 목표 ROAS를 따른다.
- CSV는 브라우저에서 만든다(`lib/csv.ts`). UTF-8 BOM을 붙이고 `=` `+` `-` `@`로 시작하는 값 앞에 `'`를 붙인다.
- **후기:** 행사 날부터 별점(1~5), 태그 3개, 한 줄(300자)을 남기고 고치거나 지운다. 상세 페이지 `파트너 후기`와 카드 별점에 공개되고 받은 쪽에 메일이 간다. 재협찬 의향은 '다시 함께하고 싶어요'의 비율이다.
- **답글:** 받은 쪽이 후기마다 하나(300자)를 단다. 후기를 내리면 답글도 숨겨진다.
- 쓴 회원이나 받은 회원이 탈퇴하면 후기도 지운다.

### 일정과 메일

메일은 [Resend](https://resend.com)로 보낸다. `RESEND_API_KEY`와 `MAIL_FROM`이 있어야 나가고 없으면 서버 로그에 `[mail]`로 남는다. 보낼 도메인 인증이 필요하고 알림 메일이 실패해도 제안 · 답 · 메시지는 처리된다.

- 알림 메일: 새 제안, 수락 · 거절, 새 메시지(상대가 읽기 전까지 한 통), 계약서 · 취소 · 행사 변경 · 후기. `SITE_URL`이 있으면 링크가 들어간다.
- `받을 메일`에서 종류별로 끈다. 인증번호와 계정 안내 메일은 언제나 간다. 메일 언어는 계정의 언어를 따른다(`backend/src/i18n/en.ts`).
- 일정 알림: 사흘 안의 행사를 주인과 협찬 브랜드에게 한 번 보내고 종에도 표시한다(`lib/reminders.ts`). 서버를 켤 때와 1시간마다 돌고 Vercel에서는 매일 오전 9시 Cron으로 돈다.
- 주간 추천: 월요일마다 지난주에 가입한 상대 중 일치율 높은 3곳을 보낸다(`lib/digest.ts`). 새 상대가 없으면 보내지 않는다.
- **인증번호 노출:** `EXPOSE_EMAIL_CODES=true`면 가입 인증번호를 화면에 보여 준다. 누구나 아무 이메일로 가입하게 되므로 시연용으로만 켠다. 재설정 번호는 어떤 경우에도 화면에 보이지 않는다. `npm run dev`는 `backend/dev.env`로 켠다.
- **캘린더에 추가:** 공유 창처럼 생긴 창에서 일정과 앱을 고른다(`modals/CalendarModal.tsx`, `lib/calendarApps.ts`). Google · Outlook은 추가 화면을, Apple · 다른 앱은 .ics를 연다. 휴대폰의 진짜 공유 창은 .ics를 제대로 넘기지 못해서 쓰지 않는다.
- **구독 링크:** 비밀 주소(`/api/calendar/<링크>.ics`)로 내 행사와 확정된 협찬의 날(90일 전부터)을 구독한다. 바꾸거나 지우면 예전 링크는 404가 된다.

### 계정과 보안

- 가입: 단체 · 브랜드명, 분류(묶음으로 단체 20가지, 업종 21가지, `data/roles.ts`와 `lib/validation.ts`), 담당자 이름, 직책, 휴대폰 번호, 만 14세 이상 확인. 학생단체는 학교도 받는다. 분류는 8가지 업종으로 일치율을 계산한다(`lib/catalog.ts`).
- 비밀번호: 8~64자, 영문 · 숫자 · 특수문자 포함, 공백 없음(`checkPassword`, `lib/password.ts`). 기존 계정은 예전 비밀번호로 로그인한다. 칸의 눈 버튼으로 글자를 확인한다.
- 비밀번호 찾기 · 변경과 로그인 이메일 변경은 다른 기기를 로그아웃한다. 이메일을 바꾸면 임원 교체에 쓸 수 있고 예전 이메일로 알림이 간다.
- 2단계 인증: 인증 앱(TOTP)과 일회용 복구 코드 10개. 코드는 30초마다 바뀌고 다섯 번 틀리면 비밀번호부터 다시 넣는다.
- 소셜 로그인: 키가 있으면 카카오 · 네이버 버튼이 생긴다. 가입은 이메일로 하고 내 정보에서 연결한 계정만 로그인된다. 연결 안 된 계정은 그 앱 연결을 바로 끊는다. Redirect URI는 `SITE_URL/api/auth/social/<kakao|naver>/callback`이고 회원 번호만 받는다.
- 함께 관리하는 사람: 대표가 임원 5명까지 초대한다. 탈퇴, 이메일 변경, 2단계 인증, 공동 관리자 관리는 대표만 한다. 알림 메일은 대표에게만 간다.
- 학생회 연결: 학생회 코드를 소속 동아리가 넣으면 학생회가 행사, 제안 수, 협찬 수, 측정 숫자를 읽기 전용으로 본다(`/council`). 어느 쪽이든 끊을 수 있다.
- `로그인한 기기`에서 기기별로 로그아웃한다.
- 로그인 토큰은 sha256 해시로만 저장한다. 모든 응답에 CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy를 붙이고 production에서는 HSTS도 붙인다.
- 로고는 브라우저에서 256px WebP로 줄이고 서버는 PNG · JPG · WebP 약 100KB까지 받는다. SVG는 받지 않는다.
- 신고 · 차단: 사유와 설명은 운영자에게만 가고 신고한 글은 그때 그대로 남긴다. 차단하면 서로 보이지 않고 제안과 메시지가 막힌다. 확정된 협찬은 그대로다.
- 내 정보의 `내 데이터 내려받기`는 JSON 하나를 준다(참여자 기록 제외, 사진은 이름만). `회원 탈퇴`는 비밀번호를 다시 넣으면 계정과 관련 데이터를 바로 지운다.

### 요청 제한

주소별로 세고 넘으면 `429`를 준다. `DATABASE_URL`이 있으면 Postgres `uniconnect_limits`에서 함께 세고(주소 · 이메일은 해시), DB가 1.5초 안에 답하지 않으면 메모리에서 센다. 메시지와 제안은 계정별로, 데모 계정은 계정과 주소를 함께 센다.

| 대상 | 제한 |
| --- | --- |
| 로그인 | 주소 · 이메일 실패 10회 / 15분 |
| 인증번호 받기 | 주소 20회 / 15분, 이메일 5회 / 30분 |
| 인증번호 확인 | 주소 30회 / 15분, 틀린 횟수 5회는 30분 유지 |
| 메시지 | 계정 20개 / 1분, 300개 / 1시간 |
| 협찬 제안 | 계정 30회 / 1시간 |
| 관리자 API | 주소 실패 10회 / 15분 |
| 현장 기록 | 주소 120회 / 1분 |
| 학교 근처 가게 | 주소 30회 / 1분 |

프록시 뒤에서는 `TRUST_PROXY`에 프록시 수나 주소를 넣는다. `true`는 주소 위조를 허용해 제한을 우회하게 하므로 쓰지 않는다.

### 수익 모델과 결제

학생단체는 상단 광고만 내고 나머지는 브랜드가 낸다. 금액은 모두 부가세 별도이고 주문할 때 10%를 더해 청구한다(`lib/billing.ts`의 `prices`, `vatOf`). 결제마다 공급가액(`supply`)을 남기고 수수료 잔액은 공급가액으로 센다.

| 상품 | 가격 | 내용 |
| --- | --- | --- |
| 성사 수수료 | 협찬액의 15% | 계약서의 협찬액(현금 + 현물) 기준. 결제해야 브랜드가 계약서를 확인한다. 협찬액을 올리면 차액을 내고 환불하면 확인이 풀린다 |
| 상세 성과 리포트 | 협찬 1건 50,000원 | `/insights/<협찬 id>`의 12쪽 분석, PDF, 읽기 전용 공유 링크 `/report/<토큰>`(`lib/premiumReport.ts`). 처음 열기 전에만 환불 |
| 캠퍼스 파트너스 | 30일 300,000원 | 제안 무제한(무료 월 5건, `freeOffersPerMonth`), 리포트 전부, `캠퍼스 포트폴리오`(`lib/portfolio.ts`), 1:1 섭외 요청 월 2건, `PARTNERS` 표시(`lib/pro.ts`, 데이터 이름 `pro`) |
| 상단 광고 | 30일 브랜드 99,000원 · 단체 10,000원 | 상대 쪽 목록 맨 앞에 AD 표시와 함께 노출(`lib/ads.ts`). 진행 중 연장은 10% 할인 |

- 결제는 토스페이먼츠 카드 결제창이다. 돌아오면 서버가 금액을 주문과 맞춰 본 뒤 승인 API로 확정한다. 키가 없으면 계좌 입금을 요청하고 운영자가 `/admin`에서 확인 · 취소 · 환불한다. 자동결제는 없다.
- 협찬금은 브랜드가 단체에 직접 주고 플랫폼은 맡지 않는다(에스크로 없음).
- `test_` 키가 있으면 데모 브랜드도 끝까지 결제해 본다(돈은 빠져나가지 않음). 키가 없거나 `live_` 키면 데모 계정은 결제할 수 없다.
- 결제 기록은 탈퇴 후에도 5년 보관한다. 환불 규정은 약관 `/terms#paid`에 있다.
- 정식 결제에는 사업자등록, 통신판매업 신고, 토스페이먼츠 계약 뒤 라이브 키가 필요하다(#216).

### 운영

- `ADMIN_TOKEN`을 설정하고 메뉴에 없는 `/admin`에 토큰을 넣어 들어간다. 토큰은 그 탭에만 남는다.
- 콘솔은 지표(실제 회원 기준, 작은 글씨는 데모 포함), 회원, 제안, 협찬, 현장, 결제, 문의, 신고, 콘텐츠, 공지, 활동 기록, 서비스 상태, 점검 모드, 데모 초기화, 백업을 다룬다.
- 정지된 계정은 로그인과 메일이 막히고 목록에서 빠진다. 내린 후기는 다시 고쳐도 내려간 채로 남는다.
- `최근 오류`에는 500대 응답과 화면 오류 200개가 남는다(`errors.json` 또는 `uniconnect_errors`). 내용, 위치, 주소, 시각만 남기고 개인정보는 넣지 않는다. `OPERATOR_EMAIL`이 있으면 한 시간 조용하다가 새 오류가 날 때 메일을 보낸다.
- FAQ의 `관리자에게 질문하기`로 온 질문에 답하면 메일과 종으로 알린다.
- 이용약관과 개인정보 처리방침은 시연용 초안이다. 출시 전에 운영 주체, 연락처, 보호책임자를 정하고 법률 검토를 받는다(#104).

## 디자인

'연결'을 주제로 [getlayers.ai](https://www.getlayers.ai/templates) 프롬프트를 옮긴 밝은 테마다. 흰 바탕, 은색 면, 얇은 선, 짙은 파란색 포인트를 쓰고 글자는 슬레이트 회색이다.

| 프롬프트 | 쓰인 곳 | 담은 뜻 |
| --- | --- | --- |
| Antipode | 소개 · 대시보드 첫 화면, 상세 배너 | 맞닿음 |
| Stride | 알약 헤더, 줄어드는 첫 화면, 로고 띠, 벤토, 크롬 체인 협찬 단계, 메시 푸터 | 이어짐 |
| Interference | 리포트 · 성과의 숫자 패널 | 함께라서 생기는 힘 |
| ShaderGradient | 로그인 · 회원가입 팝업 머리 | |

- 시작 화면은 로고가 연결고리로 그려지는 애니메이션이고 브라우저의 첫 방문에만 재생한다.
- 로고는 학교와 가게를 U자로 잇는다. 학생단체 쪽은 짙은 파란색, 브랜드 쪽은 은색이고 짙은 화면 위에서는 흰색이다.
- 목표를 달성한 그래프는 짙은 파란색, 아직이면 은색이다. 기준선은 흰 테두리의 주황빛이다. 일치율 링은 높을수록 짙어진다.
- 글꼴은 Pretendard 가변 글꼴이다. 700 제목 · 숫자, 500 본문, 600 라벨 · 버튼, 800 배지, 900 푸터 워드마크, 200 장식 문구로 나눈다.
- 본문 폭은 최대 1240px이고 카드는 한 줄에 넷까지 놓인다. 1360px보다 좁으면 일정과 유형 전환이, 1100px보다 좁으면 메뉴도 Menu 버튼으로 옮겨 간다. 휴대폰에서는 카드 한 줄에 하나, 팝업은 아래에서 올라온다.
- 움직이는 배경 위 글자는 남색 그늘이나 유리 위에 둬서 대비 기준을 지킨다.
- 동작 줄이기를 켜면 로딩 화면을 생략하고 움직임을 멈춘다. WebGL이 없으면 같은 색의 정지 배경이 보인다.
- 화면은 한국어와 영어로 나온다. 처음에는 브라우저 언어를 따르고 고른 언어를 기억한다.

### 가벼운 첫 화면

- three.js(압축 약 180KB)는 3D 장면 가까이 스크롤할 때 받는다.
- 데이터 절약, 3G 이하, CPU로 그리는 WebGL 환경에서는 정적 배경을 쓰고 three.js를 받지 않는다(`failIfMajorPerformanceCaveat`, `lib/lite.ts`). PageSpeed 테스트 서버도 여기에 속한다.
- 시작 로고는 첫 큰 그림이라 `index.html`에서 미리 받는다. 예시 그림은 화면 가까이 와야 받는다.

## 검색 노출

- 공개 화면은 검색엔진에 나온다(`.figma/make/site.json`의 `robots.index`). 계정마다 다른 화면, 계약서, 초대장, 체크인, 404는 `noindex`다(`lib/pageMeta.ts`).
- `robots.txt`는 `/api/`, `/check-in/`, `/invite/`를 빼고 허용한다. `/sitemap.xml`은 빌드할 때 만들고 `lib/sitemap.test.ts`가 확인한다. 사이트 주소가 바뀌면 `url`과 robots.txt를 함께 바꾼다.
- `site.json`의 `verification.naver` · `verification.google`에 코드를 넣으면 확인용 메타 태그가 들어간다. 배포한 뒤 각 콘솔에서 소유를 확인하고 사이트맵을 제출한다.
- `site.json`에는 GA4 ID(`G-WK2GL8CB83`, 보관 기간은 GA 관리에서 14개월로 설정)와 공유 이미지 절대 주소도 있다.
- `frontend/public/llms.txt`는 AI 에이전트에게 서비스를 소개한다.

## 배포

### Vercel

화면(`frontend/dist`)은 Vercel이 내보내고 API는 함수 하나(`api/index.mjs` → `backend/src/vercel.ts`)로 돈다. 설정은 모두 `vercel.json`에 있고 main에 합치면 자동 배포된다.

새로 만들 때의 순서다.

1. Vercel에서 `jennjeong/uniconnect`를 가져온다. Framework는 `Other`, Root는 `./`, Node.js는 22.x다. 빌드 명령은 비워 둔다.
2. `Storage`에서 **Neon**을 **Singapore**로 만들어 연결한다. `DATABASE_URL`이 자동으로 들어가고 함수도 같은 `sin1`에서 돈다.
3. 환경 변수에 `CRON_SECRET`, `ADMIN_TOKEN`, `SITE_URL`, `KAKAO_REST_API_KEY`, `NOMINATIM_URL`, 메일 설정(또는 시연용 `EXPOSE_EMAIL_CODES=true`)을 넣는다.
4. 배포한 뒤 데모 로그인과 가입, 제안, 메시지가 남는지 확인한다. 첫 요청 때 데모 데이터가 만들어진다.

자체 서버 한 대로 돌릴 때는 `DATA_FILE`이 디스크에 남는 곳에서 실행한다.

### 저장과 백업

- `DATABASE_URL`이 있으면 Postgres에 문서 하나(`uniconnect_store`), 사진(`uniconnect_photos`), 백업(`uniconnect_backups`)을 둔다. 없으면 JSON 파일이다.
- 저장마다 버전이 오르고 먼저 저장한 인스턴스가 있으면 되돌린 뒤 "다시 시도해 주세요"로 답한다. 각 인스턴스는 요청을 받을 때 2초에 한 번 버전을 확인한다.
- 백업은 1시간마다 최근 24개를 남긴다. 파일 저장소는 `backups/db-YYYY-MM-DD-HH.json`(UTC)을 데이터 파일 자리에 복사하고 다시 켜면 되돌아간다. Vercel은 Neon 복원이나 `uniconnect_backups`를 쓴다.

### Vercel에서 알아 둘 점

- `vercel.json`의 `rewrites`는 `backend/src/lib/appPaths.ts`와 같아야 한다(`appPaths.sync.test.ts`). 없는 주소는 `404.html`로 답한다.
- `trailingSlash: false`로 끝의 `/`를 빼서 308 리디렉트한다.
- 사용자 주소는 Vercel이 넣어 주는 값으로 읽는다(`TRUST_PROXY` 기본 1).
- PR마다 미리보기가 Neon 브랜치(`preview/<PR 브랜치>`)를 만든다. 무료 플랜은 10개까지라 PR이 닫히면 `.github/workflows/neon-preview-cleanup.yml`이 그 브랜치를 지운다. 저장소 시크릿 `NEON_API_KEY`가 필요하고 없으면 안내만 남긴다. 운영 · 보호 브랜치는 건드리지 않는다.

### 앱 설치

사이트는 웹페이지로 열리고 원하면 앱으로 설치한다(`manifest.webmanifest`, `public/icons/`, `public/sw.js`).

- `앱 다운로드`는 설치 창을 띄우거나 기기에 맞는 안내를 보여 준다(`modals/InstallGuideModal.tsx`). 카카오톡 안에서는 다른 브라우저로 넘긴다. 설치한 앱에서는 버튼이 없다.
- Chrome 139부터 데스크톱에서는 설치하면 링크가 앱 창에서 열린다. 사이트가 끌 수 없어서 앱 설정을 바꾸거나 `chrome://apps`에서 삭제한다. 바로가기만 지우면 다시 생긴다.
- 서비스 워커는 API를 저장하지 않고 페이지는 늘 새로 받는다. 해시가 붙은 빌드 파일만 최근 80개 저장하고 오프라인에는 마지막 화면 틀을 쓴다. 개발 서버에서는 등록하지 않는다.

## 환경 변수

개발 키는 `backend/.env.local` 한 파일에 둔다(git 제외). 비워 둔 키의 기능은 꺼진 채로 돌고 테스트는 키 없이 돈다. 운영 키는 Vercel에 둔다. `backend/.env.example`에는 값을 적지 않고 토스는 테스트 키만 쓴다.

```bash
cp backend/.env.example backend/.env.local
```

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `API_PORT` · `PORT` | `4000` · 없음 | API 포트, production 포트 |
| `DATA_FILE` | `backend/data/db.json` | 데이터 파일 (`DATABASE_URL`이 없을 때) |
| `DATABASE_URL` | Neon 연결이 넣음 | Postgres 주소 (`POSTGRES_URL`도 읽음) |
| `CRON_SECRET` | 없음 | Cron 인증. 없으면 `/api/cron/reminders`가 닫힘 |
| `ADMIN_TOKEN` | 없음 | 관리자 API 토큰. 없으면 닫힘 |
| `CORS_ORIGIN` | 없음 | 웹을 다른 주소에 둘 때 허용할 origin |
| `VITE_API_URL` | 비어 있음 | 프론트가 부를 API origin |
| `TRUST_PROXY` | 없음 (Vercel `1`) | 프록시 수 또는 주소. `true` 금지 |
| `SITE_URL` | 없음 | 메일 링크와 소셜 로그인 주소 |
| `RESEND_API_KEY` · `MAIL_FROM` | 없음 | 메일 발송 |
| `EXPOSE_EMAIL_CODES` | `false` (dev `true`) | 가입 인증번호를 화면에 표시, 시연용 |
| `OPERATOR_EMAIL` | 없음 | 오류 알림 받을 주소 |
| `KAKAO_REST_API_KEY` | 없음 | 학교 근처 가게 검색 |
| `KAKAO_JS_KEY` | 없음 | 실제 카카오 지도 (없으면 약도) |
| `KAKAO_LOGIN_CLIENT_ID` · `KAKAO_LOGIN_CLIENT_SECRET` | 없음 | 카카오 로그인 |
| `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` | 없음 | 네이버 로그인 |
| `NOMINATIM_URL` | 없음 (dev 켬) | 주소를 좌표로 바꾸는 서버 |
| `NTS_SERVICE_KEY` | 없음 | 공공데이터포털 국세청 사업자 진위확인 키. 있으면 브랜드가 `사업자 확인`을 쓴다 |
| `YOUTUBE_API_KEY` | 없음 | YouTube Data API v3 키. 있으면 SNS 게시물의 유튜브 조회수를 가져온다 |
| `TOSS_CLIENT_KEY` · `TOSS_SECRET_KEY` | 없음 | 토스페이먼츠 키. 시크릿은 서버에만 둔다 |
| `FEES_SINCE` | `2026-11-01` | 이 날짜(한국) 이후 수락된 협찬부터 수수료. 브라우저 테스트만 바꾼다 |

GitHub 저장소 시크릿에는 `NEON_API_KEY`를 둔다.

## API

로그인이 필요한 요청은 `Authorization: Bearer <token>`을 보낸다. 오류는 `{ "error": "메시지" }`로 돌려준다. 운영자 API는 `X-Admin-Token`을 쓴다. 데모 계정의 쓰기는 대부분 403이다. 주소는 모두 `/api`로 시작한다.

### 계정

| 메서드 | 경로 | 설명 | 로그인 |
| --- | --- | --- | --- |
| GET | `/health` | 상태 확인 | |
| POST | `/auth/email-code`, `/auth/email-code/verify` | 가입 인증번호 발송, 확인 → `verificationToken` | |
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | 가입, 로그인 → `{ token, account }`, 로그아웃 | |
| POST | `/auth/login/code` | 2단계 인증의 두 번째 단계 `{ email, ticket, code }` | |
| POST | `/auth/password-reset/code`, `/auth/password-reset` | 재설정 번호 발송, 새 비밀번호 설정 | |
| GET | `/auth/me`, `/auth/export` | 내 계정, 내 데이터 JSON | 필요 |
| DELETE | `/auth/account` | 탈퇴 `{ password }` | 필요 |
| POST | `/auth/email/code`, `/auth/email` | 로그인 이메일 변경 번호 발송, 변경 | 필요 |
| PUT | `/auth/preferences`, `/auth/notices` | 받을 메일 · 언어, 읽은 알림 | 필요 |
| POST | `/auth/two-factor/setup` · `enable` · `disable` | 2단계 인증 준비, 켜기, 끄기 | 필요 |
| GET · DELETE | `/auth/sessions(/:id)` | 기기 목록, 기기 로그아웃 | 필요 |
| GET | `/auth/social` | 켜진 소셜 로그인 | |
| POST | `/auth/social/:provider/start`, `/auth/social/complete` | 시작 `{ intent }`, 쿠키 코드로 로그인 완료 | 연결 때 |
| GET · DELETE | `/auth/social/:provider/callback`, `/auth/social/:provider` | 콜백, 연결 끊기 | 끊을 때 |
| GET · POST · DELETE | `/team`, `/team/invites(/:id)`, `/team/members/:id` | 공동 관리자 조회, 초대, 취소, 빼기 | 필요 |
| POST | `/team/join` | 초대받은 사람의 합류 | |
| GET · POST · DELETE | `/council/clubs(/:id)`, `/council/code`, `/council/links(/:id)` | 학생회 연결 | 필요 |

### 찾기와 제안

| 메서드 | 경로 | 설명 | 로그인 |
| --- | --- | --- | --- |
| GET | `/matches?role=`, `/brands`, `/groups` | 추천 3곳, 전체 목록(일치율, `scoreParts`, `distanceKm`) | |
| GET | `/places?category=` | 학교 근처 실제 가게, 방문자는 가상 가게 | |
| POST | `/invites` | 가게 초대장 만들기 `{ placeId }` | 필요 |
| GET · POST | `/invites/:code`, `/invites/:code/accept` | 초대장, 그 가게가 되기 | 받을 때 |
| GET | `/proposals`, `/requests`, `/offers` | 보낸 제안, 브랜드가 받은 제안, 단체가 받은 협찬 | |
| POST · DELETE | `/proposals`, `/proposals/:matchId` | 제안 `{ matchId, eventId?, message?, postId? }`, 취소 | 필요 |
| POST | `/requests/:id/accept` · `decline`, `/offers/:id/accept` · `decline` | 수락, 거절 | 필요 |
| GET · POST · PUT · DELETE | `/board(/:id)`, `/board/:id/close` | 모집 글 조회, 쓰기, 고치기, 마감, 지우기 | 쓸 때 |
| GET · PUT · DELETE | `/saved(/:listingId)` | 찜 | 필요 |
| GET · POST · DELETE | `/blocks(/:listingId)` | 차단 | 필요 |
| POST | `/reports` | 신고 | 필요 |

### 행사와 측정

| 메서드 | 경로 | 설명 | 로그인 |
| --- | --- | --- | --- |
| GET | `/events?role=`, `/events/explore` | 행사 · 캠페인 목록, 둘러보기 | |
| POST · PUT · DELETE | `/events(/:id)` | 등록, 수정(시작한 행사의 날짜 변경은 409), 삭제 | 필요 |
| GET | `/events/:id/page`, `/events/:id/photos/:photo` | 행사 상세, 사진 | 선택 |
| POST · DELETE | `/events/:id/photos(/:photo)` | 사진 올리기, 지우기 | 필요 |
| GET · POST · DELETE | `/events/:id/plan` | 행사 기획안 파일 | 필요 |
| GET | `/measurements(/:eventId)`, `/measurements/:eventId/log?kind=` | 측정과 리포트, 참여 기록 | |
| PUT | `/measurements/:eventId/goals` | 목표 저장 | 필요 |
| GET | `/analytics` | 브랜드의 협찬별 성과 | |
| GET · PUT · POST · DELETE | `/ledger`, `/ledger/link`, `/ledger/public/:token` | 협찬 기록, 공유 링크 | 공개 링크 제외 |
| GET | `/check-in/:code` | 참여 화면 정보 | |
| POST | `/check-in/:code/:kind`, `/check-in/:code/survey` | `scans` · `coupons` · `visits` 기록, 설문 | |
| POST | `/check-in/:code/staff/visits` | 직원 PIN과 쿠폰 번호로 방문 확인 | |
| POST | `/check-in/:code/(staff\|group)/session` · `count` | 현장 확인 화면 열기, 기록(되돌릴 때 음수) | |

### 계약서와 후기

| 메서드 | 경로 | 설명 | 로그인 |
| --- | --- | --- | --- |
| GET | `/agreements(/:id)` | 내 계약서 목록, 계약서(처음 열면 생성, `measure` 포함) | 필요 |
| PUT | `/agreements/:id/items`, `/agreements/:id/methods`, `/agreements/:id/value` | 할 일, 확인 방식, 협찬액 | 필요 |
| POST | `/agreements/:id/confirm` | 확인, 두 쪽이 다 하면 방식 확정 | 필요 |
| POST · DELETE | `/agreements/:id/cancel`, `/agreements/:id/cancel/accept` | 취소 요청, 동의, 거두기 · 거절 | 필요 |
| POST · PUT · DELETE | `/agreements/:id/sns-posts(/:postId)` | SNS 게시물 올리기, 고치기, 지우기 (학생단체) | 필요 |
| POST | `/agreements/:id/sns-posts/:postId/confirm` · `reject` | 확인, 다시 요청 `{ reason }` (브랜드) | 필요 |
| POST · DELETE | `/agreements/:id/sns-posts/:postId/photos(/:photo)` | 캡처 올리기, 지우기 | 필요 |
| PATCH | `/agreements/:id/items/:itemId` | 완료 `{ done }`, 증빙 `{ links }` | 필요 |
| GET · POST · DELETE | `/agreements/:id/items/:itemId/photos(/:photo)`, `/agreements/:id/photos/:photo` | 증빙 사진 | 필요 |
| GET | `/reviews?about=` | 받은 후기와 요약 | |
| PUT · DELETE | `/reviews/:proposalId`, `/reviews/:proposalId/reply` | 후기, 답글 | 필요 |

### 소개, 메시지, 일정

| 메서드 | 경로 | 설명 | 로그인 |
| --- | --- | --- | --- |
| GET · PUT | `/profile` | 내 소개 | 필요 |
| PUT | `/profile/pause` | 목록에서 숨기기 `{ paused }` | 필요 |
| GET · POST | `/profile/business` | 사업자 확인(키가 없으면 503, 1시간 10번) | 필요 |
| GET · POST | `/conversations` | 대화 목록, 시작 `{ partnerId }` | 필요 |
| GET | `/conversations/:id?since=` | 메시지와 `stamp`, `since`가 있으면 최대 20초 대기 | 필요 |
| POST · PUT · DELETE | `/conversations/:id/messages(/:messageId)` | 보내기(1,000자), 고치기, 지우기 | 필요 |
| GET · POST | `/conversations/:id/attachments(/:file)` | 사진 · PDF 받기, 보내기 | 필요 |
| GET · POST · DELETE | `/calendar/feed` | 구독 링크 | 필요 |
| GET | `/calendar/:link.ics` | 구독용 iCalendar | |
| GET · POST | `/inquiries`, `/inquiries/read` | 내 질문, 질문하기(5~1,000자), 답변 읽음 | 필요 |
| GET · POST | `/announcements`, `/announcements/:id/dismiss` | 공지, 닫기 | |
| GET · POST | `/site`, `/site/searches` | 점검 · 가입 상태 등 사이트 상태, 검색어 집계 | |
| POST | `/errors` | 화면 오류 보고(주소당 10분 30번) | |
| GET | `/cron/reminders` | Cron 전용 (`CRON_SECRET`) | |

### 결제

| 메서드 | 경로 | 설명 | 로그인 |
| --- | --- | --- | --- |
| GET | `/billing` | 가격, 카드 사용 여부, 테스트 모드와 내 결제 | 필요 |
| POST · DELETE | `/billing/orders(/:id)` | 주문 만들기, 지우기 | 필요 |
| POST | `/billing/orders/:id/transfer`, `/billing/confirm` | 계좌 입금 요청, 카드 승인 | 필요 |
| POST | `/billing/partner-requests` | 1:1 섭외 요청 | 필요 |
| GET · PUT | `/insights/:id`, `/insights/:id/lift` | 상세 리포트, 평소 방문객 입력 | 필요 |
| POST · DELETE | `/insights/:id/share` | 공유 링크 | 필요 |
| GET | `/insights/shared/:token` | 공유된 리포트 | |

### 운영자 (`/admin`)

| 영역 | 경로 |
| --- | --- |
| 지표 | `GET /stats`, `/overview`, `/insights`, `/live`, `/log`, `/health`, `/system` |
| 회원 | `GET /accounts(/:id)`, `POST /accounts/:id/suspend` · `unsuspend` · `logout` · `partners`, `POST /accounts/bulk`, `PUT /accounts/:id/note` · `tags` · `business` |
| 협찬 | `GET /proposals(/:id)`, `/proposals/stale`, `/agreements`, `/events`, `/invites`, `POST /proposals/:id/nudge` |
| 결제 | `GET /payments`, `POST /payments/:id/paid` · `cancel` |
| 지원 | `GET /inquiries`, `POST /inquiries/:id/answer`, `PUT /inquiries/:id/handling`, `GET /reports`, `POST /reports/:id/resolve`, `GET /errors` |
| 콘텐츠 | `GET /posts`, `/reviews`, `POST /posts/:id/:action`, `/reviews/:id/:action`, `GET · POST · DELETE /faq(/:id)`, `PUT /faq/hidden` |
| 설정 | `GET · POST /announcements`, `POST /announcements/:id/end`, `PUT /settings/kpi` · `maintenance`, `POST /demo/reset`, `GET /backups/:hour` |

## 구조

```text
.
├── frontend/src/
│   ├── App.tsx            화면 상태, API 호출, 페이지 · 모달 전환
│   ├── api/               fetch 래퍼와 엔드포인트 함수
│   ├── pages/ modals/ layout/ components/
│   ├── scenes/            WebGL 장면
│   ├── report/            PDF 문서
│   ├── i18n/              영어 문구
│   ├── data/ lib/ hooks/  메뉴, 주소(route.ts), 스와이프(swipe.ts), 계산 함수
│   └── index.css          전역 스타일 (Tailwind v4)
├── backend/src/
│   ├── index.ts           서버 한 대로 운영할 때의 시작점
│   ├── vercel.ts          Vercel 함수의 시작점
│   ├── app.ts             라우터 연결, 오류 처리, 빌드된 웹 제공
│   ├── routes/ middleware/ lib/
│   ├── data/seed.ts       데모 데이터
│   ├── store.ts           메모리의 데이터, 저장, 되돌리기
│   └── app.test.ts · store.postgres.test.ts
├── api/index.mjs          Vercel API 함수
├── vercel.json            빌드, 주소 규칙, 보안 헤더, 지역, Cron
└── pnpm-workspace.yaml
```
