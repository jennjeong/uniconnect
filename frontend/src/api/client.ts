import { lang, t } from "../i18n"

const TOKEN_KEY = "uniconnect-token"

// 개발 중에는 비워 둔다 (Vite가 /api를 백엔드로 프록시한다). 프런트엔드와
// 백엔드를 서로 다른 오리진에 배포할 때 VITE_API_URL을 설정한다.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")

// 요청 하나를 기다리는 최대 시간. 채팅의 긴 대기(서버가 20초 붙잡는다)도 들어가고,
// Vercel 함수의 한도(30초) 안이다.
const defaultTimeoutMs = 30_000

// 오류의 종류. 화면은 aborted를 알리지 않고, 나머지는 사람이 읽을 안내를 보인다.
// - aborted: 페이지가 더 기다리지 않아 멈춘 요청(채팅을 닫음 등)
// - timeout: 시간 안에 답이 오지 않음
// - offline: 기기가 인터넷에 연결돼 있지 않음
// - network: 연결은 있으나 서버에 닿지 못함
// - server: 서버가 오류로 답함(API의 { error }가 있으면 그 문장)
// - invalid: 성공으로 답했지만 내용을 읽을 수 없음
export type ApiErrorKind = "aborted" | "timeout" | "offline" | "network" | "server" | "invalid"

export class ApiError extends Error {
  status: number
  kind: ApiErrorKind

  constructor(status: number, message: string, kind: ApiErrorKind = "server") {
    super(message)
    this.status = status
    this.kind = kind
  }
}

const messages: Record<Exclude<ApiErrorKind, "server">, () => string> = {
  aborted: () => "",
  timeout: () => t("응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요."),
  offline: () => t("인터넷에 연결돼 있지 않아요. 연결되면 다시 시도해 주세요."),
  network: () => t("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."),
  invalid: () => t("서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요."),
}
const serverTrouble = () => t("서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.")

export const isAborted = (error: unknown) => error instanceof ApiError && error.kind === "aborted"

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : t("요청을 처리하지 못했어요.")

// 진단용 기록. 사용자에게 보이는 문장과 따로, 어디서 무엇이 실패했는지만 남긴다
// (토큰이나 본문은 남기지 않는다).
function diagnose(path: string, kind: ApiErrorKind, status: number) {
  if (kind === "aborted") return
  console.warn(`[api] ${path} → ${kind}${status ? ` ${status}` : ""}`)
}

// 로그인 토큰. localStorage에 두고, 저장소를 쓸 수 없는 브라우저(일부 시크릿 모드,
// 저장소 차단)에서는 메모리에 둔다. 그러면 이 탭에서는 로그인이 그대로 동작하고
// 새로고침하면 사라진다. 화면만 로그인되고 API는 토큰 없이 가는 일이 없도록 읽기도
// 같은 순서로 한다.
let memoryToken: string | null = null
let storageWorks = true

export function getToken() {
  if (storageWorks) {
    try {
      const stored = localStorage.getItem(TOKEN_KEY)
      if (stored !== null) return stored
    } catch {
      storageWorks = false
    }
  }
  return memoryToken
}

export function setToken(token: string | null) {
  memoryToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    storageWorks = true
  } catch {
    storageWorks = false
  }
}

// 로그인이 새로고침 뒤에도 남는지. 저장소를 쓸 수 없으면 화면이 그렇게 알린다.
export const tokenPersists = () => storageWorks

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string>
  // 운영자의 X-Admin-Token 같은 추가 헤더.
  headers?: Record<string, string>
  // 페이지가 더는 기다리지 않는 요청(열려 있던 채팅의 것)을 멈춘다.
  signal?: AbortSignal
  timeoutMs?: number
}

// 호출한 쪽의 취소와 시간 제한을 하나로 묶는다. 어느 쪽이 멈췄는지 알 수 있게 한다.
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const stop = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener("abort", stop, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    done: () => {
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", stop)
    },
  }
}

// fetch가 응답 없이 실패했을 때의 종류.
function failureKind(callerSignal: AbortSignal | undefined, timedOut: boolean): ApiErrorKind {
  if (callerSignal?.aborted) return "aborted"
  if (timedOut) return "timeout"
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline"
  return "network"
}

function failure(path: string, kind: ApiErrorKind, status = 0, message?: string) {
  diagnose(path, kind, status)
  return new ApiError(status, message ?? (kind === "server" ? serverTrouble() : messages[kind]()), kind)
}

// 로그인한 계정에게만 API가 내주는 파일(합의서의 사진, 기획안 PDF)을 object URL용
// blob으로 받는다. <img>는 토큰을 보낼 수 없기 때문이다. 시간 제한은 헤더가 온 뒤
// 본문을 다 읽을 때까지 걸린다. 헤더만 빨리 오고 본문이 멈추면 그대로 기다리게 되기
// 때문이다. 읽기만 하므로 다시 보내지 않는다(다시 받을지는 화면이 정한다).
export async function requestBlob(
  path: string,
  { headers = {}, signal, timeoutMs = defaultTimeoutMs }: { headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Blob> {
  const token = getToken()
  const limit = withTimeout(signal, timeoutMs)
  let response: Response
  let body: Blob | string
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Accept-Language": lang,
        ...headers,
      },
      signal: limit.signal,
    })
    // 실패한 답은 { error } 문장을 읽고, 성공한 답은 파일을 읽는다.
    body = response.ok ? await response.blob() : await response.text()
  } catch {
    throw failure(path, failureKind(signal, limit.timedOut()))
  } finally {
    limit.done()
  }
  if (!response.ok) {
    let apiMessage: unknown
    try {
      apiMessage = (JSON.parse(body as string) as { error?: unknown }).error
    } catch {
      apiMessage = undefined
    }
    throw failure(path, "server", response.status, typeof apiMessage === "string" ? apiMessage : undefined)
  }
  return body as Blob
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET"
  // 읽기만 하는 요청은 연결이 잠깐 끊겼을 때 한 번 더 묻는다. 제안, 수락, 결제처럼
  // 무언가를 만드는 요청은 다시 보내지 않는다(같은 것이 두 번 생기지 않게).
  const attempts = method === "GET" && !options.signal ? 2 : 1
  for (let attempt = 1; ; attempt++) {
    try {
      return await requestOnce<T>(path, method, options)
    } catch (error) {
      const retry = error instanceof ApiError && error.kind === "network" && attempt < attempts
      if (!retry) throw error
    }
  }
}

async function requestOnce<T>(path: string, method: NonNullable<RequestOptions["method"]>, options: RequestOptions): Promise<T> {
  const url = new URL(`${API_BASE}/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value)
  }

  const token = getToken()
  const limit = withTimeout(options.signal, options.timeoutMs ?? defaultTimeoutMs)
  let response: Response
  let text: string
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // 서버는 화면에 보이는 언어로 메시지를 답한다.
        "Accept-Language": lang,
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: limit.signal,
    })
    text = response.status === 204 ? "" : await response.text()
  } catch {
    throw failure(path, failureKind(options.signal, limit.timedOut()))
  } finally {
    limit.done()
  }

  if (response.status === 204) return undefined as T
  let data: unknown
  let parsed = true
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    parsed = false
  }
  if (!response.ok) {
    // API는 오류를 항상 { error }로 답한다. 그 밖의 것은 API에 닿지 못한
    // 프록시나 호스트에서 온 것이다.
    const apiMessage = parsed && data && typeof data === "object" ? (data as { error?: unknown }).error : undefined
    throw failure(path, "server", response.status, typeof apiMessage === "string" ? apiMessage : undefined)
  }
  if (!parsed || data === null) throw failure(path, "invalid", response.status)
  return data as T
}
