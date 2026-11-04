import type { SocialProvider } from "../types"

// 각 로그인 제공자를 버튼에서 부르는 이름 (routes/social.ts).
export const socialNames: Record<SocialProvider, string> = { kakao: "카카오", naver: "네이버" }
