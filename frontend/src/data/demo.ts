import type { Role } from "../types"

// 공유 데모 계정 (backend/src/data/seed.ts). 누구나 예시 데이터 안에서 앱을 써
// 보는 데 쓸 수 있다. 로그인 팝업은 한 번 누르면 그중 하나로 로그인하므로,
// 공개된 비밀번호를 직접 칠 필요가 없다. lib/lists.sync.test.ts가 이를 시드와
// 맞춰 둔다.
export const demoPassword = "uniconnect2026"

export const demoAccounts: Record<Role, { email: string; name: string }> = {
  학생단체: { email: "muse@syu.ac.kr", name: "삼육대 뮤즈" },
  브랜드: { email: "hello@afternoon-coffee.kr", name: "오후의 커피" },
}
