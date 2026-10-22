import { randomBytes, randomInt, randomUUID } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { emailRuleError, normalizeEmail } from "../lib/email.js"
import { HttpError } from "../lib/errors.js"
import { sendVerificationCode } from "../lib/mailer.js"
import { hashPassword, verifyPassword } from "../lib/password.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { freezeSponsorships } from "../lib/sponsorships.js"
import { accountTypes, parseRole, text } from "../lib/validation.js"
import { hashToken, requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database, EmailCode, PublicAccount, Role } from "../types.js"

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

// The demo accounts' password is published for everyone trying the demo,
// so nobody may change it, delete them or reset it.
const isDemo = (account: Account) => Object.values(getDatabase().demoAccountIds).includes(account.id)
const demoLocked = "데모 계정은 비밀번호를 바꾸거나 탈퇴할 수 없어요."

const toPublic = ({ passwordHash, termsAgreedAt, ...account }: Account): PublicAccount =>
  account

function startSession(accountId: string) {
  const database = getDatabase()
  const token = randomBytes(32).toString("hex")
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now())
  database.sessions.push({ tokenHash: hashToken(token), accountId, expiresAt: Date.now() + config.sessionTtlMs })
  return token
}

type CodePurpose = EmailCode["purpose"]

// Sends a new 6-digit code to the address, for signing up or (with
// "reset") for a new password, and answers with when it expires.
async function issueCode(email: string, role: Role, purpose: CodePurpose) {
  codesPerEmail.take(email)
  const database = getDatabase()
  const code = String(randomInt(100000, 1000000))
  const expiresAt = Date.now() + config.emailCodeTtlMs
  // Wrong guesses carry over to the new code for a while, so asking again
  // does not buy another round of guesses.
  const previous = database.emailCodes.find(
    (entry) => entry.email === email && entry.purpose === purpose && !entry.verifiedUntil,
  )
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
    ...(purpose ? { purpose } : {}),
  })
  await saveDatabase()
  await sendVerificationCode(email, code, purpose ?? "signup")
  // Only sign-up codes are shown for the demo. A reset code on screen would
  // let anyone take over any account by its email.
  return { email, expiresAt, ...(config.exposeEmailCodes && !purpose ? { devCode: code } : {}) }
}

// The code entry when `code` is right; otherwise counts the guess and throws.
async function checkCode(email: string, code: string, purpose: CodePurpose) {
  const entry = getDatabase().emailCodes.find(
    (item) => item.email === email && item.purpose === purpose,
  )
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
  return entry
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

  res.json(await issueCode(email, role, undefined))
})

// Step 2: check the code and hand back a token that proves the email is verified.
authRouter.post("/email-code/verify", async (req, res) => {
  verifyPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const entry = await checkCode(email, text(req.body?.code), undefined)

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
  // The terms take members from 14; younger ones would need a guardian's consent.
  if (body.over14 !== true) throw new HttpError(400, "만 14세 이상만 가입할 수 있어요.")
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

// Forgotten password, step 1: a code to the address the account signed up
// with.
authRouter.post("/password-reset/code", async (req, res) => {
  codesPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  if (!email) throw new HttpError(400, "가입한 이메일을 입력해 주세요.")
  const account = getDatabase().accounts.find((item) => item.email === email)
  // Sign-up already says whether an address is taken, so saying it here
  // gives nothing new away.
  if (!account) throw new HttpError(404, "가입된 이메일이 아니에요. 이메일을 확인하거나 회원가입해 주세요.")
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  res.json(await issueCode(email, account.role, "reset"))
})

// Step 2: the right code sets the new password, ends every session the
// account had and logs it in here.
authRouter.post("/password-reset", async (req, res) => {
  verifyPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? "")
  // Checked before the code, so a short password costs no guess.
  if (password.length < 8) throw new HttpError(400, "비밀번호는 8자 이상이어야 해요.")
  const entry = await checkCode(email, text(req.body?.code), "reset")

  const database = getDatabase()
  const account = database.accounts.find((item) => item.email === email)
  if (!account) throw new HttpError(404, "가입된 이메일이 아니에요.")
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  account.passwordHash = await hashPassword(password)
  database.emailCodes = database.emailCodes.filter((item) => item !== entry)
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
  loginFailures.reset(`${clientKey(req)} ${email}`)
  const token = startSession(account.id)
  await saveDatabase()
  res.json({ token, account: toPublic(account) })
})

authRouter.post("/login", async (req, res) => {
  const role = parseRole(req.body?.role)
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? "")
  const limitKey = `${clientKey(req)} ${email}`
  // Counted before the slow password check, so attempts sent all at once
  // cannot slip past the limit; a success clears the count.
  loginFailures.take(limitKey)
  const database = getDatabase()
  const account = database.accounts.find((item) => item.email === email)
  const hashBefore = account?.passwordHash

  const matches = account && hashBefore ? await verifyPassword(password, hashBefore) : false
  // A reset, change or deletion during the check wins: the old password no
  // longer opens a session.
  if (!account || !matches || account.passwordHash !== hashBefore || !database.accounts.includes(account)) {
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

// Everything an account made goes with it: its listing and the
// conversations with it, its events, the proposals and offers it sent or
// received, its questions to the operators, its sessions and codes.
function removeAccount(database: Database, account: Account) {
  const listingId = account.groupId ?? account.brandId
  database.accounts = database.accounts.filter((item) => item.id !== account.id)
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
  database.emailCodes = database.emailCodes.filter((entry) => entry.email !== account.email)
  database.inquiries = database.inquiries.filter((inquiry) => inquiry.accountId !== account.id)
  database.requests = database.requests.filter(
    (request) =>
      request.fromAccountId !== account.id && (!account.brandId || request.brandId !== account.brandId),
  )
  database.offers = database.offers.filter(
    (offer) =>
      offer.fromAccountId !== account.id && (!account.groupId || offer.groupId !== account.groupId),
  )
  // Sponsors keep the results of this account's events as they stand.
  freezeSponsorships(
    database,
    new Set(database.measurements.filter((item) => item.accountId === account.id).map((item) => item.eventId)),
  )
  database.measurements = database.measurements.filter((measurement) => measurement.accountId !== account.id)
  // A leaving brand's coupons can no longer be used; the events' totals keep its counts.
  const leaving = new Set((database.sponsorships[account.id] ?? []).map((sponsorship) => sponsorship.id))
  for (const measurement of database.measurements) {
    measurement.sponsors = measurement.sponsors.filter((sponsor) => !leaving.has(sponsor.id))
  }
  delete database.events[account.id]
  delete database.proposals[account.id]
  delete database.sponsorships[account.id]
  if (!listingId) return
  database.brands = database.brands.filter((listing) => listing.id !== listingId)
  database.groups = database.groups.filter((listing) => listing.id !== listingId)
  database.conversations = database.conversations.filter(
    (conversation) => conversation.groupId !== listingId && conversation.brandId !== listingId,
  )
  for (const [owner, brandIds] of Object.entries(database.proposals)) {
    database.proposals[owner] = brandIds.filter((brandId) => brandId !== listingId)
  }
}

// Leaving: with the password typed again, the account and everything it
// made are deleted for good. The demo accounts stay, so the demo keeps
// working for everyone.
authRouter.delete("/account", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 탈퇴할 수 없어요.")
  const limitKey = `${clientKey(req)} ${account.email}`
  loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.password ?? ""), account.passwordHash))) {
    // Not 401, which the app reads as a session that has run out.
    throw new HttpError(400, "비밀번호가 올바르지 않아요.")
  }
  loginFailures.reset(limitKey)
  removeAccount(database, account)
  await saveDatabase()
  res.status(204).end()
})

// Changing the password from 내 정보: the current one first. Other devices
// are logged out; this one stays logged in.
authRouter.post("/password", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  const next = String(req.body?.next ?? "")
  if (next.length < 8) throw new HttpError(400, "새 비밀번호는 8자 이상이어야 해요.")
  const limitKey = `${clientKey(req)} ${account.email}`
  loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.current ?? ""), account.passwordHash))) {
    // Not 401, which the app reads as a session that has run out.
    throw new HttpError(400, "지금 비밀번호가 올바르지 않아요.")
  }
  loginFailures.reset(limitKey)
  account.passwordHash = await hashPassword(next)
  const keep = req.sessionToken ? hashToken(req.sessionToken) : ""
  getDatabase().sessions = getDatabase().sessions.filter(
    (session) => session.accountId !== account.id || session.tokenHash === keep,
  )
  await saveDatabase()
  res.status(204).end()
})

authRouter.get("/me", (req, res) => {
  res.json({ account: toPublic(requireAccount(req)) })
})

authRouter.post("/logout", async (req, res) => {
  const database = getDatabase()
  const tokenHash = req.sessionToken ? hashToken(req.sessionToken) : ""
  database.sessions = database.sessions.filter((session) => session.tokenHash !== tokenHash)
  await saveDatabase()
  res.status(204).end()
})
