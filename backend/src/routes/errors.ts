import { Router } from "express"

import { recordError } from "../lib/errorLog.js"
import { HttpError } from "../lib/errors.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { text } from "../lib/validation.js"

export const errorsRouter = Router()

// 페이지 하나가 보내는 오류는 많아야 몇 건이다. 한 주소에서 더 오면 폭주로 본다.
const reportsPerClient = createRateLimit({
  limit: 30,
  windowMs: 10 * 60 * 1000,
  message: "오류 보고가 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// 방문자의 브라우저가 잡았지만 페이지는 처리하지 못한 오류다(프론트엔드의
// lib/errorReports.ts). 메시지와 스크립트의 위치, 페이지 경로를 받는다.
// 방문자도 오류를 만나므로 누구든 보낼 수 있다.
errorsRouter.post("/", async (req, res) => {
  await reportsPerClient.take(clientKey(req))
  const message = text(req.body?.message)
  const where = text(req.body?.where)
  const path = text(req.body?.path)
  if (!message || !path.startsWith("/")) throw new HttpError(400, "오류 내용을 다시 확인해 주세요.")
  await recordError({ source: "browser", message, where, path })
  res.status(204).end()
})
