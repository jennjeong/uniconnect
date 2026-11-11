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
  ...(agreement.clauses?.length ? { clauses: agreement.clauses.map((clause) => ({ ...clause })) } : {}),
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

// 결론 난 분쟁은 당사자가 탈퇴한 뒤에도 이만큼 둔다(#315 결정). 남은 쪽과 운영자가
// 나중에 다툼을 확인할 수 있게 하려는 것이다.
export const keepYearsAfterLeaving = 3
// 탈퇴한 쪽의 이름 자리에 남기는 말이다.
export const leftName = "탈퇴한 회원"

export type DisputeFiles = { folder: string; names: string[] }

const sideOf = (dispute: Dispute, accountId: string) =>
  (Object.keys(dispute.parties) as ChatSide[]).find((side) => dispute.parties[side] === accountId)

// 탈퇴하는 계정이 당사자인 분쟁을 정리한다.
// - 결론이 났거나 거둔 분쟁은 남기고, 떠나는 쪽의 이름, 계정, 그쪽이 쓴 말(접수한 쪽이면
//   접수 설명도)과 올린 증빙을 지운다. 상대의 말과 증빙, 접수할 때의 계약 내용, 운영자의
//   결론과 메모는 남는다. 처음 한쪽이 떠난 때부터 3년 뒤에 통째로 지운다(lib/disputeRetention.ts).
// - 결론이 나지 않은 분쟁은 탈퇴를 막으므로(routes/auth.ts) 여기 오지 않는다. 온다면 예전처럼
//   계약서가 사라진 것만 통째로 지운다.
// 다른 계정의 분쟁은 계약서가 없어도(예를 들어 백업을 복원한 뒤) 남긴다. 데이터를 저장한
// 뒤 지울 증빙 폴더와 파일을 돌려준다.
export function retireDisputes(database: Database, leavingAccountId: string, now = new Date()) {
  const agreements = new Set(database.agreements.map((agreement) => agreement.id))
  const folders: string[] = []
  const files: DisputeFiles[] = []
  const stamp = now.toISOString()
  const keepUntil = new Date(now)
  keepUntil.setUTCFullYear(keepUntil.getUTCFullYear() + keepYearsAfterLeaving)
  database.disputes = disputesOf(database).filter((dispute) => {
    const side = sideOf(dispute, leavingAccountId)
    if (!side) return true
    if (disputeOpen(dispute)) {
      if (agreements.has(dispute.agreementId)) return true
      folders.push(disputeFolder(dispute.id))
      return false
    }
    const theirs = dispute.evidence.filter((item) => item.side === side)
    if (theirs.length) files.push({ folder: disputeFolder(dispute.id), names: theirs.map((item) => item.file) })
    dispute.evidence = dispute.evidence.filter((item) => item.side !== side)
    dispute.events = dispute.events.filter((event) => event.by !== side || (event.kind !== "statement" && event.kind !== "evidence"))
    if (dispute.openedBy === side) dispute.detail = ""
    dispute[side === "group" ? "groupName" : "brandName"] = leftName
    dispute.parties[side] = ""
    dispute.left = { ...dispute.left, [side]: stamp }
    dispute.keepUntil ??= keepUntil.toISOString()
    return true
  })
  return { folders, files }
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
