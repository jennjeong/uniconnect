// 추천에서 상대를 뺄 때 고르는 이유(관심 없음, #341, modals/DismissModal.tsx).
// backend/src/lib/validation.ts의 dismissReasons와 맞춰 둔다
// (lib/lists.sync.test.ts가 검사한다).
export const dismissReasons = ["업종 · 분야가 맞지 않아요", "거리가 멀어요", "규모가 맞지 않아요", "이미 알고 있는 곳이에요", "기타"]
