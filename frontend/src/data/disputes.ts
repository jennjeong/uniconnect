import type { DisputeEvent, DisputeOutcome, DisputeReason } from "../types"

// 협찬 분쟁의 이유와 결론(backend lib/disputes.ts의 disputeReasons, disputeOutcomes와
// 같은 값). 값은 그대로 보내고, 이름은 t()로 보인다.
export const disputeReasons: { value: DisputeReason; label: string }[] = [
  { value: "payout", label: "협찬금 지급" },
  { value: "promise", label: "약속한 일" },
  { value: "cancel", label: "협찬 취소" },
  { value: "other", label: "기타" },
]

export const disputeReasonLabel = (reason: DisputeReason) =>
  disputeReasons.find((item) => item.value === reason)?.label ?? reason

export const disputeOutcomes: { value: DisputeOutcome; label: string }[] = [
  { value: "agreed", label: "양쪽 합의" },
  { value: "opener", label: "접수한 쪽 입장 인정" },
  { value: "other", label: "상대 쪽 입장 인정" },
  { value: "undecided", label: "판단하지 않음" },
]

export const disputeOutcomeLabel = (outcome: DisputeOutcome | "withdrawn") =>
  outcome === "withdrawn" ? "접수한 쪽이 거둠" : (disputeOutcomes.find((item) => item.value === outcome)?.label ?? outcome)

export const disputeStatusLabels = { open: "접수됨", reviewing: "운영자 확인 중", closed: "끝남" } as const

export const disputeEventLabels: Record<DisputeEvent["kind"], string> = {
  opened: "분쟁을 접수했어요",
  statement: "말을 남겼어요",
  evidence: "증빙을 올렸어요",
  reviewing: "운영자가 확인을 시작했어요",
  withdrawn: "분쟁을 거뒀어요",
  decided: "운영자가 결론을 기록했어요",
}

// 서버의 한도(backend lib/disputes.ts의 disputeLimits).
export const disputeLimits = { detail: 1000, statements: 20, evidencePerSide: 5 }
