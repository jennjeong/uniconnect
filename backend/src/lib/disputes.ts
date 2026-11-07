import type { Agreement, ChatSide, Database, Dispute, DisputeEvent } from "../types.js"

// 협찬 약속이 지켜지지 않았을 때의 기록이다. 접수, 양쪽의 말과 증빙, 운영자의
// 결론을 남길 뿐이고, 결론이 계정, 결제, 후기를 자동으로 바꾸지 않는다. 어떤
// 기준으로 판단할지는 사람이 정할 일이라 코드에 넣지 않는다.
export const disputeReasons = ["payout", "promise", "cancel", "other"] as const
export const disputeOutcomes = ["agreed", "opener", "other", "undecided"] as const
export const disputeLimits = { detail: 1000, statements: 20, evidencePerSide: 5, notes: 100 }

export const disputesOf = (database: Database) => (database.disputes ??= [])
export const disputeFolder = (id: string) => `dispute-${id}`
export const disputeOpen = (dispute: Dispute) => dispute.status !== "closed"

export function addDisputeEvent(dispute: Dispute, event: Omit<DisputeEvent, "at">, now = new Date()) {
  dispute.events.push({ ...event, at: now.toISOString() })
  dispute.updatedAt = now.toISOString()
}

// 접수할 때의 계약 내용이다. 계약서는 그 뒤로도 바뀔 수 있어 그대로 남긴다.
export const agreementSnapshot = (agreement: Agreement, canceled: boolean): Dispute["snapshot"] => ({
  canceled,
  ...(agreement.value ? { value: { ...agreement.value } } : {}),
  ...(agreement.payout
    ? {
        payout: {
          dueDate: agreement.payout.dueDate,
          paidAt: agreement.payout.paidAt,
          paidAmount: agreement.payout.paidAmount,
          receivedAt: agreement.payout.receivedAt,
        },
      }
    : {}),
  items: agreement.items.map(({ side, label, doneAt }) => ({ side, label, ...(doneAt ? { doneAt } : {}) })),
})

// 당사자가 보는 기록이다. 운영자 메모와 저장된 파일 이름은 뺀다.
export function disputeView(dispute: Dispute, side: ChatSide) {
  const { notes: _notes, parties: _parties, evidence, ...shown } = dispute
  return {
    ...shown,
    side,
    evidence: evidence.map(({ file: _file, ...item }) => item),
    canWithdraw: disputeOpen(dispute) && dispute.openedBy === side,
    canAddEvidence: disputeOpen(dispute) && evidence.filter((item) => item.side === side).length < disputeLimits.evidencePerSide,
  }
}

// 계약서가 사라진(한쪽이 탈퇴한) 분쟁도 함께 지우고, 증빙 폴더를 돌려준다.
export function dropOrphanDisputes(database: Database) {
  const kept = new Set(database.agreements.map((agreement) => agreement.id))
  const gone = disputesOf(database).filter((dispute) => !kept.has(dispute.agreementId))
  database.disputes = disputesOf(database).filter((dispute) => !gone.includes(dispute))
  return gone.map((dispute) => disputeFolder(dispute.id))
}
