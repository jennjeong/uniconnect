import type { Request } from "express"

import { HttpError } from "../lib/errors.js"
import { dropPushTargets, parsePushTarget, pushKey, sendPush } from "../lib/push.js"
import { langOf, translate } from "../lib/i18n.js"
import { createRateLimit, senderKey } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { writeRouter } from "../middleware/retrying.js"
import { hashToken, requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"

export const pushRouter = writeRouter()

const demoLocked = "데모 계정은 기기 알림을 켤 수 없어요."

// 이 요청의 로그인. 구독은 여기에 둔다(lib/push.ts).
function sessionOf(req: Request) {
  const tokenHash = hashToken(req.sessionToken ?? "")
  const session = getDatabase().sessions.find((item) => item.tokenHash === tokenHash)
  if (!session) throw new HttpError(401, "로그인이 필요해요.")
  return session
}

// 켜고 시험하는 횟수. 시험 알림은 푸시 서버로 요청을 보낸다.
const tests = createRateLimit({
  label: "시험 푸시 알림",
  limit: 5,
  windowMs: 60 * 60 * 1000,
  message: "시험 알림을 너무 많이 보냈어요. 잠시 뒤에 다시 시도해 주세요.",
})

// 브라우저가 구독할 때 쓰는 공개 키와, 이 로그인에서 켜져 있는지. 키가 없으면(설정
// 전이거나 데모 계정) 앱은 이 설정을 보이지 않는다.
pushRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const key = isDemoAccount(getDatabase(), account) ? undefined : pushKey()
  res.json({ key: key ?? null, on: Boolean(key && sessionOf(req).push) })
})

pushRouter.put("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, demoLocked)
  if (!pushKey()) throw new HttpError(503, "지금은 기기 알림을 켤 수 없어요.")
  const target = parsePushTarget(req.body)
  if (!target) throw new HttpError(400, "이 브라우저의 알림 정보를 읽지 못했어요.")
  // 한 브라우저의 구독은 한 로그인에만 둔다. 다른 계정으로 로그인했던 기기가 그 계정의
  // 알림까지 받지 않는다.
  for (const session of database.sessions) if (session.push?.endpoint === target.endpoint) delete session.push
  sessionOf(req).push = target
  await saveDatabase()
  res.json({ on: true })
})

pushRouter.delete("/", async (req, res) => {
  requireAccount(req)
  delete sessionOf(req).push
  await saveDatabase()
  res.status(204).end()
})

// 이 기기에 시험 알림을 보낸다.
pushRouter.post("/test", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, demoLocked)
  const target = sessionOf(req).push
  if (!target || !pushKey()) throw new HttpError(409, "이 기기의 알림을 먼저 켜 주세요.")
  await tests.take(senderKey(req, database, account))
  const sent = await sendPush(target, {
    title: translate("uniconnect 알림이 켜졌어요", langOf(req)),
    body: translate("새 제안과 메시지를 이 기기로 알려 드려요.", langOf(req)),
    path: "/me",
  })
  if (sent === "gone") {
    await dropPushTargets([target.endpoint])
    throw new HttpError(409, "이 기기의 알림이 끊겼어요. 다시 켜 주세요.")
  }
  if (!sent) throw new HttpError(502, "시험 알림을 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.")
  res.status(204).end()
})
