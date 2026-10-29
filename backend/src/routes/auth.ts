import { randomBytes, randomInt, randomUUID } from "node:crypto"
import { Router, type Request } from "express"

import { config } from "../config.js"
import { paymentView } from "../lib/billing.js"
import { acceptedProposalsOf, dropOrphanAgreements, removeUploads } from "../lib/agreements.js"
import { findListing } from "../lib/catalog.js"
import { deviceLabel } from "../lib/devices.js"
import { emailRuleError, normalizeEmail } from "../lib/email.js"
import { HttpError } from "../lib/errors.js"
import { sendVerificationCode } from "../lib/mailer.js"
import { notify } from "../lib/notices.js"
import { chatFiles, eventPhotos } from "../lib/photos.js"
import { langOf, type Lang } from "../lib/i18n.js"
import { hashPassword, verifyPassword } from "../lib/password.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { freezeSponsorships } from "../lib/sponsorships.js"
import { emailTaken, memberByEmail, memberOf, requireOwner } from "../lib/team.js"
import { hashRecovery, matchStep, newRecoveryCodes, newSecret, otpauthUrl } from "../lib/totp.js"
import { accountTypes, checkPassword, mailKinds, parseContact, parseRole, text } from "../lib/validation.js"
import { hashToken, requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database, EmailCode, MailKind, PublicAccount, Role, Session, SocialProvider } from "../types.js"

export const authRouter = Router()

const minute = 60 * 1000
const codesPerClient = createRateLimit({
  limit: config.codesPerClient,
  windowMs: 15 * minute,
  message: "인증번호 요청이 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})
const codesPerEmail = createRateLimit({
  limit: 5,
  windowMs: 30 * minute,
  message: "이 이메일로 인증번호를 너무 자주 받았어요. 30분 뒤에 다시 시도해 주세요.",
})
const verifyPerClient = createRateLimit({
  limit: config.codesPerClient + 10,
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
// An account the operators stopped over a report.
const suspendedMessage = "운영 정책에 따라 이용이 정지된 계정이에요."

// The account as its own people see it, without its secrets; `memberId`
// says which co-admin is logged in, if one is.
export function toPublic(
  { passwordHash, termsAgreedAt, calendarFeed, customerKey, twoFactor, pendingTwoFactor, loginTicket, members, memberInvites, social, councilCode, councils, ...account }: Account,
  memberId?: string,
): PublicAccount {
  const member = memberId ? members?.find((item) => item.id === memberId) : undefined
  return {
    ...account,
    ...(twoFactor ? { twoFactorOn: true as const } : {}),
    ...(social && Object.keys(social).length ? { socialLinks: Object.keys(social) as SocialProvider[] } : {}),
    ...(member ? { asMember: { id: member.id, name: member.name, email: member.email } } : {}),
  }
}

// A new login on the device the request came from (its browser and system
// for the device list), the owner's or a co-admin's.
export function startSession(
  accountId: string,
  req: Request,
  { userAgent = req.get("user-agent"), memberId }: { userAgent?: string; memberId?: string } = {},
) {
  const database = getDatabase()
  const token = randomBytes(32).toString("hex")
  const now = Date.now()
  database.sessions = database.sessions.filter((session) => session.expiresAt > now)
  database.sessions.push({
    tokenHash: hashToken(token),
    accountId,
    expiresAt: now + config.sessionTtlMs,
    device: deviceLabel(userAgent),
    createdAt: now,
    lastUsedAt: now,
    ...(memberId ? { memberId } : {}),
  })
  return token
}

// The account's current password, asked again before a change to how it
// logs in; tries count with the login failures. Not 401, which the app
// reads as a session that has run out.
async function checkCurrentPassword(req: Request, account: Account) {
  const limitKey = `${clientKey(req)} ${account.email}`
  await loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.password ?? ""), account.passwordHash))) {
    throw new HttpError(400, "비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
}

// How long a login waits for its code after the password, and how many
// wrong codes it takes.
const ticketMs = 10 * minute
const ticketTries = 5

// The password was right, and the account asks for a code too: a ticket
// the browser sends back with the code (POST /login/code) instead of a
// session.
export function startTicket(account: Account, req: Request) {
  const ticket = randomBytes(24).toString("base64url")
  account.loginTicket = {
    hash: hashToken(ticket),
    expiresAt: Date.now() + ticketMs,
    tries: 0,
    userAgent: req.get("user-agent")?.slice(0, 300),
  }
  return ticket
}

// Whether a typed code opens the account: the app's code for now (each once)
// or one of its recovery codes (used up). Marks what it used; the caller saves.
function useCode(account: Account, typed: string) {
  const twoFactor = account.twoFactor
  if (!twoFactor) return false
  const step = matchStep(twoFactor.secret, typed, Date.now(), twoFactor.usedStep)
  if (step !== undefined) {
    twoFactor.usedStep = step
    return true
  }
  const hash = hashRecovery(typed)
  if (typed.replace(/[^A-Za-z0-9]/g, "").length !== 8 || !twoFactor.recoveryHashes.includes(hash)) return false
  twoFactor.recoveryHashes = twoFactor.recoveryHashes.filter((item) => item !== hash)
  return true
}

type CodePurpose = EmailCode["purpose"]

// Sends a new 6-digit code to the address, for signing up, for a new
// password ("reset") or for moving an account to it ("change", tied to the
// account asking), and answers with when it expires. The email is in the
// language the app was shown in.
async function issueCode(email: string, role: Role, purpose: CodePurpose, lang: Lang, accountId?: string) {
  await codesPerEmail.take(email)
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
    ...(accountId ? { accountId } : {}),
  })
  await saveDatabase()
  await sendVerificationCode(email, code, purpose ?? "signup", lang)
  // Only codes that prove an address (signing up, moving to it) are shown
  // for the demo. A reset code on screen would let anyone take over any
  // account by its email.
  return { email, expiresAt, ...(config.exposeEmailCodes && purpose !== "reset" ? { devCode: code } : {}) }
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
  await codesPerClient.take(clientKey(req))
  const role = parseRole(req.body?.role)
  const email = normalizeEmail(req.body?.email)
  const ruleError = emailRuleError(role, email)
  if (ruleError) throw new HttpError(400, ruleError)

  const database = getDatabase()
  if (emailTaken(database, email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 로그인해 주세요.")
  }

  res.json(await issueCode(email, role, undefined, langOf(req)))
})

// Step 2: check the code and hand back a token that proves the email is verified.
authRouter.post("/email-code/verify", async (req, res) => {
  await verifyPerClient.take(clientKey(req))
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
  const contact = parseContact(body.contact)
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
  checkPassword(password)
  if (body.agreedToTerms !== true) throw new HttpError(400, "이용약관에 동의해 주세요.")
  // The terms take members from 14; younger ones would need a guardian's consent.
  if (body.over14 !== true) throw new HttpError(400, "만 14세 이상만 가입할 수 있어요.")
  if (emailTaken(database, email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 로그인해 주세요.")
  }

  // The verification is used up before the slow password hash, so the same
  // one sent several times at once makes one account, not several.
  database.emailCodes = database.emailCodes.filter((entry) => entry.email !== email)
  const passwordHash = await hashPassword(password)
  if (emailTaken(database, email)) {
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
    contact,
    passwordHash,
    termsAgreedAt: now,
    createdAt: now,
    // Its emails follow the language it signed up in until the app says otherwise.
    language: langOf(req),
  }
  database.accounts.push(account)
  database.events[account.id] = []
  database.proposals[account.id] = []
  const token = startSession(account.id, req)
  await saveDatabase()

  res.status(201).json({ token, account: toPublic(account, req.memberId) })
})

// Forgotten password, step 1: a code to the address the account signed up
// with.
authRouter.post("/password-reset/code", async (req, res) => {
  await codesPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  if (!email) throw new HttpError(400, "가입한 이메일을 입력해 주세요.")
  const account = getDatabase().accounts.find((item) => item.email === email)
  // Sign-up already says whether an address is taken, so saying it here
  // gives nothing new away.
  if (!account) throw new HttpError(404, "가입된 이메일이 아니에요. 이메일을 확인하거나 회원가입해 주세요.")
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  res.json(await issueCode(email, account.role, "reset", langOf(req)))
})

// Step 2: the right code sets the new password, ends every session the
// account had and logs it in here.
authRouter.post("/password-reset", async (req, res) => {
  await verifyPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? "")
  // Checked before the code, so a weak password costs no guess.
  checkPassword(password)
  const entry = await checkCode(email, text(req.body?.code), "reset")

  const database = getDatabase()
  // Another request with the same code may have used it meanwhile.
  if (!database.emailCodes.includes(entry)) throw new HttpError(400, "인증번호를 먼저 받아 주세요.")
  const account = database.accounts.find((item) => item.email === email)
  if (!account) throw new HttpError(404, "가입된 이메일이 아니에요.")
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  // Used up before the slow hash, so the code sets one password only.
  database.emailCodes = database.emailCodes.filter((item) => item !== entry)
  account.passwordHash = await hashPassword(password)
  // The owner's logins end; the co-admins' own stay.
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id || session.memberId)
  await loginFailures.reset(`${clientKey(req)} ${email}`)
  // The email alone doesn't pass two-step login: the code is asked next.
  if (account.twoFactor) {
    const ticket = startTicket(account, req)
    await saveDatabase()
    res.json({ twoFactor: true, ticket })
    return
  }
  const token = startSession(account.id, req)
  await saveDatabase()
  res.json({ token, account: toPublic(account, req.memberId) })
})

authRouter.post("/login", async (req, res) => {
  const role = parseRole(req.body?.role)
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? "")
  const limitKey = `${clientKey(req)} ${email}`
  // Counted before the slow password check, so attempts sent all at once
  // cannot slip past the limit; a success clears the count.
  await loginFailures.take(limitKey)
  const database = getDatabase()
  const owner = database.accounts.find((item) => item.email === email)
  // A co-admin logs in to the account it helps run, with its own password.
  const team = owner ? undefined : memberByEmail(database, email)
  const account = owner ?? team?.account
  const hashBefore = team ? team.member.passwordHash : account?.passwordHash

  const matches = account && hashBefore ? await verifyPassword(password, hashBefore) : false
  // A reset, change or deletion during the check wins: the old password no
  // longer opens a session.
  const hashAfter = team ? memberOf(account!, team.member.id)?.passwordHash : account?.passwordHash
  if (!account || !matches || hashAfter !== hashBefore || !database.accounts.includes(account)) {
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  if (account.role !== role) {
    const label = account.role === "학생단체" ? "협찬 받기" : "협찬 하기"
    throw new HttpError(403, `'${label}' 회원으로 가입된 계정이에요. 유형을 바꿔 로그인해 주세요.`)
  }
  if (team) {
    const token = startSession(account.id, req, { memberId: team.member.id })
    await saveDatabase()
    res.json({ token, account: toPublic(account, team.member.id) })
    return
  }
  if (account.twoFactor) {
    const ticket = startTicket(account, req)
    await saveDatabase()
    res.json({ twoFactor: true, ticket })
    return
  }

  const token = startSession(account.id, req)
  await saveDatabase()
  res.json({ token, account: toPublic(account, req.memberId) })
})

// The second step of a login with two-step login on: the ticket from the
// password step and a code from the app or a recovery code. Wrong codes
// count with the password failures, and five end the ticket.
authRouter.post("/login/code", async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const limitKey = `${clientKey(req)} ${email}`
  await loginFailures.take(limitKey)
  const database = getDatabase()
  const account = database.accounts.find((item) => item.email === email)
  const ticket = account?.loginTicket
  if (!account || !ticket || ticket.hash !== hashToken(String(req.body?.ticket ?? "")) || ticket.expiresAt < Date.now()) {
    throw new HttpError(401, "로그인 시간이 지났어요. 비밀번호부터 다시 입력해 주세요.")
  }
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  if (!useCode(account, String(req.body?.code ?? ""))) {
    ticket.tries += 1
    if (ticket.tries >= ticketTries) delete account.loginTicket
    await saveDatabase()
    throw new HttpError(401, ticket.tries >= ticketTries ? "코드를 너무 많이 틀렸어요. 비밀번호부터 다시 입력해 주세요." : "코드가 올바르지 않아요. 인증 앱의 6자리 코드나 복구 코드를 입력해 주세요.")
  }
  await loginFailures.reset(limitKey)
  delete account.loginTicket
  const token = startSession(account.id, req, { userAgent: ticket.userAgent })
  await saveDatabase()
  res.json({ token, account: toPublic(account, req.memberId), recoveryLeft: account.twoFactor?.recoveryHashes.length })
})

// Everything an account made goes with it: its listing and the
// conversations with it, its events, the proposals and offers it sent or
// received, its questions to the operators, its sessions and codes.
function removeAccount(database: Database, account: Account) {
  const listingId = account.groupId ?? account.brandId
  database.accounts = database.accounts.filter((item) => item.id !== account.id)
  // A council's clubs are unlinked from it.
  for (const club of database.accounts) {
    if (club.councils?.some((link) => link.accountId === account.id)) {
      club.councils = club.councils.filter((link) => link.accountId !== account.id)
    }
  }
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
  database.emailCodes = database.emailCodes.filter((entry) => entry.email !== account.email)
  database.inquiries = database.inquiries.filter((inquiry) => inquiry.accountId !== account.id)
  // A group's invitations go; shops a leaving brand had joined from are open again.
  database.invites = database.invites.filter((invite) => invite.accountId !== account.id)
  for (const invite of database.invites) {
    if (!account.brandId || invite.brandId !== account.brandId) continue
    delete invite.brandId
    delete invite.acceptedAt
  }
  database.requests = database.requests.filter(
    (request) =>
      request.fromAccountId !== account.id && (!account.brandId || request.brandId !== account.brandId),
  )
  database.offers = database.offers.filter(
    (offer) =>
      offer.fromAccountId !== account.id && (!account.groupId || offer.groupId !== account.groupId),
  )
  // The agreements about those proposals go too; their photos once saved.
  const droppedAgreements = dropOrphanAgreements(database)
  // Reviews it wrote, and those about it.
  database.reviews = database.reviews.filter(
    (review) => review.authorAccountId !== account.id && (!listingId || review.aboutId !== listingId),
  )
  // Reports it made and those about it, and blocks either way.
  database.reports = database.reports.filter(
    (report) => report.reporterId !== account.id && report.accountId !== account.id,
  )
  delete database.blocks[account.id]
  for (const [blocker, blocked] of Object.entries(database.blocks)) {
    database.blocks[blocker] = blocked.filter((id) => id !== account.id)
    if (database.blocks[blocker].length === 0) delete database.blocks[blocker]
  }
  // Its board posts.
  database.posts = database.posts.filter((post) => post.accountId !== account.id)
  // Its 찜 list, and its listing in everyone else's.
  delete database.saved[account.id]
  for (const [saver, saved] of Object.entries(database.saved)) {
    database.saved[saver] = saved.filter((id) => id !== listingId)
    if (database.saved[saver].length === 0) delete database.saved[saver]
  }
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
  // Its events' photos go with the dropped agreements' once the data is saved.
  droppedAgreements.push(...(database.events[account.id] ?? []).map((event) => eventPhotos(event.id)))
  delete database.events[account.id]
  delete database.proposals[account.id]
  delete database.sponsorships[account.id]
  if (!listingId) return droppedAgreements
  database.brands = database.brands.filter((listing) => listing.id !== listingId)
  database.groups = database.groups.filter((listing) => listing.id !== listingId)
  // Its conversations go, and their files once the data is saved.
  droppedAgreements.push(
    ...database.conversations
      .filter((conversation) => conversation.groupId === listingId || conversation.brandId === listingId)
      .map((conversation) => chatFiles(conversation.id)),
  )
  database.conversations = database.conversations.filter(
    (conversation) => conversation.groupId !== listingId && conversation.brandId !== listingId,
  )
  for (const [owner, brandIds] of Object.entries(database.proposals)) {
    database.proposals[owner] = brandIds.filter((brandId) => brandId !== listingId)
  }
  return droppedAgreements
}

// Leaving: with the password typed again, the account and everything it
// made are deleted for good. The demo accounts stay, so the demo keeps
// working for everyone.
authRouter.delete("/account", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const database = getDatabase()
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 탈퇴할 수 없어요.")
  const limitKey = `${clientKey(req)} ${account.email}`
  await loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.password ?? ""), account.passwordHash))) {
    // Not 401, which the app reads as a session that has run out.
    throw new HttpError(400, "비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
  const droppedAgreements = removeAccount(database, account)
  await saveDatabase()
  await removeUploads(droppedAgreements)
  res.status(204).end()
})

// The person running the account, from 내 정보: name, position and phone,
// as sign-up asks for them (a new officer after a handover, say).
authRouter.put("/contact", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 담당자 정보를 바꿀 수 없어요.")
  account.contact = parseContact(req.body)
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId) })
})

// 내 정보's choices for email: the kinds of notice to leave out, and the
// language the emails are in, which the app sends whenever the one it shows
// differs. Codes and notices about the account itself always go.
authRouter.put("/preferences", async (req, res) => {
  const account = requireAccount(req)
  const language: unknown = req.body?.language
  const mailOff: unknown = req.body?.mailOff
  if (language !== undefined && language !== "ko" && language !== "en") {
    throw new HttpError(400, "고를 수 없는 언어예요.")
  }
  if (mailOff !== undefined && (!Array.isArray(mailOff) || mailOff.some((kind) => !mailKinds.includes(kind as MailKind)))) {
    throw new HttpError(400, "고를 수 없는 메일 종류예요.")
  }
  if (language) account.language = language
  if (Array.isArray(mailOff)) {
    const off = mailKinds.filter((kind) => mailOff.includes(kind))
    if (off.length > 0) account.mailOff = off
    else delete account.mailOff
  }
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId) })
})

// Most parts of the bell's notices one save may hold, as many as the app
// tracks (lib/notifications.ts).
const maxReadNotices = 300

// The bell's read marks (lib/notifications.ts in the app): the parts of the
// notices on show that the account has read, replacing those saved before.
// Kept on the account, so every device shows the same dot.
authRouter.put("/notices", async (req, res) => {
  const account = requireAccount(req)
  const read: unknown = req.body?.read
  if (
    !Array.isArray(read) ||
    read.length > maxReadNotices ||
    !read.every((part) => typeof part === "string" && part.length > 0 && part.length <= 200)
  ) {
    throw new HttpError(400, "읽은 알림을 알 수 없어요.")
  }
  const parts = [...new Set(read as string[])]
  if (parts.length > 0) account.readNotices = parts
  else delete account.readNotices
  await saveDatabase()
  res.json({ readNotices: parts })
})

// Changing the password from 내 정보: the current one first. Other devices
// of the same person are logged out; this one stays logged in. A co-admin
// changes its own.
authRouter.post("/password", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  const member = memberOf(account, req.memberId)
  const next = checkPassword(String(req.body?.next ?? ""))
  const limitKey = `${clientKey(req)} ${member?.email ?? account.email}`
  await loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.current ?? ""), member?.passwordHash ?? account.passwordHash))) {
    // Not 401, which the app reads as a session that has run out.
    throw new HttpError(400, "지금 비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
  const passwordHash = await hashPassword(next)
  if (member) member.passwordHash = passwordHash
  else account.passwordHash = passwordHash
  const keep = req.sessionToken ? hashToken(req.sessionToken) : ""
  getDatabase().sessions = getDatabase().sessions.filter(
    (session) => session.accountId !== account.id || session.memberId !== req.memberId || session.tokenHash === keep,
  )
  await saveDatabase()
  res.status(204).end()
})

// Handing an account over (a group's new officers, say), step 1: with the
// password, a code to the new login email.
authRouter.post("/email/code", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 로그인 이메일을 바꿀 수 없어요.")
  await codesPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const ruleError = emailRuleError(account.role, email)
  if (ruleError) throw new HttpError(400, ruleError)
  if (email === account.email) throw new HttpError(400, "지금 쓰는 이메일과 같아요.")
  if (emailTaken(getDatabase(), email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 다른 이메일을 입력해 주세요.")
  }
  const limitKey = `${clientKey(req)} ${account.email}`
  await loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.password ?? ""), account.passwordHash))) {
    // Not 401, which the app reads as a session that has run out.
    throw new HttpError(400, "지금 비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
  res.json(await issueCode(email, account.role, "change", langOf(req), account.id))
})

// Step 2: the code from the new address moves the account there. Other
// devices are logged out, and the old address hears of it.
authRouter.post("/email", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  await verifyPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const entry = await checkCode(email, text(req.body?.code), "change")
  const database = getDatabase()
  if (entry.accountId !== account.id || !database.emailCodes.includes(entry)) {
    throw new HttpError(400, "인증번호를 먼저 받아 주세요.")
  }
  if (emailTaken(database, email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 다른 이메일을 입력해 주세요.")
  }
  const previous = account.email
  database.emailCodes = database.emailCodes.filter((item) => item !== entry)
  account.email = email
  // The owner's other logins end; the co-admins' own stay.
  const keep = req.sessionToken ? hashToken(req.sessionToken) : ""
  database.sessions = database.sessions.filter(
    (session) => session.accountId !== account.id || session.memberId || session.tokenHash === keep,
  )
  await saveDatabase()
  void notify(
    { ...account, email: previous },
    "account",
    "로그인 이메일이 바뀌었어요",
    [
      `uniconnect 계정의 로그인 이메일이 바뀌었어요: ${email}`,
      "직접 바꾸지 않았다면 도움말 센터로 바로 알려 주세요.",
    ],
    "/faq",
  )
  res.json({ account: toPublic(account, req.memberId) })
})

// Everything the account made or was sent, to keep or move elsewhere (the
// right to see one's own data): its details without the password, its
// listing, events, proposals both ways, sponsorships, measurement (without
// participants' passes or records), conversations, questions, the
// invitations it sent or joined from, its sponsorships' agreements (the
// photos by name), the reviews it wrote and got, its reports and blocks, the
// listings it saved and its board posts.
authRouter.get("/export", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const listing = findListing(database, account)
  res.json({
    exportedAt: new Date().toISOString(),
    account: toPublic(account, req.memberId),
    // The people running it with the owner, without their passwords.
    team: (account.members ?? []).map(({ id, name, email, addedAt }) => ({ id, name, email, addedAt })),
    // A council's code, and the councils a club linked to.
    council: { code: account.councilCode?.code ?? null, links: account.councils ?? [] },
    listing: listing ?? null,
    events: database.events[account.id] ?? [],
    proposalsSent: [
      ...database.requests.filter((item) => item.fromAccountId === account.id),
      ...database.offers.filter((item) => item.fromAccountId === account.id),
    ],
    proposalsReceived: [
      ...(account.brandId ? database.requests.filter((item) => item.brandId === account.brandId) : []),
      ...(account.groupId ? database.offers.filter((item) => item.groupId === account.groupId) : []),
    ],
    sponsorships: database.sponsorships[account.id] ?? [],
    measurements: database.measurements
      .filter((item) => item.accountId === account.id)
      .map(({ passes: _passes, log: _log, ...measurement }) => measurement),
    conversations: listing
      ? database.conversations.filter((item) => item.groupId === listing.id || item.brandId === listing.id)
      : [],
    inquiries: database.inquiries.filter((item) => item.accountId === account.id),
    invites: database.invites.filter(
      (item) => item.accountId === account.id || (account.brandId !== undefined && item.brandId === account.brandId),
    ),
    agreements: acceptedProposalsOf(database, account).flatMap(
      (proposal) => database.agreements.find((item) => item.id === proposal.id) ?? [],
    ),
    reviews: database.reviews.filter(
      (item) => item.authorAccountId === account.id || (listing !== undefined && item.aboutId === listing.id),
    ),
    reports: database.reports.filter((item) => item.reporterId === account.id),
    posts: database.posts.filter((post) => post.accountId === account.id),
    payments: (database.payments ?? []).filter((payment) => payment.accountId === account.id).map(paymentView),
    saved: (database.saved[account.id] ?? []).map((id) => ({
      id,
      name: [...database.brands, ...database.groups].find((item) => item.id === id)?.name ?? null,
    })),
    blocked: (database.blocks[account.id] ?? []).map(
      (id) => database.accounts.find((item) => item.id === id)?.name ?? id,
    ),
  })
})

authRouter.get("/me", (req, res) => {
  res.json({ account: toPublic(requireAccount(req), req.memberId) })
})

// Turning on two-step login from 내 정보, with the password first: a new
// secret for the app (its QR address), confirmed with a code before it counts.
authRouter.post("/two-factor/setup", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 2단계 인증을 켤 수 없어요.")
  if (account.twoFactor) throw new HttpError(409, "2단계 인증이 이미 켜져 있어요.")
  await checkCurrentPassword(req, account)
  const secret = newSecret()
  account.pendingTwoFactor = { secret, createdAt: Date.now() }
  await saveDatabase()
  res.json({ secret, url: otpauthUrl(secret, account.email) })
})

// The app's first code turns it on, and the recovery codes show this once.
authRouter.post("/two-factor/enable", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const pending = account.pendingTwoFactor
  if (!pending || pending.createdAt + 30 * minute < Date.now()) {
    throw new HttpError(409, "설정 시간이 지났어요. 처음부터 다시 켜 주세요.")
  }
  const limitKey = `${clientKey(req)} ${account.email}`
  await loginFailures.take(limitKey)
  const step = matchStep(pending.secret, String(req.body?.code ?? ""))
  if (step === undefined) throw new HttpError(400, "코드가 올바르지 않아요. 인증 앱에 보이는 6자리 코드를 입력해 주세요.")
  await loginFailures.reset(limitKey)
  const recoveryCodes = newRecoveryCodes()
  account.twoFactor = {
    secret: pending.secret,
    enabledAt: new Date().toISOString(),
    recoveryHashes: recoveryCodes.map(hashRecovery),
    usedStep: step,
  }
  delete account.pendingTwoFactor
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId), recoveryCodes })
})

// Turning it off takes the password and a code (or a recovery code).
authRouter.post("/two-factor/disable", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  if (!account.twoFactor) throw new HttpError(409, "2단계 인증이 꺼져 있어요.")
  await checkCurrentPassword(req, account)
  if (!useCode(account, String(req.body?.code ?? ""))) {
    throw new HttpError(400, "코드가 올바르지 않아요. 인증 앱의 6자리 코드나 복구 코드를 입력해 주세요.")
  }
  delete account.twoFactor
  delete account.loginTicket
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId) })
})

// The devices logged in to this account, the one asking first, then by
// last use. The shared demo accounts' devices are everyone's trying them.
const sessionId = (session: Session) => session.tokenHash.slice(0, 16)
const ownDevices = (req: Request) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 로그인한 기기를 볼 수 없어요.")
  return account
}
// The owner sees every login to the account, its co-admins' by their names;
// a co-admin sees its own.
const sessionsOf = (req: Request, account: Account) =>
  getDatabase().sessions.filter(
    (session) =>
      session.accountId === account.id &&
      session.expiresAt > Date.now() &&
      (!req.memberId || session.memberId === req.memberId),
  )
authRouter.get("/sessions", (req, res) => {
  const account = ownDevices(req)
  const current = req.sessionToken ? hashToken(req.sessionToken) : ""
  const sessions = sessionsOf(req, account)
    .map((session) => ({
      id: sessionId(session),
      device: session.device ?? "알 수 없는 기기",
      ...(session.memberId && !req.memberId ? { member: memberOf(account, session.memberId)?.name ?? "" } : {}),
      ...(session.createdAt ? { createdAt: new Date(session.createdAt).toISOString() } : {}),
      ...(session.lastUsedAt ? { lastUsedAt: new Date(session.lastUsedAt).toISOString() } : {}),
      current: session.tokenHash === current,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))
  res.json({ sessions })
})

// Logs out every other device (the owner's: its co-admins' too); this one stays.
authRouter.delete("/sessions", async (req, res) => {
  const account = ownDevices(req)
  const keep = req.sessionToken ? hashToken(req.sessionToken) : ""
  const database = getDatabase()
  const others = new Set(sessionsOf(req, account).filter((session) => session.tokenHash !== keep))
  database.sessions = database.sessions.filter((session) => !others.has(session))
  await saveDatabase()
  res.status(204).end()
})

// Logs out one device of this account.
authRouter.delete("/sessions/:id", async (req, res) => {
  const account = ownDevices(req)
  const database = getDatabase()
  const session = sessionsOf(req, account).find((item) => sessionId(item) === req.params.id)
  if (!session) throw new HttpError(404, "로그인한 기기를 찾을 수 없어요.")
  database.sessions = database.sessions.filter((item) => item !== session)
  await saveDatabase()
  res.status(204).end()
})

authRouter.post("/logout", async (req, res) => {
  const database = getDatabase()
  const tokenHash = req.sessionToken ? hashToken(req.sessionToken) : ""
  database.sessions = database.sessions.filter((session) => session.tokenHash !== tokenHash)
  await saveDatabase()
  res.status(204).end()
})
