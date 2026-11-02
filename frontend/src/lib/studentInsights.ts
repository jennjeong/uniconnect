import { t } from "../i18n"
import type { Metrics, Report } from "../types"

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

// A survey answer's counts as shares, the largest first, without empty ones.
export function shares(counts: Record<string, number> = {}) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, count: value, share: percent(value, total) }))
}

// The busiest hour of the event, summed over its days.
export function peakHour(report: Report) {
  const byHour = new Map<number, number>()
  for (const entry of report.hourlyScans) byHour.set(entry.hour, (byHour.get(entry.hour) ?? 0) + entry.scans)
  const [hour, scans] = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  return hour === undefined || !scans ? undefined : hour
}

// What the students' report says about who came and what to do next time:
// the rates down the funnel, the survey's leading answers and plain advice,
// each a sentence in the language shown.
export function studentInsights(report: Report, metrics: Metrics) {
  const participation = percent(metrics.scans, report.expectedAudience)
  const couponRate = percent(metrics.coupons, metrics.scans)
  const visitRate = percent(metrics.visits, metrics.coupons)
  const survey = report.survey
  const grade = shares(survey?.grade)[0]
  const field = shares(survey?.field)[0]
  const gender = shares(survey?.gender)
  const firstTime = survey ? percent(survey.visited["처음이에요"] ?? 0, survey.responses) : 0
  const hour = peakHour(report)

  // Most telling first: turnout, then who came, then each step's leak.
  const advice: string[] = []
  if (report.expectedAudience > 0 && participation < 50) {
    advice.push(t("참여율이 {rate}%였어요. QR을 입구와 무대 앞 두 곳에 두고, 사회자가 한 번 더 안내해 보세요.", { rate: participation }))
  } else if (participation >= 80) {
    advice.push(t("참여율이 {rate}%로 높았어요. 다음 제안서에 이 숫자를 앞세워 보세요.", { rate: participation }))
  }
  if (grade) advice.push(t("{grade} 참여가 {share}%로 가장 많았어요. 다음 홍보는 {grade} 단톡방과 수업 공지부터 시작해 보세요.", { grade: t(grade.label), share: grade.share }))
  if (field) advice.push(t("{field} 계열 학생이 가장 많았어요. 이 학생들이 좋아할 업종의 브랜드에 먼저 제안해 보세요.", { field: t(field.label) }))
  if (metrics.scans > 0 && couponRate < 60) {
    advice.push(t("QR을 찍은 학생 중 {rate}%만 쿠폰을 받았어요. 행사 초반에 쿠폰 받는 법을 먼저 알려 주세요.", { rate: couponRate }))
  }
  if (metrics.coupons > 0 && visitRate < 30) {
    advice.push(t("쿠폰을 받은 학생 중 {rate}%가 매장에 갔어요. 쿠폰 마감일을 SNS로 한 번 더 알려 주세요.", { rate: visitRate }))
  }
  if (hour !== undefined) advice.push(t("{hour}시에 가장 붐볐어요. 다음 행사의 메인 이벤트를 이 시간에 맞춰 보세요.", { hour }))
  if (survey && firstTime >= 40) {
    advice.push(t("쿠폰 가게에 처음 가 본 학생이 {share}%예요. 브랜드에 새 손님을 데려온 효과로 보여 주세요.", { share: firstTime }))
  }
  if (!survey) advice.push(t("다음 행사에서는 QR 뒤 설문을 꼭 안내해 보세요. 학년 · 전공 · 성별이 모이면 맞춤 제안이 쉬워져요."))

  return { participation, couponRate, visitRate, responses: survey?.responses ?? 0, grade, field, gender, firstTime, hour, advice: survey ? advice.slice(0, 6) : [...advice.slice(0, -1).slice(0, 5), advice.at(-1)!] }
}
