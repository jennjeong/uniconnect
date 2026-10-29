import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { defineConfig } from "@playwright/test"

// Browser tests of the built app (npm run build first): Express serves the
// API and the pages on its own port, from a fresh seed in a temp file, so
// the dev data is never touched. They run in the installed Chrome.
const port = 4300
const dataFile = path.join(mkdtempSync(path.join(tmpdir(), "uniconnect-e2e-")), "db.json")

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  // GitHub's runners draw the 3D scenes without a graphics card, several
  // times slower than a laptop.
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    channel: "chrome",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    // Animations hold still, so the screens settle at once.
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "node backend/dist/index.js",
    url: `http://localhost:${port}/api/health`,
    // No map key or geocoder, even when this computer has them, so nothing
    // reaches Kakao or OpenStreetMap. Every test signs up from this one
    // address, more often than a person would, so it may ask for more codes.
    env: {
      API_PORT: String(port),
      DATA_FILE: dataFile,
      EXPOSE_EMAIL_CODES: "true",
      KAKAO_REST_API_KEY: "",
      NOMINATIM_URL: "",
      // Fees from any day, so today's sponsorships owe one.
      FEES_SINCE: "2000-01-01",
      CODES_PER_CLIENT: "200",
    },
    timeout: 60_000,
  },
})
