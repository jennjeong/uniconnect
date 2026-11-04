import { lang, t } from "../i18n"

const TOKEN_KEY = "uniconnect-token"

// Empty in development (Vite proxies /api to the backend). Set VITE_API_URL
// when the frontend and backend are deployed on different origins.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")

const unreachable = t("서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해 주세요.")

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : t("요청을 처리하지 못했어요.")

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be unavailable (private mode); the session then lasts until reload.
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string>
  // Extra headers, such as the operators' X-Admin-Token.
  headers?: Record<string, string>
  // Stops a request the page no longer waits for (an open chat's).
  signal?: AbortSignal
}

// A file the API serves only to a logged-in account (an agreement's photo),
// as a blob for an object URL, since an <img> can't send the token.
export async function requestBlob(path: string, { headers = {} }: { headers?: Record<string, string> } = {}): Promise<Blob> {
  const token = getToken()
  const response = await fetch(`${API_BASE}/api${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  }).catch(() => undefined)
  if (!response?.ok) throw new ApiError(response?.status ?? 0, unreachable)
  return response.blob()
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE}/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value)
  }

  const token = getToken()
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // The server answers its messages in the language shown.
        "Accept-Language": lang,
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch {
    throw new ApiError(0, unreachable)
  }

  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    // The API always answers errors as { error }; anything else came from a
    // proxy or host that could not reach it.
    throw new ApiError(response.status, data?.error ?? unreachable)
  }
  return data as T
}
