import { randomBytes, randomInt, randomUUID } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { emailRuleError, normalizeEmail } from "../lib/email.js"
import { HttpError } from "../lib/errors.js"
import { sendVerificationCode } from "../lib/mailer.js"
import { hashPassword, verifyPassword } from "../lib/password.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { accountTypes, parseRole, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, EmailCode, PublicAccount } from "../types.js"

export const authRouter = Router()

const minute = 60 * 1000
const codesPerClient = createRateLimit({
  limit: 20,
  windowMs: 15 * minute,
  message: "인증번호 요청이 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})
const codesPerEmail = createRateLimit({
  limit: 5,
  windowMs: 30 * minute,
  message: "이 이메일로 인증번호를 너무 자주 받았어요. 30분 뒤에 다시 시도해 주세요.",
})
const verifyPerClient = createRateLimit({
  limit: 30,
  windowMs: 15 * minute,
  message: "인증 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})
// Only failed logins count, per address and email, so one person's typos
// neither lock out others nor block the right password from elsewhere.
const loginFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * minute,
  message: "로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

// An expired code is kept as long as its wrong guesses still count.
const keepUntil = (entry: EmailCode) =>
  entry.verifiedUntil ??
  Math.max(entry.expiresAt, (entry.firstSentAt ?? 0) + config.emailCodeAttemptWindowMs)

const toPublic = ({ passwordHash, termsAgreedAt, ...account }: Account): PublicAccount =>
  account

function startSession(accountId: string) {
  const database = getDatabase()
  const token = randomBytes(32).toString("hex")
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now())
  database.sessions.push({ token, accountId, expiresAt: Date.now() + config.sessionTtlMs })
  return token
}

// Step 1 of sign-up: send a 6-digit code to a school (student group) or
// company (sponsor) address.
authRouter.post("/email-code", async (req, res) => {
  codesPerClient.take(clientKey(req))
  const role = parseRole(req.body?.role)
  const email = normalizeEmail(req.body?.email)
  const ruleError = emailRuleError(role, email)
  if (ruleError) throw new HttpError(400, ruleError)

  const database = getDatabase()
  if (database.accounts.some((account) => account.email === email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 로그인해 주세요.")
  }

  codesPerEmail.take(email)

  const code = String(randomInt(100000, 1000000))
  const expiresAt = Date.now() + config.emailCodeTtlMs
  // Wrong guesses carry over to the new code for a while, so asking again
  // does not buy another round of guesses.
  const previous = database.emailCodes.find((entry) => entry.email === email && !entry.verifiedUntil)
  const carried =
    previous && (previous.firstSentAt ?? 0) + config.emailCodeAttemptWindowMs > Date.now()
      ? previous
      : undefined
  database.emailCodes = database.emailCodes.filter(
    (entry) => entry.email !== email && keepUntil(entry) > Date.now(),
  )
  database.emailCodes.push({
    email,
    role,
    code,
    expiresAt,
    attempts: carried?.attempts ?? 0,
    firstSentAt: carried?.firstSentAt ?? Date.now(),
  })
  await saveDatabase()
  await sendVerificationCode(email, code)

  res.json({ email, expiresAt, ...(config.exposeEmailCodes ? { devCode: code } : {}) })
})

// Step 2: check the code and hand back a token that proves the email is verified.
authRouter.post("/email-code/verify", async (req, res) => {
  verifyPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const code = text(req.body?.code)
  const database = getDatabase()
  const entry = database.emailCodes.find((item) => item.email === email)

  if (!entry) throw new HttpError(400, "인증번호를 먼저 받아 주세요.")
  if (entry.expiresAt < Date.now()) {
    throw new HttpError(400, "인증 시간이 지났어요. 인증번호를 다시 받아 주세요.")
  }
  if (entry.attempts >= config.emailCodeMaxAttempts) {
    throw new HttpError(429, "인증 시도가 너무 많아요. 30분 뒤에 인증번호를 다시 받아 주세요.")
  }
  if (entry.code !== code) {
    entry.attempts += 1
    await saveDatabase()
    throw new HttpError(400, "인증번호가 일치하지 않아요.")
  }

  entry.verificationToken = randomBytes(24).toString("hex")
  entry.verifiedUntil = Date.now() + config.verificationTtlMs
  await saveDatabase()
  res.json({ verificationToken: entry.verificationToken })
})

// Step 3: create the account with the verified email and log it in.
authRouter.post("/signup", async (req, res) => {
  const body = req.body ?? {}
  const role = parseRole(body.role)
  const name = text(body.name)
  const type = text(body.type)
  const school = text(body.school)
  const email = normalizeEmail(body.email)
  const password = String(body.password ?? "")

  if (!name) {
    throw new HttpError(400, `${role === "학생단체" ? "단체명" : "브랜드명"}을 입력해 주세요.`)
  }
  if (name.length > 40) throw new HttpError(400, "이름은 40자 이하로 입력해 주세요.")
  if (!accountTypes[role].includes(type)) throw new HttpError(400, "분류를 다시 선택해 주세요.")
  if (role === "학생단체" && !school) throw new HttpError(400, "학교를 입력해 주세요.")
  const ruleError = emailRuleError(role, email)
  if (ruleError) throw new HttpError(400, ruleError)

  const database = getDatabase()
  const verified = database.emailCodes.find(
    (entry) =>
      entry.email === email &&
      entry.role === role &&
      entry.verificationToken !== undefined &&
      entry.verificationToken === body.verificationToken &&
      (entry.verifiedUntil ?? 0) > Date.now(),
  )
  if (!verified) throw new HttpError(400, "이메일 인증을 완료해 주세요.")
  if (password.length < 8) throw new HttpError(400, "비밀번호는 8자 이상이어야 해요.")
  if (body.agreedToTerms !== true) throw new HttpError(400, "이용약관에 동의해 주세요.")
  if (database.accounts.some((account) => account.email === email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 로그인해 주세요.")
  }

  const now = new Date().toISOString()
  const account: Account = {
    id: randomUUID(),
    role,
    name,
    type,
    school: role === "학생단체" ? school : "",
    email,
    passwordHash: await hashPassword(password),
    termsAgreedAt: now,
    createdAt: now,
  }
  database.accounts.push(account)
  database.emailCodes = database.emailCodes.filter((entry) => entry.email !== email)
  database.events[account.id] = []
  database.proposals[account.id] = []
  const token = startSession(account.id)
  await saveDatabase()

  res.status(201).json({ token, account: toPublic(account) })
})

authRouter.post("/login", async (req, res) => {
  const role = parseRole(req.body?.role)
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? "")
  const limitKey = `${clientKey(req)} ${email}`
  loginFailures.check(limitKey)
  const database = getDatabase()
  const account = database.accounts.find((item) => item.email === email)

  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    loginFailures.hit(limitKey)
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않아요.")
  }
  loginFailures.reset(limitKey)
  if (account.role !== role) {
    const label = account.role === "학생단체" ? "협찬 받기" : "협찬 하기"
    throw new HttpError(403, `'${label}' 회원으로 가입된 계정이에요. 유형을 바꿔 로그인해 주세요.`)
  }

  const token = startSession(account.id)
  await saveDatabase()
  res.json({ token, account: toPublic(account) })
})

authRouter.get("/me", (req, res) => {
  res.json({ account: toPublic(requireAccount(req)) })
})

authRouter.post("/logout", async (req, res) => {
  const database = getDatabase()
  database.sessions = database.sessions.filter((session) => session.token !== req.sessionToken)
  await saveDatabase()
  res.status(204).end()
})
