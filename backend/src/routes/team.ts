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

// One account run by several people (lib/team.ts): the owner invites
// co-admins by email from 내 정보, each joins with the emailed code, a
// password of its own and proof of employment, and the owner can take one
// off, which ends its logins at once.
export const teamRouter = Router()

// How long an invitation's code lasts, and wrong codes before it goes.
const inviteMs = 7 * 24 * 60 * 60 * 1000
const inviteTries = 5

const invitesPerDay = createRateLimit({
  limit: 10,
  windowMs: 24 * 60 * 60 * 1000,
  message: "초대를 너무 많이 보냈어요. 내일 다시 보내 주세요.",
})
const joinFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "초대 코드 입력이 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

const codeHash = (email: string, code: string) => createHash("sha256").update(`${email} ${code.trim()}`).digest("hex")

// Those who joined and wait for the operators to check their document.
const waitingFor = (account: Account) =>
  applicationsOf(getDatabase()).filter((application) => application.accountId === account.id)

// The team as its people see it: the owner, the co-admins, the invitations
// still open and those waiting for the operators, never a password or code.
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

// The owner invites someone by email, five people at most with the
// invitations open; the code goes by email (and, in development, back as
// devCode like sign-up codes). Inviting the same address again sends a new code.
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
    tries: 0,
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

// Taking a co-admin off the team ends its logins at once.
teamRouter.delete("/members/:id", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const member = account.members?.find((item) => item.id === req.params.id)
  if (!member) throw new HttpError(404, "함께 관리하는 사람을 찾을 수 없어요.")
  const database = getDatabase()
  account.members = account.members!.filter((item) => item !== member)
  database.sessions = database.sessions.filter((session) => session.memberId !== member.id)
  await saveDatabase()
  res.json({ team: teamView(account, req.memberId) })
})

// The invited person joins with the email, the code, a password of its own
// and proof of employment, which the operators check before it counts
// (lib/applications.ts); its first login then sets up two-step login. Wrong
// codes count per address and email, and five end the invitation.
teamRouter.post("/join", async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const limitKey = `${clientKey(req)} ${email}`
  await joinFailures.take(limitKey)
  const database = getDatabase()
  // Every live invitation to this email, as several accounts may invite it;
  // the code says which one it is, so an earlier invitation from someone
  // else can't stand in the way.
  const invites = database.accounts.flatMap((item) =>
    (item.memberInvites ?? []).filter((invite) => invite.email === email && invite.expiresAt > Date.now()).map((invite) => ({ account: item, invite })),
  )
  if (invites.length === 0) throw new HttpError(400, "이 이메일로 온 초대가 없거나 기간이 지났어요. 대표에게 다시 초대해 달라고 해 주세요.")
  const hash = codeHash(email, String(req.body?.code ?? ""))
  const found = invites.find((item) => item.invite.codeHash === hash)
  if (!found) {
    for (const { account: inviter, invite } of invites) {
      invite.tries += 1
      if (invite.tries >= inviteTries) inviter.memberInvites = inviter.memberInvites!.filter((item) => item !== invite)
    }
    await saveDatabase()
    throw new HttpError(400, "초대 코드가 올바르지 않아요.")
  }
  const { account, invite } = found
  if (account.suspendedAt) throw new HttpError(403, "운영 정책에 따라 이용이 정지된 계정이에요.")
  const password = checkPassword(String(req.body?.password ?? ""))
  const document = parseDocument(req.body?.document, "재직 증명 서류를 올려 주세요.")
  // Used up before the slow hash, so one code makes one co-admin.
  account.memberInvites = account.memberInvites!.filter((item) => item !== invite)
  const passwordHash = await hashPassword(password)
  if (emailTaken(database, email)) throw new HttpError(409, "이미 uniconnect에서 쓰는 이메일이에요.")
  const member = { id: randomUUID(), name: invite.name, email, passwordHash, addedAt: new Date().toISOString() }
  await joinFailures.reset(limitKey)
  await holdApplication(database, saveDatabase, document, { kind: "member", name: invite.name, email, accountId: account.id, member })
  res.status(202).json({ pending: true })
})
