import type { Role } from "../types"

// The shared demo accounts (backend/src/data/seed.ts), which anyone may use
// to try the app within the example data. The login popup logs into one
// with a press, so no one has to type the published password.
// lib/lists.sync.test.ts keeps these in step with the seed.
export const demoPassword = "uniconnect2026"

export const demoAccounts: Record<Role, { email: string; name: string }> = {
  학생단체: { email: "muse@syu.ac.kr", name: "삼육대 뮤즈" },
  브랜드: { email: "hello@afternoon-coffee.kr", name: "오후의 커피" },
}
