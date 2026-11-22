import { disputeLimits, disputeOpen } from "./disputes.js"
import { isDemoAccount } from "./reviews.js"
import type { AbuseReport, Database, Dispute, ReportAction } from "../types.js"

// 운영자 콘솔에서 처리하는 것들의 상태 전이다. 라우트가 이것으로 막고, 목록이 지금 할 수 있는
// 처리를 `actions`로 보내 콘솔의 버튼이 같은 기준을 쓴다.
//
// - 가입 · 연결 승인(applications): 대기 → 승인 또는 거절. 둘 다 목록에서 빠지며 되돌릴 수 없다.
//   승인은 초대가 없어졌으면 409다(그때는 거절한다).
// - 친구 초대 보상(referralRewards): waiting → approved 또는 rejected. 막힌 보상(blocked)은 거절만.
// - 신고(reports): 대기 → 처리됨(dismiss, hide-review, hide-reply, suspend 중 하나). 처리된 신고는
//   다시 처리하지 않는다(409). 그 뒤의 정지나 후기 내리기는 계정과 후기 화면에서 한다.
// - 분쟁(disputes): open → reviewing(확인 시작) → closed(결론). open에서 바로 결론을 낼 수 있고,
//   접수한 쪽이 거두어도 closed다. closed는 다시 열지 않는다. 운영자 메모는 언제든 남긴다(한도까지).

export function reportActionsOf(database: Database, report: AbuseReport): ReportAction[] {
  if (report.resolution) return []
  const { target } = report
  const review = target.kind === "review" || target.kind === "reply" ? database.reviews.find((item) => item.id === target.reviewId) : undefined
  const account = database.accounts.find((item) => item.id === report.accountId)
  return [
    "dismiss",
    ...(target.kind === "review" && review ? (["hide-review"] as const) : []),
    ...(target.kind === "reply" && review?.reply ? (["hide-reply"] as const) : []),
    ...(account && !isDemoAccount(database, account) ? (["suspend"] as const) : []),
  ]
}

export type DisputeAdminAction = "review" | "decide" | "note"

export function disputeActionsOf(dispute: Dispute): DisputeAdminAction[] {
  return [
    ...(dispute.status === "open" ? (["review"] as const) : []),
    ...(disputeOpen(dispute) ? (["decide"] as const) : []),
    ...((dispute.notes?.length ?? 0) < disputeLimits.notes ? (["note"] as const) : []),
  ]
}
