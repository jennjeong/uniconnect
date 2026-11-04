import { defineConfig } from "vitest/config"

// src/lib의 헬퍼를 단위 테스트한다. 아무것도 그리지 않으므로 앱의 Vite
// 플러그인(vite.config.ts) 없이 Node에서 돌린다.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
})
