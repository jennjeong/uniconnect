import { api } from "../api"
import { installState } from "./install"

// 이 기기의 푸시 알림(#108). 브라우저가 만든 구독을 서버의 이 로그인에 올리고
// (backend lib/push.ts), 알림은 서비스 워커(public/sw.js)가 보여 준다. 로그인이 만료된
// 뒤 같은 계정으로 다시 로그인하면 묻지 않고 이어지도록 켠 계정을 이 브라우저에
// 기억한다. 직접 로그아웃하거나 끄면 지운다.
const memoryKey = "uniconnect-push"

// 지금 여기서 켤 수 있는지. iPhone과 iPad는 홈 화면에 추가한 앱에서만 된다.
export type PushSupport = "ok" | "ios" | "denied" | "unsupported"

export function pushSupportOf(here: { supported: boolean; ios: boolean; permission?: NotificationPermission }): PushSupport {
  if (!here.supported) return here.ios ? "ios" : "unsupported"
  return here.permission === "denied" ? "denied" : "ok"
}

export function pushSupport(): PushSupport {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  return pushSupportOf({
    supported,
    ios: installState() === "ios",
    permission: supported ? Notification.permission : undefined,
  })
}

type Memory = { account: string; endpoint: string }

function remembered(): Memory | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(memoryKey) ?? "null") as Memory | null
    return typeof saved?.account === "string" && typeof saved.endpoint === "string" ? saved : undefined
  } catch {
    return undefined
  }
}

function remember(memory: Memory | undefined) {
  try {
    if (memory) localStorage.setItem(memoryKey, JSON.stringify(memory))
    else localStorage.removeItem(memoryKey)
  } catch {
    // 저장소가 없으면 다시 로그인한 뒤 다시 켜면 된다.
  }
}

export const forgetPush = () => remember(undefined)

// 서비스 워커는 빌드된 앱에서만 있고, 첫 방문에는 아직 준비 중일 수 있다.
const readyMs = 8_000
const worker = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no service worker")), readyMs)),
  ])

export function keyBytes(key: string) {
  const text = atob(key.replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(text, (letter) => letter.charCodeAt(0))
}

const sameKey = (held: ArrayBuffer | null | undefined, key: Uint8Array) => {
  if (!held) return true
  const bytes = new Uint8Array(held)
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index])
}

// 서버의 키가 바뀌었으면 옛 구독은 쓸 수 없으므로 새로 만든다.
async function subscription(key: string) {
  const { pushManager } = await worker()
  const bytes = keyBytes(key)
  const held = await pushManager.getSubscription()
  if (held && sameKey(held.options.applicationServerKey, bytes)) return held
  await held?.unsubscribe()
  return pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
}

async function upload(account: string, key: string) {
  const made = await subscription(key)
  await api.savePush(made.toJSON())
  remember({ account, endpoint: made.endpoint })
}

// 켠다. 허용하지 않으면 "denied", 아직 고르지 않았으면 "dismissed".
export async function turnOnPush(account: string, key: string): Promise<"on" | "denied" | "dismissed"> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission === "denied" ? "denied" : "dismissed"
  await upload(account, key)
  return "on"
}

export async function turnOffPush() {
  forgetPush()
  await api.removePush()
  const held = await worker().then(({ pushManager }) => pushManager.getSubscription()).catch(() => null)
  await held?.unsubscribe().catch(() => undefined)
}

// 로그인한 뒤 한 번: 이 브라우저에서 켜 둔 계정이면 조용히 이어 준다(로그인이 새로
// 시작됐거나 브라우저가 구독을 바꾼 경우).
export async function resumePush(account: string) {
  const memory = remembered()
  if (memory?.account !== account || pushSupport() !== "ok" || Notification.permission !== "granted") return
  try {
    const { key, on } = await api.push()
    if (!key) return
    const held = await subscription(key)
    if (!on || held.endpoint !== memory.endpoint) await upload(account, key)
  } catch {
    // 다음에 열 때 다시 해 본다.
  }
}
