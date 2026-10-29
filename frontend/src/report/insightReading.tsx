import { t } from "../i18n"
import { fullWon } from "../lib/sponsorships"
import type { PremiumReport } from "../types"

// What each section of the detailed report means, in sentences worked out
// from its figures, with one thing to do about it: the analysis a reader
// pays for, beside the charts.
export type Reading = { points: string[]; action?: string }

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export function readings(report: PremiumReport): Record<string, Reading> {
  const find = (key: string) => report.scorecard.find((item) => item.key === key)!
  const scans = find("scans").actual
  const coupons = find("coupons").actual
  const visits = find("visits").actual
  const roas = find("roas")
  const met = report.scorecard.filter((item) => item.achievement !== null && item.achievement >= 100)
  const scored = report.scorecard.filter((item) => item.achievement !== null)
  const weakest = [...scored].sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0))[0]
  const strongest = [...scored].sort((a, b) => (b.achievement ?? 0) - (a.achievement ?? 0))[0]
  const labels: Record<string, string> = {
    reach: "도달",
    scans: "QR 스캔",
    coupons: "쿠폰 수령",
    visits: "매장 방문",
    qrRate: "QR 참여율",
    visitRate: "방문 전환율",
    roas: "추정 ROAS",
  }

  // Cash as written in the goals, else in the e-contract; unknown otherwise.
  const cash =
    report.overview.valueBreakdown.find((part) => part.type === "현금")?.value ??
    report.overview.agreedValue?.cash ??
    null
  const hours = report.time.hourly.filter((item) => item.date === (report.time.peak?.date ?? report.event.date))
  const dayScans = hours.reduce((sum, item) => sum + item.scans, 0)
  const peakShare = report.time.peak ? pct(report.time.peak.scans, dayScans) : 0
  const busiestDay = [...report.time.daily].sort((a, b) => b.visits - a.visits)[0]
  const weekday = report.visitsAnalysis.weekdays.indexOf(Math.max(...report.visitsAnalysis.weekdays))
  const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"]
  const perVisit = report.costs.perVisit
  const doneShare = pct(report.fulfillment.done, report.fulfillment.items.length)
  const audience = report.audience
  const topGrade = audience ? Object.entries(audience.grade).sort((a, b) => b[1] - a[1])[0] : undefined
  const topField = audience ? Object.entries(audience.field).sort((a, b) => b[1] - a[1])[0] : undefined

  return {
    overview: {
      points: [
        ...(cash === null
          ? []
          : [
              t("협찬 가치 {total} 중 현금이 {cash}({share}%)이고 나머지는 현물이에요.", {
                total: fullWon(report.spend),
                cash: fullWon(cash),
                share: pct(cash, report.spend),
              }),
            ]),
        t("예상 관객 {audience}명 가운데 {scans}명이 QR로 참여해, 현장에서 브랜드와 직접 닿은 사람은 관객의 {share}%예요.", {
          audience: report.overview.expectedAudience,
          scans,
          share: pct(scans, report.overview.expectedAudience),
        }),
      ],
      action: t("현물은 판매가로 환산해 두면 다음 협찬에서도 같은 기준으로 ROAS를 비교할 수 있어요."),
    },
    score: {
      points: [
        t("목표 {total}개 중 {met}개를 달성했어요.", { total: scored.length, met: met.length }),
        ...(strongest
          ? [t("가장 잘한 항목은 {label}({rate}%)이에요.", { label: t(labels[strongest.key]), rate: strongest.achievement ?? 0 })]
          : []),
        ...(weakest && (weakest.achievement ?? 0) < 100
          ? [t("가장 아쉬운 항목은 {label}({rate}%)이에요.", { label: t(labels[weakest.key]), rate: weakest.achievement ?? 0 })]
          : []),
      ],
      action:
        weakest && (weakest.achievement ?? 0) < 100
          ? t("다음 계약서에서는 {label} 목표를 이번 실제 값에 맞춰 다시 정하고, 그 항목을 올릴 할 일을 하나 더 넣어 보세요.", { label: t(labels[weakest.key]) })
          : t("모든 목표를 넘었어요. 다음에는 목표를 이번 실제 값보다 10~20% 높게 잡아도 좋아요."),
    },
    audience: audience
      ? {
          points: [
            t("응답자 중 {grade}이 {share}%로 가장 많았고, 전공은 {field} 계열이 가장 많았어요.", {
              grade: t(topGrade?.[0] ?? "—"),
              share: pct(topGrade?.[1] ?? 0, audience.responses),
              field: t(topField?.[0] ?? "—"),
            }),
            t("{share}%가 쿠폰 가게에 처음 가 본다고 답했어요. 이 협찬은 기존 손님보다 새 손님을 데려온 협찬이에요.", {
              share: audience.firstTimeShare,
            }),
          ],
          action: t("이 학년 · 전공이 많이 오는 행사를 우선 찾으면 같은 비용으로 더 맞는 손님을 만날 수 있어요."),
        }
      : { points: [t("설문 답이 모이면 어떤 학생이 왔고, 그중 새 손님이 얼마나 되는지 알 수 있어요.")] },
    funnel: {
      points: [
        t("QR을 스캔한 사람의 {coupon}%가 쿠폰을 받았고, 쿠폰을 받은 사람의 {visit}%가 매장에 왔어요.", {
          coupon: pct(coupons, scans),
          visit: pct(visits, coupons),
        }),
        report.benchmarkCount >= 3
          ? t("uniconnect에서 측정한 다른 행사 {count}건과 단계마다 비교했어요.", { count: report.benchmarkCount })
          : t("비교할 행사가 쌓이면 단계마다 다른 행사와의 순위가 함께 보여요."),
      ],
      action: t("이탈이 가장 큰 단계에 맞는 할 일(현장 안내, 혜택 크기, 매장 안내)을 다음 계약서에 넣어 보세요."),
    },
    timing: {
      points: report.time.peak
        ? [
            t("가장 붐빈 {hour}시 한 시간에 그날 스캔의 {share}%가 몰렸어요.", { hour: report.time.peak.hour, share: peakShare }),
            ...(busiestDay && busiestDay.visits > 0
              ? [t("매장 방문이 가장 많았던 날은 {date}이에요.", { date: busiestDay.date.slice(5).replace("-", "/") })]
              : []),
          ]
        : [t("아직 스캔 기록이 없어요.")],
      action: report.time.peak
        ? t("다음 행사에서는 {from}시~{to}시에 부스 인원과 QR 안내를 모으세요.", { from: report.time.peak.hour - 1, to: report.time.peak.hour + 1 })
        : undefined,
    },
    visits: {
      points: [
        t("받은 쿠폰 {coupons}장 중 {rate}%가 실제 방문으로 이어졌어요.", { coupons, rate: report.visitsAnalysis.redemption }),
        ...(report.time.lag.average !== null
          ? [t("쿠폰을 받고 평균 {days}일 뒤에 왔고, {weekday}요일 방문이 가장 많았어요.", { days: report.time.lag.average, weekday: t(weekdayNames[weekday]) })]
          : []),
        ...(report.visitsAnalysis.newCustomers !== null
          ? [t("방문 중 약 {count}명은 처음 온 손님으로 보여요.", { count: report.visitsAnalysis.newCustomers })]
          : []),
      ],
      action:
        report.time.lag.average !== null && report.time.lag.average >= 2
          ? t("쿠폰 기한을 행사 뒤 3일 정도로 줄이면 방문이 행사 직후로 모여 매장 운영도 쉬워져요.")
          : t("행사 당일 방문이 많아요. 행사 시간에 맞춰 매장 인원을 늘려 두세요."),
    },
    costs: {
      points: [
        perVisit !== null
          ? t("방문 1명을 데려오는 데 {cost}이 들었고, 방문 1명이 쓴 돈은 {spend}로 추정돼요.", { cost: fullWon(perVisit), spend: fullWon(report.averageSpend) })
          : t("아직 방문이 없어 방문당 비용을 계산할 수 없어요."),
        t("1인 지출이 20% 적었다면 ROAS는 {low}%, 20% 많았다면 {high}%예요.", {
          low: report.roi.sensitivity[0]?.roas ?? 0,
          high: report.roi.sensitivity[2]?.roas ?? 0,
        }),
      ],
      action:
        roas.actual >= roas.target
          ? t("1인 지출이 20% 적게 나와도 ROAS가 유지되는지 보고, 그렇다면 같은 조건으로 다시 협찬해도 안전해요.")
          : t("방문당 비용을 줄이려면 현금보다 매장에서만 쓰는 현물 · 쿠폰 비중을 높여 보세요."),
    },
    effect: report.effect
      ? {
          points: [
            t("쿠폰 기간에 매장 하루 방문객이 평소 {before}명에서 {during}명으로 {lift}% 늘었어요.", {
              before: report.effect.before,
              during: report.effect.during,
              lift: report.effect.lift,
            }),
            ...(report.effect.attributedShare !== null
              ? [t("늘어난 방문 중 쿠폰으로 확인된 몫은 {share}%예요. 나머지는 쿠폰 없이 행사를 보고 온 손님일 수 있어요.", { share: report.effect.attributedShare })]
              : []),
          ],
          action: t("증분 ROAS {roas}%는 쿠폰만 센 ROAS보다 실제 효과에 가까워요. 내부 보고에는 두 숫자를 나란히 쓰세요.", { roas: report.effect.incrementalRoas }),
        }
      : { points: [t("매장의 평소 방문객 수를 적으면, 쿠폰을 쓰지 않은 손님까지 포함한 진짜 효과를 계산해요.")] },
    fulfillment: {
      points: report.fulfillment.items.length
        ? [
            t("계약서에 적은 할 일 {total}개 중 {done}개({share}%)를 마쳤고, 증빙은 {proof}건이에요.", {
              total: report.fulfillment.items.length,
              done: report.fulfillment.done,
              share: doneShare,
              proof: report.fulfillment.proof,
            }),
            report.partner.rating !== null
              ? t("이 단체는 다른 브랜드에게 평균 별 {rating}개를 받았어요.", { rating: report.partner.rating })
              : t("이 단체가 받은 후기는 아직 없어요."),
          ]
        : [t("이 협찬에는 임시 전자 계약서가 없어요.")],
      action: doneShare === 100 ? t("약속을 모두 지킨 단체예요. 다음 행사에도 우선 제안해 보세요.") : t("못 마친 할 일은 다음 계약서에 날짜와 증빙 방법을 함께 적어 두세요."),
    },
    advice: {
      points: [
        report.history.rank !== null
          ? t("우리 브랜드의 협찬 {count}건 중 ROAS {rank}위예요.", { count: report.history.count, rank: report.history.rank })
          : t("우리 브랜드의 첫 협찬이에요."),
        ...(report.history.averageRoas !== null
          ? [t("브랜드 평균 ROAS {average}%와 비교하면 이번 협찬은 {gap}%p {direction}.", {
              average: report.history.averageRoas,
              gap: Math.abs(Math.round(roas.actual - report.history.averageRoas)),
              direction: roas.actual >= report.history.averageRoas ? t("높아요") : t("낮아요"),
            })]
          : []),
      ],
    },
  }
}

export function ReadingBox({ reading }: { reading?: Reading }) {
  if (!reading || reading.points.length === 0) return null
  return (
    <aside className="insight-reading">
      <h3>{t("이 페이지가 말하는 것")}</h3>
      <ul>
        {reading.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {reading.action && (
        <p>
          <strong>{t("제안")}</strong> {reading.action}
        </p>
      )}
    </aside>
  )
}
