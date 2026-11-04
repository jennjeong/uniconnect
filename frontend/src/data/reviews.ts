import type { Role } from "../types"

// 협찬 후기가 고를 수 있는 태그를, 후기가 향하는 쪽별로.
// backend/src/lib/validation.ts의 reviewTags와 맞춰 둔다
// (lib/lists.sync.test.ts가 검사한다). 화면은 t(tag)로 보여준다.
export const reviewTags: Record<Role, string[]> = {
  브랜드: ["약속을 잘 지켜요", "응답이 빨라요", "협찬 물품이 좋아요", "매장 응대가 친절해요", "다시 함께하고 싶어요"],
  학생단체: ["약속을 잘 지켜요", "응답이 빨라요", "홍보를 잘해요", "성과 공유가 꼼꼼해요", "다시 함께하고 싶어요"],
}
