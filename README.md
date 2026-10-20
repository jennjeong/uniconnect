# uniconnect

학생단체와 브랜드를 연결하는 협찬 매칭 서비스 **유니커넥트**의 웹/앱 프로토타입입니다.
Figma Make 프로젝트 [Create Web/App Service](https://www.figma.com/make/mhCaKcZdpbXcN9ZrN5pcjP/Create-Web-App-Service)의 소스를 그대로 가져왔습니다.

- React 19 + Vite 8 + Tailwind CSS v4 (TypeScript)
- 패키지 매니저: pnpm 10 (`.mise.toml`, `pnpm-lock.yaml` 기준)

## 로컬 실행

Node.js 22 이상이 필요합니다. pnpm이 없다면 Node.js에 포함된 corepack으로 같은 버전을 실행할 수 있습니다.

```bash
corepack pnpm@10.34.3 install
corepack pnpm@10.34.3 dev
```

개발 서버는 http://localhost:8443 에서 열립니다. (pnpm이 설치되어 있다면 `pnpm install`, `pnpm dev`)

## 빌드

```bash
corepack pnpm@10.34.3 build
```

결과물은 `dist/`에 생성됩니다.

## 구조

| 경로 | 설명 |
| --- | --- |
| `src/App.tsx` | 앱 화면과 상태 전체 |
| `src/index.css` | 전역 스타일 (Tailwind v4 `@import`) |
| `src/main.tsx` | React 진입점 |
| `index.html` | HTML 셸 (`<!-- figma:* -->` 자리는 `vite.config.ts`가 채움) |
| `vite.config.ts` | Vite 설정과 Figma Make 플러그인 |
| `.figma/make/` | Figma Make 실행 환경용 스크립트와 설정 (`site.json`은 빌드에서도 사용) |
