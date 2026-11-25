import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto"

import { waitUntil } from "@vercel/functions"

import { config } from "../config.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, MailKind, PushTarget } from "../types.js"
import { translate } from "./i18n.js"
import { oneLine } from "./mailer.js"

// 휴대폰 푸시 알림(#108). 회원이 내 정보에서 켠 기기에, 알림 메일과 같은 때에 짧은
// 알림을 보낸다. 구독은 로그인 세션에 둔다(Session.push). 그래서 로그아웃, 기기
// 로그아웃, 공동 관리자 빼기, 정지, 탈퇴 때 저절로 끊긴다.
//
// 브라우저 제조사의 푸시 서버로 보내는 표준을 그대로 따른다: 보낸 곳을 밝히는
// VAPID(RFC 8292), 기기만 풀 수 있는 암호화(RFC 8291, aes128gcm).

const curve = "prime256v1"
const point = (value: string) => Buffer.from(value, "base64url")

const subject = () => {
  const site = config.siteUrl?.replace(/\/$/, "")
  if (site?.startsWith("https://")) return site
  return config.supportEmail ? `mailto:${config.supportEmail}` : undefined
}

// 키 한 쌍과 보낸 곳(SITE_URL이나 SUPPORT_EMAIL)이 모두 있어야 켤 수 있다.
export function pushKey() {
  const { vapidPublicKey, vapidPrivateKey } = config
  if (!vapidPublicKey || !vapidPrivateKey || !subject()) return undefined
  return point(vapidPublicKey).length === 65 && point(vapidPrivateKey).length === 32 ? vapidPublicKey : undefined
}

// 브라우저들이 쓰는 푸시 서버. 구독 주소는 회원의 브라우저가 보내므로, 서버가 다른
// 곳으로 요청을 보내게 만들 수 없도록 이 호스트만 받는다.
const pushHosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]
const pushDomains = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"]

function allowedEndpoint(value: string) {
  if (value.length > 1000) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    (pushHosts.includes(url.hostname) || pushDomains.some((domain) => url.hostname.endsWith(domain)))
  )
}

// 브라우저가 준 구독을 확인해 그대로 둘 값만 남긴다. 아니면 undefined.
export function parsePushTarget(body: unknown): PushTarget | undefined {
  const { endpoint, keys } = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof endpoint !== "string" || typeof keys?.p256dh !== "string" || typeof keys.auth !== "string") return undefined
  if (!allowedEndpoint(endpoint) || keys.p256dh.length > 100 || keys.auth.length > 40) return undefined
  if (point(keys.p256dh).length !== 65 || point(keys.auth).length !== 16) return undefined
  try {
    // 곡선 위의 점이 아니면 던진다.
    const probe = createECDH(curve)
    probe.generateKeys()
    probe.computeSecret(point(keys.p256dh))
  } catch {
    return undefined
  }
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth }
}

const derive = (secret: Buffer, salt: Buffer, info: Buffer, length: number) =>
  Buffer.from(hkdfSync("sha256", secret, salt, info, length))

// 기기만 풀 수 있는 본문. 테스트는 표준의 예시로 확인하려고 salt와 키를 정해 준다.
export function encryptFor(target: PushTarget, text: string, fixed?: { salt: Buffer; privateKey: Buffer }) {
  const pair = createECDH(curve)
  if (fixed) pair.setPrivateKey(fixed.privateKey)
  else pair.generateKeys()
  const salt = fixed?.salt ?? randomBytes(16)
  const own = pair.getPublicKey()
  const theirs = point(target.p256dh)
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), theirs, own])
  const material = derive(pair.computeSecret(theirs), point(target.auth), info, 32)
  const key = derive(material, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16)
  const nonce = derive(material, salt, Buffer.from("Content-Encoding: nonce\0"), 12)
  const cipher = createCipheriv("aes-128-gcm", key, nonce)
  // 기록은 하나이고, 0x02가 마지막 기록의 끝을 알린다.
  const sealed = Buffer.concat([cipher.update(text), cipher.update(Buffer.from([2])), cipher.final(), cipher.getAuthTag()])
  const head = Buffer.alloc(21)
  salt.copy(head)
  head.writeUInt32BE(4096, 16)
  head.writeUInt8(own.length, 20)
  return Buffer.concat([head, own, sealed])
}

// 이 서버가 보냈다는 서명. 푸시 서버마다 따로 만들고 12시간 동안 통한다.
export function vapidHeader(endpoint: string) {
  const publicKey = point(config.vapidPublicKey!)
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: config.vapidPrivateKey!,
      x: publicKey.subarray(1, 33).toString("base64url"),
      y: publicKey.subarray(33).toString("base64url"),
    },
  })
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject(),
  }
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part(claims)}`
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")
  return `vapid t=${unsigned}.${signature}, k=${config.vapidPublicKey}`
}

// 테스트는 `post`를 바꿔 보내지 않고 나갈 내용을 확인한다. 푸시 서버의 답이 다른
// 곳으로 돌려도 따라가지 않는다.
export const pushTransport = {
  post: (endpoint: string, headers: Record<string, string>, body: Buffer) =>
    fetch(endpoint, {
      method: "POST",
      headers,
      body: new Uint8Array(body),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    }),
}

export type PushMessage = { title: string; body?: string; path: string }

// 기기 하나에 보낸다. "gone"은 구독이 끝나 지울 때, false는 그 밖의 실패.
export async function sendPush(target: PushTarget, message: PushMessage): Promise<true | false | "gone"> {
  try {
    const response = await pushTransport.post(
      target.endpoint,
      {
        Authorization: vapidHeader(target.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        // 꺼져 있던 기기에는 하루까지 기다렸다가 준다.
        TTL: String(24 * 60 * 60),
        Urgency: "normal",
      },
      encryptFor(target, JSON.stringify(message)),
    )
    if (response.status === 404 || response.status === 410) return "gone"
    if (!response.ok) console.error(`[push] the push server answered ${response.status}`)
    return response.ok
  } catch (error) {
    console.error(`[push] ${(error as Error).name}`)
    return false
  }
}

// 더는 없는 구독을 지운다. 그사이 새로 켰으면 그대로 둔다. 기록일 뿐이라 저장에
// 실패해도 그만이고, 다음에 보낼 때 다시 지운다.
export async function dropPushTargets(endpoints: string[]) {
  if (endpoints.length === 0) return
  for (const session of getDatabase().sessions) {
    if (session.push && endpoints.includes(session.push.endpoint)) delete session.push
  }
  await saveDatabase().catch(() => undefined)
}

// 잠금 화면에는 누구나 볼 수 있으므로 메시지 내용과 계정 안내의 이유는 싣지 않고,
// 나머지도 첫 줄만 짧게 싣는다.
const bodyKinds: (MailKind | "account")[] = ["proposals", "sponsorships", "reminders"]
const maxBody = 120

// 계정에서 알림을 켠 모든 기기에 보낸다. 주간 요약은 메일로만 간다.
export function pushNotice(
  account: Account,
  kind: MailKind | "account",
  title: string,
  lines: string[],
  path: string,
) {
  if (!pushKey() || kind === "digest") return Promise.resolve()
  const now = Date.now()
  const targets = getDatabase()
    .sessions.filter(
      (session) =>
        session.accountId === account.id &&
        session.expiresAt > now &&
        (!session.memberId || account.members?.some((member) => member.id === session.memberId)),
    )
    .flatMap((session) => (session.push ? [session.push] : []))
  if (targets.length === 0) return Promise.resolve()
  const say = (text: string) => oneLine(translate(text, account.language ?? "ko"))
  const line = bodyKinds.includes(kind) && lines[0] ? say(lines[0]) : undefined
  const message: PushMessage = {
    title: say(title),
    ...(line ? { body: line.length > maxBody ? `${line.slice(0, maxBody - 1)}…` : line } : {}),
    path,
  }
  const sending = Promise.all(targets.map(async (target) => ((await sendPush(target, message)) === "gone" ? [target.endpoint] : [])))
    .then((gone) => dropPushTargets(gone.flat()))
    .catch(() => undefined)
  waitUntil(sending)
  return sending
}
