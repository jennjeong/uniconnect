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

// Kakao나 Naver로 로그인한다(OAuth 2.0 인가 코드 방식). 가입은 그때 학교나
// 회사 주소를 확인하므로 계속 이메일로 하며, 회원이 내 정보에서 제공자를
// 연결하고 이후에는 그 버튼으로 로그인한다. 아무에게도 연결되지 않은 제공자
// 계정은 아무도 로그인시키지 못하고, 이 사이트 앱과의 연결도 바로 거둔다.
// 그래서 연결하기 전에 버튼을 눌러 봐도 Kakao나 Naver에 아무것도 남지 않는다.
// 흐름의 `state`는 쿠키로 브라우저에 묶고, 끝난 로그인은 다른 쿠키에 담긴
// 일회용 코드로 페이지에 닿으므로 이 사이트의 토큰이나 코드가 주소에 실리지
// 않는다.
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

// 키가 설정된 제공자만 보여 준다(Naver는 비밀 키도 필요하다).
const ready = (provider: SocialProvider) =>
  Boolean(providers[provider].clientId()) && (provider === "kakao" || Boolean(providers[provider].clientSecret()))

function providerOf(value: unknown): SocialProvider {
  if ((value === "kakao" || value === "naver") && ready(value)) return value
  throw new HttpError(404, "지원하지 않는 로그인 방법이에요.")
}

// 제공자가 브라우저를 돌려보낼 곳으로, 이 사이트의 주소다.
const callbackUrl = (req: Request, provider: SocialProvider) =>
  `${(config.siteUrl ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")}/api/auth/social/${provider}/callback`

const sha = (value: string) => createHash("sha256").update(value).digest("hex")
const flowMs = 10 * 60 * 1000
const handoffMs = 2 * 60 * 1000

// 인가 코드로 얻는 제공자의 회원 번호다. 코드를 토큰으로 바꾸고 토큰으로
// 프로필을 받으며, 토큰은 `revoke`를 위해 둔다. 테스트에서는 둘 다 바꿔 쓴다.
export const socialAuth = {
  async exchange(provider: SocialProvider, code: string, redirectUri: string, state: string): Promise<{ id: string; token: string }> {
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
    return { id: String(id), token: token.access_token }
  },

  // 방금 로그인으로 만든 연결을 끊는다. Kakao는 회원과 앱의 연결을 끊고,
  // Naver는 토큰을 지운다.
  async revoke(provider: SocialProvider, token: string) {
    const response =
      provider === "kakao"
        ? await fetch("https://kapi.kakao.com/v1/user/unlink", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          })
        : await fetch(providers.naver.token, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
            body: new URLSearchParams({
              grant_type: "delete",
              client_id: providers.naver.clientId()!,
              client_secret: providers.naver.clientSecret()!,
              access_token: token,
              service_provider: "NAVER",
            }),
            signal: AbortSignal.timeout(8000),
          })
    if (!response.ok) throw new Error(`${provider} revoke ${response.status}`)
  },
}

function oauthOf(database: Database) {
  database.oauth ??= { states: [], handoffs: [] }
  const now = Date.now()
  database.oauth.states = database.oauth.states.filter((item) => item.expiresAt > now)
  database.oauth.handoffs = database.oauth.handoffs.filter((item) => item.expiresAt > now)
  return database.oauth
}

// 이 흐름의 주소만 보는 쿠키로, 페이지의 스크립트가 닿지 못한다.
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

// 이 사이트가 내놓는 제공자로, 버튼에 쓴다.
socialRouter.get("/", (_req, res) => {
  res.json({ providers: (["kakao", "naver"] as const).filter(ready) })
})

// 로그인이나 내 정보에서의 연결을 시작한다(회원 계정의 주인만 하며, 공유 데모
// 계정은 안 된다). 브라우저를 보낼 주소를 돌려준다.
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

// 제공자에서 돌아온다. state는 이 브라우저가 시작한 것이어야 하며 한 번만
// 쓴다. 연결이면 회원 번호를 계정에 저장하고, 로그인이면 연결된 계정을 찾아
// 일회용 코드로 페이지에 넘긴다.
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

  let exchanged: { id: string; token: string }
  try {
    exchanged = await socialAuth.exchange(provider, req.query.code, callbackUrl(req, provider), state)
  } catch (error) {
    console.error(`[social] ${provider}: ${(error as Error).message}`)
    return back(flow.intent === "link" ? "link-error" : "error")
  }
  const memberNumber = exchanged.id
  const fresh = getDatabase()
  const owner = fresh.accounts.find((account) => account.social?.[provider]?.id === memberNumber)

  if (flow.intent === "link") {
    const account = fresh.accounts.find((item) => item.id === flow.accountId)
    if (!account) return back("link-error")
    // 제공자 계정 하나는 uniconnect 계정 하나만 연다.
    if (owner && owner !== account) return back("link-taken")
    account.social = { ...account.social, [provider]: { id: memberNumber, linkedAt: new Date().toISOString() } }
    await saveDatabase()
    return back(`linked-${provider}`)
  }

  if (!owner) {
    await socialAuth.revoke(provider, exchanged.token).catch((error: unknown) => console.error(`[social] ${provider}: ${(error as Error).message}`))
    return back(`unlinked-${provider}`)
  }
  if (owner.suspendedAt) return back(`unlinked-${provider}`)
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

// 페이지가 콜백이 넘긴 로그인을 마무리한다. 쿠키에 담긴 일회용 코드로 이메일
// 로그인과 같은 세션을 받는다. 2단계 로그인이 켜져 있으면 코드를 먼저 묻는다.
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

// 제공자 연결을 끊는다(주인만 한다). 이메일 로그인은 그대로 남는다.
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
