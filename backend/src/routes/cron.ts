import { createHash, timingSafeEqual } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { cardReady } from "../lib/billing.js"
import { reconcileCards, reconcileRefunds } from "../lib/cardRecovery.js"
import { HttpError } from "../lib/errors.js"
import { sendDigests } from "../lib/digest.js"
import { sendReminders } from "../lib/reminders.js"
import { refreshViews } from "../lib/snsPosts.js"

export const cronRouter = Router()

// 양쪽을 해시하면 길이가 같아져 timingSafeEqual을 쓸 수 있다.
const digest = (value: string) => createHash("sha256").update(value).digest()

// Vercel은 요청 사이에 아무것도 돌지 않으므로, 오래 떠 있는 서버가 쓰는 한
// 시간 간격 타이머(index.ts) 대신 Vercel Cron이 하루에 한 번(vercel.json,
// 한국 시간 09:00) 이 경로를 부른다. 승인이나 환불이 기록되지 않은 카드 결제를 먼저
// 정리하고(lib/cardRecovery.ts) 알림 메일을 보내며, 월요일에는 주간 요약도
// 보내고, 유튜브 조회수도 새로 고친다. CRON_SECRET을 bearer 토큰으로 보내며, 비밀 값이 없거나 토큰이
// 다르면 이런 경로는 없는 것처럼 답한다.
cronRouter.get("/reminders", async (req, res) => {
  const expected = config.cronSecret
  const given = req.get("authorization") ?? ""
  if (!expected || !timingSafeEqual(digest(given), digest(`Bearer ${expected}`))) {
    throw new HttpError(404, "없는 API 경로예요.")
  }
  const cards = cardReady() ? await reconcileCards() : undefined
  const refunds = cardReady() ? await reconcileRefunds() : undefined
  res.json({ cards, refunds, sent: await sendReminders(), digests: await sendDigests(), views: await refreshViews() })
})
