import { noteCronRun } from "./adminTools.js"
import { acceptedProposal } from "./agreements.js"
import { addDays, todayInKorea } from "./dates.js"
import { mailConfigured } from "./mailer.js"
import { notify } from "./notices.js"
import { payoutLate } from "./payouts.js"
import { isDemoAccount } from "./reviews.js"
import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { Account, ChatSide, CronRun, Database } from "../types.js"

// 행사 며칠 전부터 처음 알리는지.
export const remindDaysBefore = 3

// 한 번에 보내는 메일 수.
export const mailBatch = 20

// 메일을 mailBatch통씩 함께 보낸다. send는 보냈으면 true를 답한다. after가 있으면 묶음마다
// 보낸 것으로 부른다(보낸 것을 표시하고 저장하는 곳). progress는 묶음마다 보낸 수로 부른다(도중에
// 실패해도 그때까지 보낸 수를 알 수 있다). 보낸 수를 답한다. 한 통씩 기다리며
// 보내고 저장하면 크론의 시간 한도(vercel.json의 maxDuration) 안에 다른 일이 돌지 못한다.
export async function sendInBatches<T>(
  items: T[],
  send: (item: T) => Promise<boolean>,
  after?: (delivered: T[]) => Promise<unknown>,
  progress?: (count: number) => void,
) {
  let sent = 0
  for (let start = 0; start < items.length; start += mailBatch) {
    const batch = items.slice(start, start + mailBatch)
    const answers = await Promise.all(batch.map(send))
    const delivered = batch.filter((_, index) => answers[index])
    sent += delivered.length
    progress?.(delivered.length)
    if (after) await after(delivered)
  }
  return sent
}

type Mark = { list: "events" | "sponsorships"; id: string }

// 오늘부터 "YYYY-MM-DD"까지의 일수. 그런 형식이 아니면 undefined.
function daysUntil(today: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
  for (let days = 0; days <= remindDaysBefore; days += 1) if (addDays(today, days) === date) return days
  return undefined
}

// "오늘은 'X' 날이에요", "내일은 협찬하는 'X' 날이에요", "'X'까지 3일 남았어요".
function subjectFor(name: string, days: number, sponsored: boolean) {
  const what = `${sponsored ? "협찬하는 " : ""}'${name}'`
  if (days === 0) return `오늘은 ${what} 날이에요`
  if (days === 1) return `내일은 ${what} 날이에요`
  return `${what}까지 ${days}일 남았어요`
}

// 계정마다 자기 행사(브랜드는 협찬하는 행사)에 대해 그날이 사흘 이내가
// 되면 한 번 이메일을 보내고 확인할 계약서를 붙인다. 공용 데모 계정은
// 제외한다. 그 이메일이 누구도 가리키지 않기 때문이다. index.ts가 매시간
// 돌리며 나간 수를 답한다. 보낸 뒤에 표시하므로 실패한 메일은 다음 실행에서
// 다시 간다. 묶음마다 저장해, 함수가 도중에 끊겨도 보낸 것을 또 보내는 일을
// 줄인다.
export async function sendReminders(database: Database = getDatabase(), now = new Date()) {
  const today = todayInKorea(now)
  const stamp = now.toISOString()
  const due: { account: Account; mark: Mark; subject: string; lines: string[]; path: string }[] = []
  for (const account of database.accounts) {
    if (isDemoAccount(database, account)) continue
    const students = account.role === "학생단체"
    for (const event of database.events[account.id] ?? []) {
      const days = daysUntil(today, event.date)
      if (days === undefined || event.remindedAt) continue
      due.push({
        account,
        mark: { list: "events", id: event.id },
        subject: subjectFor(event.name, days, false),
        lines: [
          `${event.name} 일정이 다가왔어요.`,
          "확정된 협찬이 있다면 임시 전자 계약서에서 두 쪽이 할 일을 확인해 주세요.",
        ],
        path: students ? "/events" : "/campaigns",
      })
    }
    if (students) continue
    for (const sponsorship of database.sponsorships[account.id] ?? []) {
      const days = daysUntil(today, sponsorship.date)
      if (days === undefined || sponsorship.remindedAt) continue
      due.push({
        account,
        mark: { list: "sponsorships", id: sponsorship.id },
        subject: subjectFor(sponsorship.eventName, days, true),
        lines: [
          `${sponsorship.groupName}의 '${sponsorship.eventName}' 협찬 일정이 다가왔어요.`,
          "임시 전자 계약서에서 브랜드가 할 일을 확인해 주세요.",
        ],
        path: "/agreements",
      })
    }
  }
  // 운영자 콘솔이 대상이 없던 실행과 메일이 실패한 실행을 가를 수 있게, 대상 수와 실패 수,
  // 메일 서비스가 있었는지, 도중에 실패했는지를 남긴다. 도중에 던지면 그때까지 보낸 수와 함께
  // 실패로 남기고 다시 던진다(크론은 500으로 답한다).
  const mail = mailConfigured()
  let delivered = 0
  const record = (run: Omit<CronRun, "at">) =>
    retryConflicts(async () => {
      noteCronRun(getDatabase(), run, now)
      await saveDatabase()
    })
  try {
    await sendInBatches(
      due,
      (reminder) => notify(reminder.account, "reminders", reminder.subject, reminder.lines, reminder.path),
      // 보내는 동안 데이터를 새로 읽었을 수 있어 다시 찾는다.
      (delivered) =>
        retryConflicts(async () => {
          const current = getDatabase()
          for (const { account, mark } of delivered) {
            const owned: { id: string; remindedAt?: string }[] = current[mark.list][account.id] ?? []
            const item = owned.find((entry) => entry.id === mark.id)
            if (item) item.remindedAt = stamp
          }
          await saveDatabase()
        }),
      (count) => {
        delivered += count
      },
    )
  } catch (error) {
    await record({ sent: delivered, targets: due.length, mail, error: true }).catch(() => {})
    throw error
  }
  await record({ sent: delivered, targets: due.length, failed: due.length - delivered, mail })
  return delivered
}

const lateLines = (side: ChatSide, partner: string, event: string, due: string) =>
  side === "brand"
    ? [`'${event}' 협찬금의 지급 예정일(${due})이 지났어요.`, `보냈다면 임시 전자 계약서에서 지급을 표시해 주세요. 받는 쪽: ${partner}`]
    : [`'${event}' 협찬금의 지급 예정일(${due})이 지났어요.`, `받았다면 임시 전자 계약서에서 수령을 표시하고, 아직이면 ${partner}에 연락해 주세요.`]

// 지급이 늦어진 계약서마다 양쪽에 메일을 한 번 보낸다. 보낸 뒤에 표시하므로 실패한
// 메일은 다음 실행에서 다시 간다. 묶음마다 한 번 저장한다.
export async function sendPayoutReminders(database: Database = getDatabase(), now = new Date()) {
  const today = todayInKorea(now)
  const due = database.agreements.flatMap((agreement) => {
    if (!agreement.value?.cash || !payoutLate(agreement, today)) return []
    const proposal = acceptedProposal(database, agreement.id)
    if (!proposal || proposal.canceled) return []
    return (["brand", "group"] as const)
      .filter((side) => !agreement.payout?.lateNotified?.[side])
      .map((side) => ({ agreement, proposal, side }))
  })
  return sendInBatches(
    due,
    ({ agreement, proposal, side }) =>
      notify(
        proposal[side].account,
        "sponsorships",
        "협찬금 지급 예정일이 지났어요",
        lateLines(side, side === "brand" ? proposal.group.name : proposal.brand.name, proposal.eventName, agreement.payout!.dueDate!),
        `/agreements/${encodeURIComponent(agreement.id)}`,
      ),
    // 보내는 동안 데이터를 새로 읽었을 수 있어 다시 찾는다.
    async (delivered) => {
      if (delivered.length === 0) return
      await retryConflicts(async () => {
        const agreements = getDatabase().agreements
        for (const { agreement, side } of delivered) {
          const current = agreements.find((item) => item.id === agreement.id)
          if (current?.payout) (current.payout.lateNotified ??= {})[side] = now.toISOString()
        }
        await saveDatabase()
      })
    },
  )
}
