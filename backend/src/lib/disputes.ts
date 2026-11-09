import type { Agreement, ChatSide, Database, Dispute, DisputeEvent } from "../types.js"

// 협찬 약속이 지켜지지 않았을 때의 기록이다. 접수, 양쪽의 말과 증빙, 운영자의
// 결론을 남길 뿐이고, 결론이 계정, 결제, 후기를 자동으로 바꾸지 않는다. 어떤
// 기준으로 판단할지는 사람이 정할 일이라 코드에 넣지 않는다.
export const disputeReasons = ["payout", "promise", "cancel", "other"] as const
export const disputeOutcomes = ["agreed", "opener", "other", "undecided"] as const
// statements와 evidencePerSide는 한쪽마다 센다. 한쪽이 한도를 채워 상대가 답하지 못하게 할 수 없다.
// evidenceBytes는 한 계정이 모든 분쟁에 올린 증빙의 합이다.
export const disputeLimits = { detail: 1000, statements: 20, evidencePerSide: 5, evidenceBytes: 20 * 1024 * 1024, notes: 100 }

export const disputesOf = (database: Database) => (database.disputes ??= [])
export const disputeFolder = (id: string) => `dispute-${id}`
export const disputeOpen = (dispute: Dispute) => dispute.status !== "closed"

export function addDisputeEvent(dispute: Dispute, event: Omit<DisputeEvent, "at">, now = new Date()) {
  dispute.events.push({ ...event, at: now.toISOString() })
  dispute.updatedAt = now.toISOString()
}

// 접수할 때의 계약 내용이다. 계약서는 그 뒤로도 바뀔 수 있어 그대로 남긴다. 어느 쪽이든
// 계약서를 고칠 수 있으므로, 그때 양쪽이 확인했는지(confirmed)도 함께 남겨 운영자가
// 양쪽이 합의한 조건인지 한쪽이 고친 내용인지 구분하게 한다.
export const agreementSnapshot = (agreement: Agreement, canceled: boolean): Dispute["snapshot"] => ({
  canceled,
  ...(Object.keys(agreement.confirmed ?? {}).length ? { confirmed: { ...agreement.confirmed } } : {}),
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

// 탈퇴하는 계정이 당사자인 분쟁 중 계약서가 사라진 것을 지우고, 증빙 폴더를 돌려준다.
// 다른 계정의 분쟁은 계약서가 없어도(예를 들어 백업을 복원한 뒤) 남긴다.
export function dropOrphanDisputes(database: Database, leavingAccountId: string) {
  const kept = new Set(database.agreements.map((agreement) => agreement.id))
  const gone = disputesOf(database).filter(
    (dispute) => !kept.has(dispute.agreementId) && Object.values(dispute.parties).includes(leavingAccountId),
  )
  database.disputes = disputesOf(database).filter((dispute) => !gone.includes(dispute))
  return gone.map((dispute) => disputeFolder(dispute.id))
}

// 결론이 나지 않은 분쟁의 당사자인지. 그동안은 스스로 탈퇴할 수 없다.
export const inOpenDispute = (database: Database, accountId: string) =>
  disputesOf(database).some((dispute) => disputeOpen(dispute) && Object.values(dispute.parties).includes(accountId))

// 이 계정이 모든 분쟁에 올린 증빙의 크기 합이다.
export const evidenceBytesOf = (database: Database, accountId: string) =>
  disputesOf(database).reduce(
    (sum, dispute) =>
      sum +
      dispute.evidence
        .filter((item) => dispute.parties[item.side] === accountId)
        .reduce((total, item) => total + item.size, 0),
    0,
  )
