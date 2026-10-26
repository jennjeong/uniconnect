import { Router } from "express"

import { recordError } from "../lib/errorLog.js"
import { HttpError } from "../lib/errors.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { text } from "../lib/validation.js"

export const errorsRouter = Router()

// A page reports a few errors at most; more from one address is a flood.
const reportsPerClient = createRateLimit({
  limit: 30,
  windowMs: 10 * 60 * 1000,
  message: "오류 보고가 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// An error a visitor's browser caught and the page didn't (lib/errorReports.ts
// on the frontend): its message, where in the scripts, and the page's path.
// Anyone may send one, as visitors meet errors too.
errorsRouter.post("/", async (req, res) => {
  reportsPerClient.take(clientKey(req))
  const message = text(req.body?.message)
  const where = text(req.body?.where)
  const path = text(req.body?.path)
  if (!message || !path.startsWith("/")) throw new HttpError(400, "오류 내용을 다시 확인해 주세요.")
  await recordError({ source: "browser", message, where, path })
  res.status(204).end()
})
