import { createHash, randomInt, randomUUID } from "node:crypto"
import { Router } from "express"

import { config } from "../config.js"
import { applicationsOf, holdApplication, parseDocument } from "../lib/applications.js"
import { emailRuleError, normalizeEmail } from "../lib/email.js"
import { HttpError } from "../lib/errors.js"
import { translate } from "../lib/i18n.js"
import { sendMail } from "../lib/mailer.js"
import { hashPassword } from "../lib/password.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { emailTaken, requireOwner, teamLimit } from "../lib/team.js"
import { checkPassword, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account } from "../types.js"

// 여러 사람이 운영하는 계정 하나다(lib/team.ts). 주인이 내 정보에서 이메일로
// 공동 관리자를 초대하고, 각자 메일로 받은 코드, 자기 비밀번호, 재직 증빙으로
// 합류한다. 주인은 한 명을 빼서 그 로그인을 바로 끝낼 수 있다.
export const teamRouter = Router()

// 초대 코드가 유효한 시간.
const inviteMs = 7 * 24 * 60 * 60 * 1000

const invitesPerDay = createRateLimit({
  limit: 10,
  windowMs: 24 * 60 * 60 * 1000,
  message: "초대를 너무 많이 보냈어요. 내일 다시 보내 주세요.",
})
// 코드를 맞히는 시도는 주소와 상관없이 이메일별로도, 확인하기 전에 센다. 동시에
// 보내도 한도를 넘지 못한다. 초대를 지우는 대신
// 잠시 막는다. 로그인 없이 부르는 경로라, 지우면 이메일만 아는 사람이 남의
// 초대를 없앨 수 있다.
const joinTriesPerEmail = createRateLimit({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  message: "초대 코드를 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.",
})

const joinFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "초대 코드 입력이 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

const codeHash = (email: string, code: string) => createHash("sha256").update(`${email} ${code.trim()}`).digest("hex")

// 합류해서 운영자가 서류를 확인하기를 기다리는 사람들이다.
const waitingFor = (account: Account) =>
  applicationsOf(getDatabase()).filter((application) => application.accountId === account.id)

// 사람들에게 보이는 팀의 모습이다. 주인, 공동 관리자, 아직 열려 있는 초대,
// 운영자를 기다리는 사람을 담고 비밀번호나 코드는 담지 않는다.
function teamView(account: Account, memberId: string | undefined) {
  return {
    owner: { name: account.contact?.name ?? account.name, email: account.email },
    members: (account.members ?? []).map(({ id, name, email, addedAt }) => ({ id, name, email, addedAt })),
    invites: (account.memberInvites ?? [])
      .filter((invite) => invite.expiresAt > Date.now())
      .map(({ id, name, email, invitedAt, expiresAt }) => ({ id, name, email, invitedAt, expiresAt: new Date(expiresAt).toISOString() })),
    waiting: waitingFor(account).map(({ id, name, email, requestedAt }) => ({ id, name, email, requestedAt })),
    you: memberId ?? "owner",
  }
}

teamRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  res.json({ team: teamView(account, req.memberId) })
})

// 주인이 이메일로 사람을 초대한다. 열린 초대와 합쳐 최대 다섯 명이며, 코드는
// 메일로 간다(개발 중에는 가입 코드처럼 devCode로 돌려준다). 같은 주소를 다시
// 초대하면 새 코드를 보낸다.
teamRouter.post("/invites", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 함께 관리할 사람을 초대할 수 없어요.")
  const name = text(req.body?.name)
  const email = normalizeEmail(req.body?.email)
  if (!name || name.length > 30) throw new HttpError(400, "초대할 사람의 이름을 30자 이하로 적어 주세요.")
  const ruleError = emailRuleError(account.role, email)
  if (ruleError) throw new HttpError(400, ruleError)
  if (emailTaken(database, email)) throw new HttpError(409, "이미 uniconnect에서 쓰는 이메일이에요. 다른 이메일로 초대해 주세요.")
  const open = (account.memberInvites ?? []).filter((invite) => invite.expiresAt > Date.now() && invite.email !== email)
  if ((account.members?.length ?? 0) + open.length + waitingFor(account).length >= teamLimit) {
    throw new HttpError(409, `함께 관리하는 사람은 대표 말고 ${teamLimit}명까지예요.`)
  }
  await invitesPerDay.take(account.id)
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const invite = {
    id: randomUUID(),
    name,
    email,
    codeHash: codeHash(email, code),
    invitedAt: new Date().toISOString(),
    expiresAt: Date.now() + inviteMs,
  }
  account.memberInvites = [...open, invite]
  await saveDatabase()
  const say = (line: string) => translate(line, account.language ?? "ko")
  try {
    await sendMail(
      email,
      say(`[uniconnect] ${account.name}에서 함께 관리하자고 초대했어요`),
      [
        say(`${account.name}의 uniconnect 계정을 함께 관리하도록 초대받았어요. 초대 코드는 ${code} 입니다.`),
        say("uniconnect 로그인 창의 '초대받았나요?'에서 이 이메일과 코드를 입력하고 비밀번호를 정해 주세요. 코드는 7일 동안 쓸 수 있어요."),
        ...(config.siteUrl ? [config.siteUrl] : []),
      ].join("\n"),
    )
  } catch {
    account.memberInvites = account.memberInvites.filter((item) => item.id !== invite.id)
    await saveDatabase()
    throw new HttpError(502, "초대 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.")
  }
  res.status(201).json({ team: teamView(account, req.memberId), ...(config.exposeEmailCodes ? { devCode: code } : {}) })
})

teamRouter.delete("/invites/:id", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  account.memberInvites = (account.memberInvites ?? []).filter((invite) => invite.id !== req.params.id)
  await saveDatabase()
  res.json({ team: teamView(account, req.memberId) })
})

// 공동 관리자를 팀에서 빼면 그 로그인이 바로 끝난다.
teamRouter.delete("/members/:id", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const member = account.members?.find((item) => item.id === req.params.id)
  if (!member) throw new HttpError(404, "함께 관리하는 사람을 찾을 수 없어요.")
  const database = getDatabase()
  account.members = account.members!.filter((item) => item !== member)
  database.sessions = database.sessions.filter((session) => session.memberId !== member.id)
  // 빠진 사람도 봤을 수 있는 공개 링크를 멈춘다. 링크만 있으면 로그인 없이 열리기 때문이다.
  // 대표가 다시 만들면 새 주소가 된다.
  const shared = (database.sponsorships[account.id] ?? []).filter((item) => item.shareToken)
  const linksStopped = Boolean(account.calendarFeed || account.ledger?.token || shared.length)
  delete account.calendarFeed
  if (account.ledger) delete account.ledger.token
  for (const sponsorship of shared) delete sponsorship.shareToken
  await saveDatabase()
  res.json({ team: teamView(account, req.memberId), linksStopped })
})

// 초대받은 사람이 이메일, 코드, 자기 비밀번호, 재직 증빙으로 합류한다. 재직
// 증빙은 효력이 생기기 전에 운영자가 확인하며(lib/applications.ts), 첫
// 로그인에서 2단계 로그인을 설정한다. 틀린 코드는 주소와 이메일마다, 이메일별로도
// 세어 잠시 막는다.
teamRouter.post("/join", async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const limitKey = `${clientKey(req)} ${email}`
  await joinFailures.take(limitKey)
  await joinTriesPerEmail.take(email)
  const database = getDatabase()
  // 이 이메일에 온 살아 있는 초대를 모두 찾는다. 여러 계정이 같은 이메일을
  // 초대할 수 있기 때문이다. 어느 초대인지는 코드가 말해 주므로, 다른 사람이
  // 앞서 보낸 초대가 방해하지 않는다.
  const invites = database.accounts.flatMap((item) =>
    (item.memberInvites ?? []).filter((invite) => invite.email === email && invite.expiresAt > Date.now()).map((invite) => ({ account: item, invite })),
  )
  if (invites.length === 0) throw new HttpError(400, "이 이메일로 온 초대가 없거나 기간이 지났어요. 대표에게 다시 초대해 달라고 해 주세요.")
  const hash = codeHash(email, String(req.body?.code ?? ""))
  const found = invites.find((item) => item.invite.codeHash === hash)
  if (!found) throw new HttpError(400, "초대 코드가 올바르지 않아요.")
  const { account, invite } = found
  if (account.suspendedAt) throw new HttpError(403, "운영 정책에 따라 이용이 정지된 계정이에요.")
  const password = checkPassword(String(req.body?.password ?? ""))
  const document = parseDocument(req.body?.document, "재직 증명 서류를 올려 주세요.")
  // 느린 해시 전에 코드를 소진해, 코드 하나로 공동 관리자 한 명만 만든다.
  account.memberInvites = account.memberInvites!.filter((item) => item !== invite)
  const passwordHash = await hashPassword(password)
  if (emailTaken(database, email)) throw new HttpError(409, "이미 uniconnect에서 쓰는 이메일이에요.")
  const member = { id: randomUUID(), name: invite.name, email, passwordHash, addedAt: new Date().toISOString() }
  await joinFailures.reset(limitKey)
  await joinTriesPerEmail.reset(email)
  await holdApplication(database, saveDatabase, document, { kind: "member", name: invite.name, email, accountId: account.id, member })
  res.status(202).json({ pending: true })
})
