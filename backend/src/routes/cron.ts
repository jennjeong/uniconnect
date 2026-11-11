import { createHash, timingSafeEqual } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { cardReady } from "../lib/billing.js"
import { reconcileCards, reconcileRefunds } from "../lib/cardRecovery.js"
import { purgeDisputes } from "../lib/disputeRetention.js"
import { HttpError } from "../lib/errors.js"
import { sendDigests } from "../lib/digest.js"
import { foldCounts, prunePassRows } from "../lib/passRows.js"
import { prunePayments } from "../lib/paymentRetention.js"
import { sendProposalNudges } from "../lib/nudges.js"
import { sendSearchAlerts } from "../lib/savedSearches.js"
import { sendPayoutReminders, sendReminders } from "../lib/reminders.js"
import { refreshViews } from "../lib/snsPosts.js"

export const cronRouter = Router()

// 양쪽을 해시하면 길이가 같아져 timingSafeEqual을 쓸 수 있다.
const digest = (value: string) => createHash("sha256").update(value).digest()

// Vercel은 요청 사이에 아무것도 돌지 않으므로, 오래 떠 있는 서버가 쓰는 한
// 시간 간격 타이머(index.ts) 대신 Vercel Cron이 하루에 두 번(vercel.json, 한국
// 시간 09:00과 15:00) 이 경로를 부른다. Vercel은 실패한 호출을 다시 부르지 않으므로
// 두 번째가 첫 번째에서 실패한 것을 다시 한다. 승인이나 환불이 기록되지 않은 카드 결제를 먼저
// 정리하고(lib/cardRecovery.ts) 알림 메일과 답이 없는 제안의 재촉(lib/nudges.ts)과 관심 조건에 새로 맞는 상대(lib/savedSearches.ts)를 보내며, 월요일에는 주간 요약도
// 보내고, 유튜브 조회수도 새로 고치고, 보존 기간이 지난 결제 기록과 탈퇴 뒤 3년이 지난 분쟁 기록을 지운다. CRON_SECRET을 bearer 토큰으로 보내며, 비밀 값이 없거나 토큰이
// 다르면 이런 경로는 없는 것처럼 답한다.
cronRouter.get("/reminders", async (req, res) => {
  const expected = config.cronSecret
  const given = req.get("authorization") ?? ""
  if (!expected || !timingSafeEqual(digest(given), digest(`Bearer ${expected}`))) {
    throw new HttpError(404, "없는 API 경로예요.")
  }
  // 작업마다 따로 실패한다. 하나가 던져도 나머지는 돈다. 실패가 있으면 Vercel의
  // 기록에 보이도록 500으로 답한다.
  const failed: string[] = []
  const job = async <T>(name: string, work: () => Promise<T>) => {
    try {
      return await work()
    } catch (error) {
      console.error(`[cron] ${name}: ${(error as Error).message}`)
      failed.push(name)
      return undefined
    }
  }
  // 메일과 리포트가 읽기 전에 현장 집계를 문서에 합친다.
  const counts = await job("counts", () => foldCounts({ force: true }))
  const passes = await job("passes", () => prunePassRows())
  const cards = cardReady() ? await job("cards", reconcileCards) : undefined
  const refunds = cardReady() ? await job("refunds", reconcileRefunds) : undefined
  const sent = await job("reminders", () => sendReminders())
  const payouts = await job("payouts", () => sendPayoutReminders())
  const nudges = await job("nudges", () => sendProposalNudges())
  const searches = await job("searches", () => sendSearchAlerts())
  const digests = await job("digests", () => sendDigests())
  const views = await job("views", refreshViews)
  const payments = await job("payments", prunePayments)
  const disputes = await job("disputes", () => purgeDisputes())
  res.status(failed.length > 0 ? 500 : 200).json({ counts, passes, cards, refunds, sent, payouts, nudges, searches, digests, views, payments, disputes, failed })
})
