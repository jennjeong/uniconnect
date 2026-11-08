import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { defineConfig } from "@playwright/test"

// 빌드한 앱의 브라우저 테스트다(먼저 npm run build). Express가 API와 페이지를
// 자기 포트에서 서빙하며, 임시 파일에 새로 만든 시드를 쓰므로 개발 데이터는
// 건드리지 않는다. 설치된 Chrome에서 돌린다.
const port = 4300
const dataFile = path.join(mkdtempSync(path.join(tmpdir(), "uniconnect-e2e-")), "db.json")

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  // GitHub 러너는 그래픽 카드 없이 3D 장면을 그려서 노트북보다 몇 배
  // 느리다.
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    channel: "chrome",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    // 애니메이션을 멈춰 화면이 바로 안정되게 한다.
    reducedMotion: "reduce",
    // CI에서는 멈춘 클릭이나 입력이 테스트 전체 시간을 다 쓰지 않고, 어느
    // 요소에서 멈췄는지 알려 주게 한다.
    actionTimeout: process.env.CI ? 30_000 : 0,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "node backend/dist/index.js",
    url: `http://localhost:${port}/api/health`,
    // 이 컴퓨터에 있더라도 지도 키와 지오코더를 쓰지 않으므로 Kakao나
    // OpenStreetMap에는 아무것도 가지 않는다. 모든 테스트가 이 한 주소에서
    // 가입하고 사람보다 자주 가입하므로 코드를 더 많이 요청할 수 있게 한다.
    env: {
      API_PORT: String(port),
      DATA_FILE: dataFile,
      EXPOSE_EMAIL_CODES: "true",
      KAKAO_REST_API_KEY: "",
      NOMINATIM_URL: "",
      // 어느 날짜든 수수료를 받으므로 오늘의 협찬도 수수료를 낸다.
      FEES_SINCE: "2000-01-01",
      // 운영자 콘솔은 브라우저 테스트에서만 이 값으로 열린다.
      ADMIN_TOKEN: "e2e-admin-token",
      CODES_PER_CLIENT: "200",
    },
    timeout: 60_000,
  },
})
