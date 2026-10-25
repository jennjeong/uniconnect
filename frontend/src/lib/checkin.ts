import type { Report, VenuePage } from "../types"

// Participants scan the event QR and land on /check-in/<code> (CheckInPage);
// each event has a code of its own.
export const checkInAddress = (code: string) => `${window.location.origin}/check-in/${code}`

export const checkInLink = (report: Report) => checkInAddress(report.code)

// The venue pages for the same event: the brand's store staff confirm visits
// and the brand's methods on /staff, the student group its methods on /group.
export const venueLink = (code: string, page: VenuePage) => `${checkInAddress(code)}/${page}`

export const staffCheckInLink = (report: Report) => venueLink(report.code, "staff")

// The check-in page in the current address: for participants, or (with
// /staff or /group) a venue page.
export function currentCheckIn() {
  const match = /^\/check-in\/([\w-]+)(?:\/(staff|group))?\/?$/.exec(window.location.pathname)
  return match ? { code: match[1], page: match[2] as VenuePage | undefined } : undefined
}
