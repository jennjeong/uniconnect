import type { Report } from "../types"

// Participants scan the event QR and land on /check-in/<code> (CheckInPage);
// each event has a code of its own.
export const checkInLink = (report: Report) => `${window.location.origin}/check-in/${report.code}`

// The code in the current address when this is the check-in page.
export function currentCheckInCode() {
  return /^\/check-in\/([\w-]+)\/?$/.exec(window.location.pathname)?.[1]
}
