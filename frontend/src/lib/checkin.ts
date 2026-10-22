import type { Report } from "../types"

// Participants scan the event QR and land on /check-in/<code> (CheckInPage);
// each event has a code of its own.
export const checkInLink = (report: Report) => `${window.location.origin}/check-in/${report.code}`

// The store staff's page for the same event, where visits are confirmed.
export const staffCheckInLink = (report: Report) => `${checkInLink(report)}/staff`

// The check-in page in the current address, for participants or (with
// /staff) for the store's staff.
export function currentCheckIn() {
  const match = /^\/check-in\/([\w-]+)(\/staff)?\/?$/.exec(window.location.pathname)
  return match ? { code: match[1], staff: Boolean(match[2]) } : undefined
}
