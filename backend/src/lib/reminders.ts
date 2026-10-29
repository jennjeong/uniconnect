import { addDays, todayInKorea } from "./dates.js"
import { notify } from "./notices.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

// How many days ahead an event is first reminded of.
export const remindDaysBefore = 3

// Days from today to a "YYYY-MM-DD", or undefined when it is not one.
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

// Emails each account once about each of its events (and a brand about the
// events it sponsors) when the day is three days away or nearer, with the
// agreement to check. The shared demo accounts are left out: their emails
// stand for no one. Run hourly by index.ts; answers how many went out.
export async function sendReminders(database: Database = getDatabase(), now = new Date()) {
  const today = todayInKorea(now)
  const stamp = now.toISOString()
  const demo = new Set(Object.values(database.demoAccountIds))
  const due: { account: Account; subject: string; lines: string[]; path: string }[] = []
  for (const account of database.accounts) {
    if (demo.has(account.id)) continue
    const students = account.role === "학생단체"
    for (const event of database.events[account.id] ?? []) {
      const days = daysUntil(today, event.date)
      if (days === undefined || event.remindedAt) continue
      event.remindedAt = stamp
      due.push({
        account,
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
      sponsorship.remindedAt = stamp
      due.push({
        account,
        subject: subjectFor(sponsorship.eventName, days, true),
        lines: [
          `${sponsorship.groupName}의 '${sponsorship.eventName}' 협찬 일정이 다가왔어요.`,
          "임시 전자 계약서에서 브랜드가 할 일을 확인해 주세요.",
        ],
        path: "/agreements",
      })
    }
  }
  if (due.length === 0) return 0
  await saveDatabase()
  for (const reminder of due) {
    void notify(reminder.account, "reminders", reminder.subject, reminder.lines, reminder.path)
  }
  return due.length
}
