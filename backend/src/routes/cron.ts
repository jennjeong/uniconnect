import { createHash, timingSafeEqual } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { HttpError } from "../lib/errors.js"
import { sendDigests } from "../lib/digest.js"
import { sendReminders } from "../lib/reminders.js"
import { refreshViews } from "../lib/snsPosts.js"

export const cronRouter = Router()

// Hashing both sides gives equal lengths for timingSafeEqual.
const digest = (value: string) => createHash("sha256").update(value).digest()

// On Vercel, where nothing runs between requests, Vercel Cron calls this once
// a day (vercel.json, 09:00 in Korea) in place of the hourly timer a
// long-running server keeps (index.ts): the reminders, and on Mondays the
// weekly digests, and the YouTube views. It sends CRON_SECRET as a bearer
// token; without the secret set, or with another token, there is no such
// route.
cronRouter.get("/reminders", async (req, res) => {
  const expected = config.cronSecret
  const given = req.get("authorization") ?? ""
  if (!expected || !timingSafeEqual(digest(given), digest(`Bearer ${expected}`))) {
    throw new HttpError(404, "없는 API 경로예요.")
  }
  res.json({ sent: await sendReminders(), digests: await sendDigests(), views: await refreshViews() })
})
