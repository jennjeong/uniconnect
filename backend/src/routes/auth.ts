import { randomBytes, randomInt, randomUUID } from "node:crypto"
import { Router, type Request } from "express"

import { config } from "../config.js"
import { paymentView } from "../lib/billing.js"
import { acceptedProposalsOf, dropOrphanAgreements, removeUploads } from "../lib/agreements.js"
import { findListing } from "../lib/catalog.js"
import { deviceLabel } from "../lib/devices.js"
import { applicationFolder, applicationFor, applicationsOf, holdApplication, parseDocument } from "../lib/applications.js"
import { emailRuleError, normalizeEmail } from "../lib/email.js"
import { forgetAdminRecords } from "../lib/adminTools.js"
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
import { forgetReferralRewards, referralRewardsOf, referralStats, referrerOf } from "../lib/referrals.js"
import { hashToken, requireAccount } from "../middleware/session.js"
import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
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
// 실패한 로그인만 주소와 이메일별로 센다. 한 사람의 오타가 다른 사람을
// 잠그지 않고, 다른 곳에서 맞는 비밀번호로 들어오는 것도 막지 않는다.
const loginFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * minute,
  message: "로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

// 만료된 코드는 틀린 추측이 아직 세어지는 동안 보관한다.
const keepUntil = (entry: EmailCode) =>
  entry.verifiedUntil ??
  Math.max(entry.expiresAt, (entry.firstSentAt ?? 0) + config.emailCodeAttemptWindowMs)

// 데모 계정의 비밀번호는 데모를 써 보는 모두에게 공개되어 있으므로, 아무도
// 바꾸거나 삭제하거나 초기화할 수 없다.
const isDemo = (account: Account) => Object.values(getDatabase().demoAccountIds).includes(account.id)
const demoLocked = "데모 계정은 비밀번호를 바꾸거나 탈퇴할 수 없어요."
// 신고 때문에 운영자가 정지한 계정이다.
const suspendedMessage = "운영 정책에 따라 이용이 정지된 계정이에요."

// 계정 주인들이 보는 계정의 모습이다. 비밀 값은 빼고, 공동 관리자가
// 로그인했다면 `memberId`가 어느 공동 관리자인지 알려 준다.
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

// 요청이 온 기기에서의 새 로그인이다(기기 목록에 보일 브라우저와 시스템).
// 주인의 것이거나 공동 관리자의 것이다.
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

// 로그인 방식을 바꾸기 전에 다시 묻는 계정의 현재 비밀번호다. 시도는 로그인
// 실패와 함께 센다. 앱이 만료된 세션으로 읽는 401은 쓰지 않는다.
async function checkCurrentPassword(req: Request, account: Account) {
  const limitKey = `${clientKey(req)} ${account.email}`
  await loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.password ?? ""), account.passwordHash))) {
    throw new HttpError(400, "비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
}

// 비밀번호 뒤에 로그인이 코드를 기다리는 시간과, 코드를 틀릴 수 있는
// 횟수다.
const ticketMs = 10 * minute
export const ticketTries = 5

// 비밀번호가 맞고 계정이 코드도 요구한다. 세션 대신 티켓을 내주고, 브라우저가
// 코드와 함께 다시 보낸다(POST /login/code).
export function startTicket(holder: Pick<Account, "loginTicket">, req: Request) {
  const ticket = randomBytes(24).toString("base64url")
  holder.loginTicket = {
    hash: hashToken(ticket),
    expiresAt: Date.now() + ticketMs,
    tries: 0,
    userAgent: req.get("user-agent")?.slice(0, 300),
  }
  return ticket
}

// 입력한 코드가 계정을 여는지 정한다. 우선 앱의 코드(각각 한 번)이거나 복구
// 코드(쓰면 소진된다)다. 쓴 것을 표시하며, 저장은 호출한 쪽이 한다.
export function useCode(account: Pick<Account, "twoFactor">, typed: string) {
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

// 설정 중인 2단계 로그인을 앱의 첫 코드로 켠다. 복구 코드는 한 번만 보여
// 주며, 코드가 틀리면 아무것도 주지 않는다.
export function enableTwoFactor(holder: Pick<Account, "twoFactor" | "pendingTwoFactor">, typed: string) {
  const pending = holder.pendingTwoFactor
  const step = pending && matchStep(pending.secret, typed)
  if (!pending || step === undefined) return undefined
  const recoveryCodes = newRecoveryCodes()
  holder.twoFactor = {
    secret: pending.secret,
    enabledAt: new Date().toISOString(),
    recoveryHashes: recoveryCodes.map(hashRecovery),
    usedStep: step,
  }
  delete holder.pendingTwoFactor
  return recoveryCodes
}

type CodePurpose = EmailCode["purpose"]

// 가입, 새 비밀번호("reset"), 계정 이전("change", 요청한 계정에 묶인다)을
// 위해 주소로 새 6자리 코드를 보내고, 만료 시각을 답한다. 메일은 앱이 보여 준
// 언어로 쓴다.
async function issueCode(email: string, role: Role, purpose: CodePurpose, lang: Lang, accountId?: string) {
  await codesPerEmail.take(email)
  const database = getDatabase()
  const code = String(randomInt(100000, 1000000))
  const expiresAt = Date.now() + config.emailCodeTtlMs
  // 틀린 추측은 한동안 새 코드로 이어지므로, 다시 요청해도 추측할 기회가
  // 늘지 않는다.
  const previous = database.emailCodes.find(
    (entry) => entry.email === email && entry.purpose === purpose && !entry.verifiedUntil,
  )
  const carried =
    previous && (previous.firstSentAt ?? 0) + config.emailCodeAttemptWindowMs > Date.now()
      ? previous
      : undefined
  // 이 용도의 코드만 바꾸므로, 가입 코드를 요청해도 다른 사람의 초기화나
  // 이메일 변경 코드를 끝내지 않는다.
  database.emailCodes = database.emailCodes.filter(
    (entry) => !(entry.email === email && entry.purpose === purpose) && keepUntil(entry) > Date.now(),
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
  // 주소를 증명하는 코드(가입, 그 주소로의 이전)만 데모에서 화면에 보인다.
  // 초기화 코드가 화면에 나오면 누구나 이메일만으로 어떤 계정이든 가져갈 수
  // 있다.
  return { email, expiresAt, ...(config.exposeEmailCodes && purpose !== "reset" ? { devCode: code } : {}) }
}

// `code`가 맞으면 그 코드 항목을 돌려주고, 아니면 추측을 세고 예외를 던진다.
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

// 가입이 매장의 초대로 왔는지 정한다. 그때만 브랜드가 개인 주소를 쓸 수 있고,
// 운영자가 볼 사업 서류를 낸다.
const invited = (database: Database, code: unknown) => database.invites.some((invite) => invite.code === String(code ?? ""))

// 가입 1단계다. 학교(학생단체) 또는 회사(협찬사) 주소로 6자리 코드를
// 보낸다.
authRouter.post("/email-code", async (req, res) => {
  await codesPerClient.take(clientKey(req))
  const role = parseRole(req.body?.role)
  const email = normalizeEmail(req.body?.email)
  const database = getDatabase()
  const ruleError = emailRuleError(role, email, { personal: role === "브랜드" && invited(database, req.body?.invite) })
  if (ruleError) throw new HttpError(400, ruleError)

  if (emailTaken(database, email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 로그인해 주세요.")
  }

  res.json(await issueCode(email, role, undefined, langOf(req)))
})

// 2단계다. 코드를 확인하고 이메일이 인증되었음을 증명하는 토큰을 돌려준다.
authRouter.post("/email-code/verify", async (req, res) => {
  await verifyPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const entry = await checkCode(email, text(req.body?.code), undefined)

  entry.verificationToken = randomBytes(24).toString("hex")
  entry.verifiedUntil = Date.now() + config.verificationTtlMs
  await saveDatabase()
  res.json({ verificationToken: entry.verificationToken })
})

// 3단계다. 인증된 이메일로 계정을 만들고 로그인시킨다.
authRouter.post("/signup", async (req, res) => {
  if (getDatabase().settings?.maintenance?.blockSignups) throw new HttpError(503, "지금은 새 가입을 잠시 막아 두었어요. 잠시 뒤에 다시 시도해 주세요.")
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
  const database = getDatabase()
  const shopInvite = role === "브랜드" && invited(database, body.invite)
  const ruleError = emailRuleError(role, email, { personal: shopInvite })
  if (ruleError) throw new HttpError(400, ruleError)
  // 초대받은 가게는 메일 주소와 상관없이 사업 서류를 보이고 기다린다. 개인 메일
  // 목록은 모든 주소를 가려내지 못한다.
  const document = shopInvite ? parseDocument(body.document, "사업자등록증이나 재직 서류를 올려 주세요.") : undefined

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
// 약관은 14세부터 회원으로 받는다. 더 어리면 보호자의 동의가 필요하다.
  if (body.over14 !== true) throw new HttpError(400, "만 14세 이상만 가입할 수 있어요.")
  if (emailTaken(database, email)) {
    throw new HttpError(409, "이미 가입된 이메일이에요. 로그인해 주세요.")
  }

  // 느린 비밀번호 해시 전에 인증을 소진하므로, 같은 인증을 한꺼번에 여러 번
  // 보내도 계정은 여러 개가 아니라 하나만 생긴다.
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
    // 앱이 달리 알려 주기 전까지 메일은 가입한 언어를 따른다.
    language: langOf(req),
  }
  // 회원의 초대 링크(친구 초대)로 가입한 경우다. 그런 코드가 아니면 조용히
  // 넘긴다.
  const referrer = referrerOf(database, body.referral)
  if (referrer) account.referredBy = referrer.id
  if (document) {
    await holdApplication(database, saveDatabase, document, { kind: "shop", name, email, account, invite: String(body.invite) })
    res.status(202).json({ pending: true })
    return
  }
  database.accounts.push(account)
  database.events[account.id] = []
  database.proposals[account.id] = []
  const token = startSession(account.id, req)
  await saveDatabase()

  res.status(201).json({ token, account: toPublic(account, req.memberId) })
})

// 비밀번호 찾기 1단계다. 계정이 가입한 주소로 코드를 보낸다.
authRouter.post("/password-reset/code", async (req, res) => {
  await codesPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  if (!email) throw new HttpError(400, "가입한 이메일을 입력해 주세요.")
  const account = getDatabase().accounts.find((item) => item.email === email)
  // 가입 단계가 이미 주소가 쓰였는지 알려 주므로, 여기서 알려 줘도 새로
  // 드러나는 것이 없다.
  if (!account) throw new HttpError(404, "가입된 이메일이 아니에요. 이메일을 확인하거나 회원가입해 주세요.")
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  res.json(await issueCode(email, account.role, "reset", langOf(req)))
})

// 2단계다. 맞는 코드로 새 비밀번호를 정하고, 계정의 모든 세션을 끝내고, 이
// 기기에서 로그인시킨다.
authRouter.post("/password-reset", async (req, res) => {
  await verifyPerClient.take(clientKey(req))
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? "")
  // 코드보다 먼저 확인하므로, 약한 비밀번호가 추측 기회를 쓰지 않는다.
  checkPassword(password)
  const entry = await checkCode(email, text(req.body?.code), "reset")

  const database = getDatabase()
  // 같은 코드를 가진 다른 요청이 그사이 썼을 수 있다.
  if (!database.emailCodes.includes(entry)) throw new HttpError(400, "인증번호를 먼저 받아 주세요.")
  const account = database.accounts.find((item) => item.email === email)
  if (!account) throw new HttpError(404, "가입된 이메일이 아니에요.")
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  // 느린 해시 전에 소진하므로, 코드 하나로는 비밀번호 하나만 정한다.
  database.emailCodes = database.emailCodes.filter((item) => item !== entry)
  account.passwordHash = await hashPassword(password)
  // 주인의 로그인은 끝나고, 공동 관리자의 로그인은 남는다.
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id || session.memberId)
  await loginFailures.reset(`${clientKey(req)} ${email}`)
  // 이메일만으로는 2단계 로그인을 통과하지 못한다. 다음에 코드를 묻는다.
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
  // 느린 비밀번호 확인 전에 세므로, 한꺼번에 보낸 시도가 한도를 빠져나가지
  // 못한다. 성공하면 집계를 지운다.
  await loginFailures.take(limitKey)
  const database = getDatabase()
  const owner = database.accounts.find((item) => item.email === email)
  // 공동 관리자는 자기 비밀번호로 함께 운영하는 계정에 로그인한다.
  const team = owner ? undefined : memberByEmail(database, email)
  const account = owner ?? team?.account
  const hashBefore = team ? team.member.passwordHash : account?.passwordHash

  const matches = account && hashBefore ? await verifyPassword(password, hashBefore) : false
  // 확인 도중 초기화, 변경, 삭제가 있으면 그쪽이 이기며, 옛 비밀번호로는 더
  // 이상 세션이 열리지 않는다.
  const hashAfter = team ? memberOf(account!, team.member.id)?.passwordHash : account?.passwordHash
  if (!account || !matches || hashAfter !== hashBefore || !database.accounts.includes(account)) {
    // 운영자를 기다리는 중이면 맞는 비밀번호에 그렇다고 알려 준다.
    const waiting = applicationFor(database, email)
    const hash = waiting?.account?.passwordHash ?? waiting?.member?.passwordHash
    if (hash && (await verifyPassword(password, hash))) throw new HttpError(403, "가입 서류를 확인하고 있어요. 승인되면 메일로 알려 드려요.")
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  if (account.role !== role) {
    const label = account.role === "학생단체" ? "협찬 받기" : "협찬 하기"
    throw new HttpError(403, `'${label}' 회원으로 가입된 계정이에요. 유형을 바꿔 로그인해 주세요.`)
  }
  // 공동 관리자는 2단계 로그인이 있어야 한다. 승인 뒤 첫 로그인에서 설정하며,
  // 첫 코드가 둘을 함께 끝낸다.
  if (team) {
    const ticket = startTicket(team.member, req)
    if (team.member.twoFactor) {
      await saveDatabase()
      res.json({ twoFactor: true, ticket })
      return
    }
    const secret = newSecret()
    team.member.pendingTwoFactor = { secret, createdAt: Date.now() }
    await saveDatabase()
    res.json({ twoFactor: true, ticket, setup: { secret, url: otpauthUrl(secret, email) } })
    return
  }
  if (account.twoFactor) {
    const ticket = startTicket(account, req)
    await saveDatabase()
    res.json({ twoFactor: true, ticket })
    return
  }

  // 다른 복사본에 밀리면 최신 데이터에서 세션을 다시 만든다. 그사이 초기화, 변경,
  // 삭제, 정지가 있었으면 그쪽이 이긴다.
  const opened = await retryConflicts(async () => {
    const current = getDatabase().accounts.find((item) => item.id === account.id)
    if (!current || current.passwordHash !== hashBefore) throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않아요.")
    if (current.suspendedAt) throw new HttpError(403, suspendedMessage)
    const token = startSession(current.id, req)
    await saveDatabase()
    return { token, account: current }
  })
  res.json({ token: opened.token, account: toPublic(opened.account, req.memberId) })
})

// 2단계 로그인이 켜진 로그인의 두 번째 단계다. 비밀번호 단계의 티켓과 앱의
// 코드 또는 복구 코드를 받는다. 틀린 코드는 비밀번호 실패와 함께 세고,
// 다섯 번이면 티켓이 끝난다.
authRouter.post("/login/code", async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const limitKey = `${clientKey(req)} ${email}`
  await loginFailures.take(limitKey)
  const database = getDatabase()
  const owner = database.accounts.find((item) => item.email === email)
  const team = owner ? undefined : memberByEmail(database, email)
  const account = owner ?? team?.account
  // 누구의 로그인인지 정한다. 계정의 주인이거나 자기 비밀번호를 가진 공동 관리자다.
  const holder = owner ?? team?.member
  const ticket = holder?.loginTicket
  if (!account || !holder || !ticket || ticket.hash !== hashToken(String(req.body?.ticket ?? "")) || ticket.expiresAt < Date.now()) {
    throw new HttpError(401, "로그인 시간이 지났어요. 비밀번호부터 다시 입력해 주세요.")
  }
  if (account.suspendedAt) throw new HttpError(403, suspendedMessage)
  const typed = String(req.body?.code ?? "")
  const recoveryCodes = !holder.twoFactor && holder.pendingTwoFactor ? enableTwoFactor(holder, typed) : undefined
  if (!recoveryCodes && !useCode(holder, typed)) {
    ticket.tries += 1
    if (ticket.tries >= ticketTries) delete holder.loginTicket
    await saveDatabase()
    throw new HttpError(401, ticket.tries >= ticketTries ? "코드를 너무 많이 틀렸어요. 비밀번호부터 다시 입력해 주세요." : "코드가 올바르지 않아요. 인증 앱의 6자리 코드나 복구 코드를 입력해 주세요.")
  }
  await loginFailures.reset(limitKey)
  delete holder.loginTicket
  const token = startSession(account.id, req, { userAgent: ticket.userAgent, ...(team ? { memberId: team.member.id } : {}) })
  await saveDatabase()
  res.json({
    token,
    account: toPublic(account, team?.member.id),
    recoveryLeft: holder.twoFactor?.recoveryHashes.length,
    ...(recoveryCodes ? { recoveryCodes } : {}),
  })
})

// 계정이 만든 것은 모두 함께 사라진다. 리스팅과 그와의 대화, 행사, 보내거나
// 받은 제안과 협찬 제안, 운영자에게 한 질문, 세션과 코드가 해당한다.
function removeAccount(database: Database, account: Account) {
  const listingId = account.groupId ?? account.brandId
  database.accounts = database.accounts.filter((item) => item.id !== account.id)
  // 이 계정이 초대한 사람들은 더 이상 이 계정을 가리키지 않는다.
  for (const invited of database.accounts) if (invited.referredBy === account.id) delete invited.referredBy
  forgetReferralRewards(database, account.id)
  // 총학생회의 동아리는 연결이 끊긴다.
  for (const club of database.accounts) {
    if (club.councils?.some((link) => link.accountId === account.id)) {
      club.councils = club.councils.filter((link) => link.accountId !== account.id)
    }
  }
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
  database.emailCodes = database.emailCodes.filter((entry) => entry.email !== account.email)
  database.inquiries = database.inquiries.filter((inquiry) => inquiry.accountId !== account.id)
  // 단체의 초대는 사라지고, 떠나는 브랜드가 합류했던 매장은 다시 열린다.
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
  // 그 제안에 대한 계약서도 사라지고, 저장된 사진도 그때 지운다.
  const droppedAgreements = dropOrphanAgreements(database)
  // 이 계정이 쓴 후기와 이 계정에 대한 후기다.
  database.reviews = database.reviews.filter(
    (review) => review.authorAccountId !== account.id && (!listingId || review.aboutId !== listingId),
  )
  // 이 계정이 한 신고와 이 계정에 대한 신고, 양쪽의 차단이다.
  database.reports = database.reports.filter(
    (report) => report.reporterId !== account.id && report.accountId !== account.id,
  )
  delete database.blocks[account.id]
  for (const [blocker, blocked] of Object.entries(database.blocks)) {
    database.blocks[blocker] = blocked.filter((id) => id !== account.id)
    if (database.blocks[blocker].length === 0) delete database.blocks[blocker]
  }
  // 이 계정의 게시판 글이다.
  database.posts = database.posts.filter((post) => post.accountId !== account.id)
  // 이 계정에 대한 운영자 메모와 운영 로그 항목이다.
  forgetAdminRecords(database, account.id)
  // Its 찜 list, and its listing in everyone else's.
  delete database.saved[account.id]
  for (const [saver, saved] of Object.entries(database.saved)) {
    database.saved[saver] = saved.filter((id) => id !== listingId)
    if (database.saved[saver].length === 0) delete database.saved[saver]
  }
  // 협찬사는 이 계정 행사의 결과를 지금 그대로 보관한다.
  freezeSponsorships(
    database,
    new Set(database.measurements.filter((item) => item.accountId === account.id).map((item) => item.eventId)),
  )
  database.measurements = database.measurements.filter((measurement) => measurement.accountId !== account.id)
  delete database.localCampaigns?.[account.id]
  // 떠나는 브랜드의 쿠폰은 더 이상 쓸 수 없고, 행사 합계에는 그 집계가 남는다.
  const leaving = new Set((database.sponsorships[account.id] ?? []).map((sponsorship) => sponsorship.id))
  for (const measurement of database.measurements) {
    measurement.sponsors = measurement.sponsors.filter((sponsor) => !leaving.has(sponsor.id))
  }
  // 이 계정 행사의 사진은 데이터를 저장한 뒤 없앤 계약서의 사진과 함께 지운다.
  droppedAgreements.push(...(database.events[account.id] ?? []).map((event) => eventPhotos(event.id)))
  // 아직 합류하지 않은 공동 관리자와 그 서류도 마찬가지다.
  const waiting = applicationsOf(database).filter(
    (application) => application.accountId === account.id || application.linkAccountId === account.id,
  )
  droppedAgreements.push(...waiting.map((application) => applicationFolder(application.id)))
  database.applications = applicationsOf(database).filter((application) => !waiting.includes(application))
  delete database.events[account.id]
  delete database.proposals[account.id]
  delete database.sponsorships[account.id]
  if (!listingId) return droppedAgreements
  database.brands = database.brands.filter((listing) => listing.id !== listingId)
  database.groups = database.groups.filter((listing) => listing.id !== listingId)
  // 이 계정의 대화는 사라지고, 그 파일은 데이터를 저장한 뒤 지운다.
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

// 탈퇴는 비밀번호를 다시 입력하면 계정과 계정이 만든 모든 것을 영구히
// 삭제한다. 데모 계정은 남아 있어 데모가 모두에게 계속 동작한다.
authRouter.delete("/account", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const database = getDatabase()
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 탈퇴할 수 없어요.")
  const limitKey = `${clientKey(req)} ${account.email}`
  await loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.password ?? ""), account.passwordHash))) {
    // 앱이 만료된 세션으로 읽는 401은 쓰지 않는다.
    throw new HttpError(400, "비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
  const droppedAgreements = removeAccount(database, account)
  await saveDatabase()
  await removeUploads(droppedAgreements)
  res.status(204).end()
})

// 내 정보에서 바꾸는 계정 운영자 정보다. 가입이 묻는 대로 이름, 직책, 전화
// 번호를 받는다(예를 들어 인수인계 뒤의 새 임원).
authRouter.put("/contact", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 담당자 정보를 바꿀 수 없어요.")
  account.contact = parseContact(req.body)
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId) })
})

// 내 정보의 이메일 설정이다. 받지 않을 알림 종류와 이메일 언어를 고르며, 앱이
// 보여 주는 언어가 다를 때마다 앱이 이를 보낸다. 코드와 계정 자체에 대한
// 알림은 항상 간다.
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

// 내 정보의 친구 초대다. 계정의 코드와 초대가 어떻게 되었는지를 보여 준다.
// 공유 데모 계정은 아무도 초대하지 않는다.
authRouter.get("/referral", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 친구를 초대할 수 없어요.")
  const had = account.referralCode
  const stats = referralStats(getDatabase(), account)
  if (!had) await saveDatabase()
  res.json(stats)
})

// 기수는 학생단체의 팀과 각 팀이 넘겨받은 날을 이전에 저장한 것을 바꿔
// 최신순으로 보여 준다. 공유 데모 계정은 두지 않는다.
authRouter.put("/terms", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 기수를 저장할 수 없어요.")
  if (account.role !== "학생단체") throw new HttpError(403, "학생단체만 기수를 적을 수 있어요.")
  const list: unknown = req.body?.terms
  if (!Array.isArray(list) || list.length > 20) throw new HttpError(400, "기수는 20개까지 적을 수 있어요.")
  const terms = list.map((item: unknown) => {
    const { name, from } = (item ?? {}) as Record<string, unknown>
    const label = text(name)
    const day = text(from)
    if (!label || label.length > 30) throw new HttpError(400, "기수 이름은 1~30자로 적어 주세요.")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
      throw new HttpError(400, "기수가 시작한 날을 골라 주세요.")
    }
    return { name: label, from: day }
  })
  if (new Set(terms.map((term) => term.from)).size !== terms.length) throw new HttpError(400, "같은 날 시작한 기수가 둘이에요.")
  terms.sort((a, b) => b.from.localeCompare(a.from))
  if (terms.length > 0) account.terms = terms
  else delete account.terms
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId) })
})

// 계정이 보관하는 제안 문구(제안 문구 템플릿)다. 개수와 이름 및 문구의 최대
// 길이(문구는 제안의 길이만큼)를 정한다.
const maxTemplates = 10
const maxTemplateName = 30
const maxTemplateText = 300

// 계정이 저장한 제안 문구로, 이전에 저장한 것을 바꾼다. 공유 데모 계정은 써
// 보는 모두가 서로의 것을 보게 되므로 두지 않는다.
authRouter.put("/templates", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 템플릿을 저장할 수 없어요.")
  const list: unknown = req.body?.templates
  if (!Array.isArray(list) || list.length > maxTemplates) {
    throw new HttpError(400, "템플릿은 10개까지 저장할 수 있어요.")
  }
  const templates = list.map((item: unknown) => {
    const { id, name, text } = (item ?? {}) as Record<string, unknown>
    if (typeof name !== "string" || !name.trim() || name.trim().length > maxTemplateName) {
      throw new HttpError(400, "템플릿 이름은 1~30자로 적어 주세요.")
    }
    if (typeof text !== "string" || !text.trim() || text.trim().length > maxTemplateText) {
      throw new HttpError(400, "템플릿 내용은 1~300자로 적어 주세요.")
    }
    return { id: typeof id === "string" && /^[\w-]{1,40}$/.test(id) ? id : randomUUID(), name: name.trim(), text: text.trim() }
  })
  if (templates.length > 0) account.templates = templates
  else delete account.templates
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId) })
})

// 한 번 저장에 담을 수 있는 알림 벨 항목의 최대 수로, 앱이 추적하는 만큼이다
// (lib/notifications.ts).
const maxReadNotices = 300

// 알림 벨의 읽음 표시다(앱의 lib/notifications.ts). 보이는 알림 중 계정이 읽은
// 부분이며 이전에 저장한 것을 바꾼다. 계정에 보관하므로 어느 기기에서나 같은
// 점이 보인다.
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

// 내 정보에서 비밀번호를 바꾼다. 현재 비밀번호를 먼저 받는다. 같은 사람의 다른
// 기기는 로그아웃되고 이 기기는 로그인이 유지된다. 공동 관리자는 자기
// 비밀번호를 바꾼다.
authRouter.post("/password", async (req, res) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, demoLocked)
  const member = memberOf(account, req.memberId)
  const next = checkPassword(String(req.body?.next ?? ""))
  const limitKey = `${clientKey(req)} ${member?.email ?? account.email}`
  await loginFailures.take(limitKey)
  if (!(await verifyPassword(String(req.body?.current ?? ""), member?.passwordHash ?? account.passwordHash))) {
    // 앱이 만료된 세션으로 읽는 401은 쓰지 않는다.
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

// 계정 인수인계(예를 들어 단체의 새 임원)의 1단계다. 비밀번호를 받아 새 로그인
// 이메일로 코드를 보낸다.
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
    // 앱이 만료된 세션으로 읽는 401은 쓰지 않는다.
    throw new HttpError(400, "지금 비밀번호가 올바르지 않아요.")
  }
  await loginFailures.reset(limitKey)
  res.json(await issueCode(email, account.role, "change", langOf(req), account.id))
})

// 2단계다. 새 주소로 온 코드가 계정을 그 주소로 옮긴다. 다른 기기는
// 로그아웃되고 옛 주소로 알림이 간다.
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
  // 주인의 다른 로그인은 끝나고, 공동 관리자의 로그인은 남는다.
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

// 계정이 만들었거나 받은 모든 것을 보관하거나 다른 곳으로 옮길 수 있게
// 준다(자기 데이터를 볼 권리). 비밀번호를 뺀 계정 정보, 리스팅, 행사, 양방향
// 제안, 협찬, 측정(참여자의 패스나 기록은 제외), 대화, 질문, 보내거나 합류한
// 초대, 협찬의 계약서(사진은 이름으로), 쓰고 받은 후기, 신고와 차단, 저장한
// 리스팅, 게시판 글을 담는다.
authRouter.get("/export", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const listing = findListing(database, account)
  res.json({
    exportedAt: new Date().toISOString(),
    account: toPublic(account, req.memberId),
  // 주인과 함께 운영하는 사람들이며 비밀번호는 뺀다.
    team: (account.members ?? []).map(({ id, name, email, addedAt }) => ({ id, name, email, addedAt })),
  // 총학생회의 코드와 동아리가 연결한 총학생회다.
    council: { code: account.councilCode?.code ?? null, links: account.councils ?? [] },
    listing: listing ?? null,
    referralRewards: referralRewardsOf(database)
      .filter((item) => item.referrerId === account.id)
      .map(({ id, days, status, createdAt, decidedAt }) => ({ id, days, status, createdAt, decidedAt })),
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
    localCampaign: database.localCampaigns?.[account.id] ?? null,
    measurements: database.measurements
      .filter((item) => item.accountId === account.id)
      .map(({ passes: _passes, log: _log, staffPin: _staffPin, groupPin: _groupPin, sponsors, ...measurement }) => ({
        ...measurement,
        sponsors: sponsors.map(({ staffPin: _pin, ...sponsor }) => sponsor),
      })),
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

// 내 정보에서 2단계 로그인을 켠다. 먼저 비밀번호를 받고, 앱용 새 비밀 값(QR
// 주소)을 만들어 코드로 확인한 뒤에야 효력이 생긴다.
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

// 앱의 첫 코드로 켜고, 복구 코드는 이때 한 번만 보여 준다.
authRouter.post("/two-factor/enable", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const pending = account.pendingTwoFactor
  if (!pending || pending.createdAt + 30 * minute < Date.now()) {
    throw new HttpError(409, "설정 시간이 지났어요. 처음부터 다시 켜 주세요.")
  }
  const limitKey = `${clientKey(req)} ${account.email}`
  await loginFailures.take(limitKey)
  const recoveryCodes = enableTwoFactor(account, String(req.body?.code ?? ""))
  if (!recoveryCodes) throw new HttpError(400, "코드가 올바르지 않아요. 인증 앱에 보이는 6자리 코드를 입력해 주세요.")
  await loginFailures.reset(limitKey)
  await saveDatabase()
  res.json({ account: toPublic(account, req.memberId), recoveryCodes })
})

// 끄려면 비밀번호와 코드(또는 복구 코드)를 받는다.
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

// 이 계정에 로그인된 기기를 요청한 기기가 먼저, 그다음 마지막 사용순으로
// 보여 준다. 공유 데모 계정의 기기는 써 보는 모두의 것이다.
const sessionId = (session: Session) => session.tokenHash.slice(0, 16)
const ownDevices = (req: Request) => {
  const account = requireAccount(req)
  if (isDemo(account)) throw new HttpError(403, "데모 계정은 로그인한 기기를 볼 수 없어요.")
  return account
}
// 주인은 계정의 모든 로그인을 보며 공동 관리자의 것은 이름과 함께 보고,
// 공동 관리자는 자기 것만 본다.
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

// 다른 모든 기기를 로그아웃시킨다(주인이면 공동 관리자의 기기도). 이 기기는 남는다.
authRouter.delete("/sessions", async (req, res) => {
  const account = ownDevices(req)
  const keep = req.sessionToken ? hashToken(req.sessionToken) : ""
  const database = getDatabase()
  const others = new Set(sessionsOf(req, account).filter((session) => session.tokenHash !== keep))
  database.sessions = database.sessions.filter((session) => !others.has(session))
  await saveDatabase()
  res.status(204).end()
})

// 이 계정의 기기 하나를 로그아웃시킨다.
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
