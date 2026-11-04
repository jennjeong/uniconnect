import type { Report, VenuePage } from "../types"

// 참여자는 행사 QR을 스캔해 /check-in/<code>(CheckInPage)로 들어온다. 행사마다
// 자기 코드가 있다.
export const checkInAddress = (code: string) => `${window.location.origin}/check-in/${code}`

export const checkInLink = (report: Report) => checkInAddress(report.code)

// 같은 행사의 현장 페이지: 브랜드의 매장 직원은 /staff에서 방문과 브랜드의
// 방식을 확인하고, 학생단체는 /group에서 자기 방식을 확인한다.
export const venueLink = (code: string, page: VenuePage) => `${checkInAddress(code)}/${page}`

export const staffCheckInLink = (report: Report) => venueLink(report.code, "staff")

// 현재 주소의 체크인 페이지: 참여자용이거나 (/staff나 /group이 붙은) 현장
// 페이지.
export function currentCheckIn() {
  const match = /^\/check-in\/([\w-]+)(?:\/(staff|group))?\/?$/.exec(window.location.pathname)
  return match ? { code: match[1], page: match[2] as VenuePage | undefined } : undefined
}
