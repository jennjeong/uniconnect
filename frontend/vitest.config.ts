import { defineConfig } from "vitest/config"

// Unit tests for the helpers in src/lib. They run in Node without the app's
// Vite plugins (vite.config.ts), since none of them draw anything.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
})
