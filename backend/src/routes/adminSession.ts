import { randomBytes, randomUUID } from "node:crypto"
import { Router } from "express"

import { adminRequest, logAdmin } from "../lib/adminTools.js"
import { normalizeEmail } from "../lib/email.js"
import { HttpError } from "../lib/errors.js"
import { activeOperators, operatorFor, tokenClosed } from "../lib/operators.js"
import { decoyPasswordHash, hashPassword, upgradePasswordHash, verifyPassword } from "../lib/password.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { newSecret, otpauthUrl } from "../lib/totp.js"
import { checkPassword, text } from "../lib/validation.js"
import { hashToken } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Operator } from "../types.js"
import { requireAdmin } from "./admin.js"
import { enableTwoFactor, startTicket, ticketTries, twoFactorGuesses, useCode } from "./auth.js"

// 운영자 로그인이다. 비밀번호 다음에 앱의 코드를 받고, 처음 로그인이면 그 자리에서
// 2단계 로그인을 설정한다. 세션 토큰은 X-Admin-Token 헤더로 보낸다. 2단계 로그인을
// 마친 운영자가 처음 생기면 공유 ADMIN_TOKEN은 그때부터 거절한다.
export const adminSessionRouter = Router()

export const operatorSessionMs = 8 * 60 * 60 * 1000

const operatorLogins = createRateLimit({
  label: "운영자 로그인 · 주소별",
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "운영자 로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

// 여러 주소에서 나눠 보내는 추측은 이메일별로 센다. 없는 이메일도 똑같이 세므로 운영자를
// 알아내는 데 쓸 수 없다. 맞는 비밀번호는 돌려준다.
const operatorFailures = createRateLimit({
  label: "운영자 로그인 · 이메일별",
  limit: 30,
  windowMs: 15 * 60 * 1000,
  message: "이 이메일의 운영자 로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

const wrongLogin = "이메일 또는 비밀번호가 올바르지 않아요."


const operatorView = ({ id, email, name, createdAt, disabledAt, twoFactor }: Operator) => ({
  id,
  email,
  name,
  createdAt,
  ...(disabledAt ? { disabledAt } : {}),
  twoFactorOn: Boolean(twoFactor),
})

adminSessionRouter.post("/session", async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  await operatorLogins.take(clientKey(req))
  await operatorFailures.take(email)
  const password = String(req.body?.password ?? "")
  const found = getDatabase().operators?.find((item) => item.email === email && !item.disabledAt)
  // 없는 이메일에도 비밀번호를 확인해 응답 시간으로 운영자를 알아내지 못하게 한다.
  const hash = found?.passwordHash ?? (await decoyPasswordHash())
  if (!(await verifyPassword(password, hash)) || !found) throw new HttpError(401, wrongLogin)
  // 확인하는 동안 데이터를 새로 읽었을 수 있어 다시 찾고, 그사이 꺼졌으면 거절한다.
  const operator = getDatabase().operators?.find((item) => item.id === found.id && !item.disabledAt)
  if (!operator) throw new HttpError(401, wrongLogin)
  await operatorFailures.release(email)
  // 예전 강도로 저장된 비밀번호는 다시 만든다. 아래의 저장이 함께 남긴다.
  await upgradePasswordHash(operator, password)
  const ticket = startTicket(operator, req)
  if (operator.twoFactor) {
    await saveDatabase()
    res.json({ twoFactor: true, ticket })
    return
  }
  const secret = newSecret()
  operator.pendingTwoFactor = { secret, createdAt: Date.now() }
  await saveDatabase()
  res.json({ twoFactor: true, ticket, setup: { secret, url: otpauthUrl(secret, email) } })
})

adminSessionRouter.post("/session/code", async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  await operatorLogins.take(clientKey(req))
  const database = getDatabase()
  const operator = database.operators?.find((item) => item.email === email && !item.disabledAt)
  const ticket = operator?.loginTicket
  if (!operator || !ticket || ticket.hash !== hashToken(String(req.body?.ticket ?? "")) || ticket.expiresAt <= Date.now()) {
    throw new HttpError(401, "로그인 시간이 지났어요. 비밀번호부터 다시 입력해 주세요.")
  }
  await twoFactorGuesses.take(operator.id)
  const typed = String(req.body?.code ?? "")
  const recoveryCodes = !operator.twoFactor && operator.pendingTwoFactor ? enableTwoFactor(operator, typed) : undefined
  if (!recoveryCodes && !useCode(operator, typed)) {
    ticket.tries += 1
    if (ticket.tries >= ticketTries) delete operator.loginTicket
    await saveDatabase()
    throw new HttpError(401, ticket.tries >= ticketTries ? "코드를 너무 많이 틀렸어요. 비밀번호부터 다시 입력해 주세요." : "코드가 올바르지 않아요. 인증 앱의 6자리 코드나 복구 코드를 입력해 주세요.")
  }
  delete operator.loginTicket
  const token = randomBytes(32).toString("hex")
  const now = Date.now()
  const expiresAt = now + operatorSessionMs
  database.operatorSessions = (database.operatorSessions ?? []).filter((entry) => entry.expiresAt > now)
  database.operatorSessions.push({ tokenHash: hashToken(token), operatorId: operator.id, expiresAt, createdAt: now })
  const request = adminRequest.getStore()
  if (request) request.actor = operator.id
  logAdmin(database, "operator-logged-in", { kind: "operator", id: operator.id })
  await saveDatabase()
  await Promise.all([operatorLogins.reset(clientKey(req)), twoFactorGuesses.release(operator.id)])
  res.json({ token, expiresAt: new Date(expiresAt).toISOString(), operator: operatorView(operator), ...(recoveryCodes ? { recoveryCodes } : {}) })
})

// 지금 누구로 들어와 있는지와, 공유 토큰을 아직 받는지다.
adminSessionRouter.get("/session", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const operator = operatorFor(database, req.get("x-admin-token") ?? "")
  res.json({ operator: operator ? operatorView(operator) : null, tokenClosed: tokenClosed(database) })
})

adminSessionRouter.delete("/session", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const tokenHash = hashToken(req.get("x-admin-token") ?? "")
  if (!database.operatorSessions?.some((entry) => entry.tokenHash === tokenHash)) {
    throw new HttpError(400, "운영자 세션으로 로그인해 주세요.")
  }
  database.operatorSessions = database.operatorSessions.filter((entry) => entry.tokenHash !== tokenHash)
  await saveDatabase()
  res.json({ ok: true })
})

adminSessionRouter.get("/operators", async (req, res) => {
  await requireAdmin(req)
  res.json({ operators: (getDatabase().operators ?? []).map(operatorView) })
})

// 운영자를 더한다. 그 사람은 받은 비밀번호로 처음 로그인하며 2단계 로그인을 설정한다.
adminSessionRouter.post("/operators", async (req, res) => {
  await requireAdmin(req)
  const email = normalizeEmail(req.body?.email)
  const name = text(req.body?.name).slice(0, 40)
  const password = String(req.body?.password ?? "")
  if (!email.includes("@")) throw new HttpError(400, "이메일 형식을 확인해 주세요.")
  if (!name) throw new HttpError(400, "운영자 이름을 적어 주세요.")
  if (password.length < 12 || password.length > 64) throw new HttpError(400, "운영자 비밀번호는 12자에서 64자 사이로 정해 주세요.")
  checkPassword(password)
  const passwordHash = await hashPassword(password)
  const database = getDatabase()
  const operators = (database.operators ??= [])
  if (operators.some((item) => item.email === email && !item.disabledAt)) throw new HttpError(409, "이미 운영자로 등록된 이메일이에요.")
  const operator: Operator = { id: randomUUID(), email, name, passwordHash, createdAt: new Date().toISOString() }
  operators.push(operator)
  logAdmin(database, "operator-created", { kind: "operator", id: operator.id })
  await saveDatabase()
  res.status(201).json({ operator: operatorView(operator) })
})

// 운영자를 끄면 세션도 함께 끝난다. 기록에 이름이 남도록 지우지는 않는다. 마지막
// 운영자를 끄면 아무도 들어오지 못하므로 막는다.
adminSessionRouter.delete("/operators/:id", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const operator = database.operators?.find((item) => item.id === req.params.id && !item.disabledAt)
  if (!operator) throw new HttpError(404, "운영자를 찾을 수 없어요.")
  if (adminRequest.getStore()?.actor === operator.id) throw new HttpError(409, "자기 자신은 끌 수 없어요. 다른 운영자에게 부탁해 주세요.")
  // 2단계 로그인을 마친 사람이 남지 않으면 공유 토큰이 다시 열리므로 막는다.
  if (operator.twoFactor && activeOperators(database).length === 1) {
    throw new HttpError(409, "자기 자신은 끌 수 없어요. 다른 운영자에게 부탁해 주세요.")
  }
  operator.disabledAt = new Date().toISOString()
  delete operator.loginTicket
  database.operatorSessions = database.operatorSessions?.filter((entry) => entry.operatorId !== operator.id)
  logAdmin(database, "operator-disabled", { kind: "operator", id: operator.id })
  await saveDatabase()
  res.json({ operator: operatorView(operator) })
})
