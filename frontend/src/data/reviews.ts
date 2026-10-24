import type { Role } from "../types"

// Tags a sponsorship review may pick, by the side it is about. Keep in sync
// with reviewTags in backend/src/lib/validation.ts (lib/lists.sync.test.ts
// checks); the screens show them with t(tag).
export const reviewTags: Record<Role, string[]> = {
  브랜드: ["약속을 잘 지켜요", "응답이 빨라요", "협찬 물품이 좋아요", "매장 응대가 친절해요", "다시 함께하고 싶어요"],
  학생단체: ["약속을 잘 지켜요", "응답이 빨라요", "홍보를 잘해요", "성과 공유가 꼼꼼해요", "다시 함께하고 싶어요"],
}
