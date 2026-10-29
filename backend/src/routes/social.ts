import { createHash, randomBytes } from "node:crypto"
import { Router, type Request, type Response } from "express"

import { config } from "../config.js"
import { HttpError } from "../lib/errors.js"
import { isDemoAccount } from "../lib/reviews.js"
import { requireOwner } from "../lib/team.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Database, SocialProvider } from "../types.js"
import { startSession, startTicket, toPublic } from "./auth.js"

// Logging in with Kakao or Naver (OAuth 2.0, the authorization code flow).
// Signing up stays by email, as the school or company address is checked
// then; a member links a provider from 내 정보 and logs in with its button
// from then on. The flow's `state` is bound to the browser by a cookie, and
// the finished login reaches the page through a one-time code in another
// cookie, so no token or code for this site rides in an address.
export const socialRouter = Router()

const providers = {
  kakao: {
    clientId: () => config.kakaoClientId,
    clientSecret: () => config.kakaoClientSecret,
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me",
    idOf: (body: unknown) => (body as { id?: unknown } | null)?.id,
  },
  naver: {
    clientId: () => config.naverClientId,
    clientSecret: () => config.naverClientSecret,
    authorize: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    profile: "https://openapi.naver.com/v1/nid/me",
    idOf: (body: unknown) => (body as { response?: { id?: unknown } } | null)?.response?.id,
  },
} as const

// A provider is offered once its keys are set (Naver needs its secret too).
const ready = (provider: SocialProvider) =>
  Boolean(providers[provider].clientId()) && (provider === "kakao" || Boolean(providers[provider].clientSecret()))

function providerOf(value: unknown): SocialProvider {
  if ((value === "kakao" || value === "naver") && ready(value)) return value
  throw new HttpError(404, "지원하지 않는 로그인 방법이에요.")
}

// Where the provider sends the browser back: this site's address.
const callbackUrl = (req: Request, provider: SocialProvider) =>
  `${(config.siteUrl ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")}/api/auth/social/${provider}/callback`

const sha = (value: string) => createHash("sha256").update(value).digest("hex")
const flowMs = 10 * 60 * 1000
const handoffMs = 2 * 60 * 1000

// The provider's member number for an authorization code: the code traded
// for a token, the token for the profile. Tests swap `exchange`.
export const socialAuth = {
  async exchange(provider: SocialProvider, code: string, redirectUri: string, state: string): Promise<string> {
    const settings = providers[provider]
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: settings.clientId()!,
      redirect_uri: redirectUri,
      code,
      state,
      ...(settings.clientSecret() ? { client_secret: settings.clientSecret()! } : {}),
    })
    const tokenResponse = await fetch(settings.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: form,
      signal: AbortSignal.timeout(8000),
    })
    const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null
    if (!tokenResponse.ok || !token?.access_token) throw new Error(`${provider} token ${tokenResponse.status}`)
    const profileResponse = await fetch(settings.profile, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(8000),
    })
    const id = settings.idOf(await profileResponse.json().catch(() => null))
    if (!profileResponse.ok || (typeof id !== "string" && typeof id !== "number")) throw new Error(`${provider} profile ${profileResponse.status}`)
    return String(id)
  },
}

function oauthOf(database: Database) {
  database.oauth ??= { states: [], handoffs: [] }
  const now = Date.now()
  database.oauth.states = database.oauth.states.filter((item) => item.expiresAt > now)
  database.oauth.handoffs = database.oauth.handoffs.filter((item) => item.expiresAt > now)
  return database.oauth
}

// Cookies only this flow's addresses see, out of reach of the page's scripts.
const cookieOptions = (req: Request, maxAge: number) => ({
  httpOnly: true,
  secure: req.secure || config.isProduction,
  sameSite: "lax" as const,
  path: "/api/auth/social",
  maxAge,
})

function cookieOf(req: Request, name: string) {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return decodeURIComponent(rest.join("="))
  }
  return undefined
}

// The providers this site offers, for the buttons.
socialRouter.get("/", (_req, res) => {
  res.json({ providers: (["kakao", "naver"] as const).filter(ready) })
})

// Starts a login, or linking from 내 정보 (the owner of a member account, not
// the shared demo accounts): the address to send the browser to.
socialRouter.post("/:provider/start", async (req, res) => {
  const provider = providerOf(req.params.provider)
  const intent = req.body?.intent === "link" ? "link" : "login"
  let accountId: string | undefined
  if (intent === "link") {
    const account = requireOwner(req, requireAccount(req))
    if (isDemoAccount(getDatabase(), account)) throw new HttpError(403, "데모 계정은 카카오 · 네이버 계정을 연결할 수 없어요.")
    accountId = account.id
  }
  const state = randomBytes(24).toString("base64url")
  oauthOf(getDatabase()).states.push({ hash: sha(state), provider, intent, accountId, expiresAt: Date.now() + flowMs })
  await saveDatabase()
  res.cookie("uc_social_state", state, cookieOptions(req, flowMs))
  const url = new URL(providers[provider].authorize)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: providers[provider].clientId()!,
    redirect_uri: callbackUrl(req, provider),
    state,
  }).toString()
  res.json({ url: url.toString() })
})

// Back from the provider: the state must be the one this browser started,
// used once. Linking saves the member number on the account; a login finds
// the account it was linked to and hands it to the page by a one-time code.
socialRouter.get("/:provider/callback", async (req, res) => {
  const back = (result: string) => res.redirect(303, `/${result.startsWith("linked") || result.startsWith("link-") ? "me" : ""}?social=${result}`)
  let provider: SocialProvider
  try {
    provider = providerOf(req.params.provider)
  } catch {
    return back("error")
  }
  const state = String(req.query.state ?? "")
  const database = getDatabase()
  const oauth = oauthOf(database)
  const flow = oauth.states.find((item) => item.hash === sha(state) && item.provider === provider)
  res.clearCookie("uc_social_state", { path: "/api/auth/social" })
  if (!state || !flow || cookieOf(req, "uc_social_state") !== state) return back("error")
  oauth.states = oauth.states.filter((item) => item !== flow)
  await saveDatabase()
  if (typeof req.query.code !== "string" || !req.query.code) return back(flow.intent === "link" ? "link-cancelled" : "cancelled")

  let memberNumber: string
  try {
    memberNumber = await socialAuth.exchange(provider, req.query.code, callbackUrl(req, provider), state)
  } catch (error) {
    console.error(`[social] ${provider}: ${(error as Error).message}`)
    return back(flow.intent === "link" ? "link-error" : "error")
  }
  const fresh = getDatabase()
  const owner = fresh.accounts.find((account) => account.social?.[provider]?.id === memberNumber)

  if (flow.intent === "link") {
    const account = fresh.accounts.find((item) => item.id === flow.accountId)
    if (!account) return back("link-error")
    // One provider account opens one uniconnect account.
    if (owner && owner !== account) return back("link-taken")
    account.social = { ...account.social, [provider]: { id: memberNumber, linkedAt: new Date().toISOString() } }
    await saveDatabase()
    return back(`linked-${provider}`)
  }

  if (!owner || owner.suspendedAt) return back("unlinked")
  const handoff = randomBytes(24).toString("base64url")
  oauthOf(fresh).handoffs.push({
    hash: sha(handoff),
    accountId: owner.id,
    userAgent: req.get("user-agent")?.slice(0, 300),
    expiresAt: Date.now() + handoffMs,
  })
  await saveDatabase()
  res.cookie("uc_social_login", handoff, cookieOptions(req, handoffMs))
  back("login")
})

// The page finishes a login the callback handed it: the one-time code in
// its cookie for a session, as an email login gives. Two-step login, when
// on, still asks for its code first.
socialRouter.post("/complete", async (req: Request, res: Response) => {
  const handoff = cookieOf(req, "uc_social_login") ?? ""
  res.clearCookie("uc_social_login", { path: "/api/auth/social" })
  const database = getDatabase()
  const oauth = oauthOf(database)
  const entry = handoff ? oauth.handoffs.find((item) => item.hash === sha(handoff)) : undefined
  if (!entry) throw new HttpError(401, "로그인 시간이 지났어요. 다시 시도해 주세요.")
  oauth.handoffs = oauth.handoffs.filter((item) => item !== entry)
  const account = database.accounts.find((item) => item.id === entry.accountId && !item.suspendedAt)
  if (!account) throw new HttpError(401, "로그인 시간이 지났어요. 다시 시도해 주세요.")
  if (account.twoFactor) {
    const ticket = startTicket(account, req)
    await saveDatabase()
    res.json({ twoFactor: true, ticket, email: account.email })
    return
  }
  const token = startSession(account.id, req, { userAgent: entry.userAgent })
  await saveDatabase()
  res.json({ token, account: toPublic(account) })
})

// Unlinks a provider (the owner); the email login stays.
socialRouter.delete("/:provider", async (req, res) => {
  const account = requireOwner(req, requireAccount(req))
  const provider = req.params.provider
  if (provider !== "kakao" && provider !== "naver") throw new HttpError(404, "지원하지 않는 로그인 방법이에요.")
  if (account.social?.[provider]) {
    const { [provider]: _gone, ...rest } = account.social
    account.social = rest
    await saveDatabase()
  }
  res.json({ account: toPublic(account) })
})
