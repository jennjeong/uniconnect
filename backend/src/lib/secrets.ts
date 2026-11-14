import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { config } from "../config.js"

// 데이터 문서가 데이터베이스나 파일로 나갈 때 비밀값만 암호화한다(AES-256-GCM). 메모리에서는
// 평문이라 라우트는 알 필요가 없고, 데이터베이스나 백업이 새도 2단계 로그인 키, 결제 키,
// PIN, 이메일 코드를 읽을 수 없다. `SECRETS_KEY`가 없으면 평문으로 둔다(개발용). 평문으로
// 저장된 값은 그대로 읽으므로 키를 켠 뒤의 첫 저장에서 암호화된다.
const prefix = "sealed:v1:"

// 문서 어디에 있든 이 이름의 문자열 값을 암호화한다.
const sealedKeys = new Set(["secret", "paymentKey", "verificationToken", "staffPin", "groupPin", "shareToken", "customerKey"])

// 이름이 흔해서 그 이름만으로 고르지 못하는 값이다. 어느 객체의 어느 값인지로 고른다.
const sealedInside: Record<string, string> = { calendarFeed: "token", ledger: "token", councilCode: "code" }

function mapInside(key: string, value: unknown, change: (text: string) => string) {
  const field = Object.hasOwn(sealedInside, key) ? sealedInside[key] : undefined
  if (!field || typeof value !== "object" || value === null) return value
  const inner = (value as Record<string, unknown>)[field]
  return typeof inner === "string" ? { ...value, [field]: change(inner) } : value
}

// 이메일 코드의 `code`만이다. 행사와 초대의 `code`는 공개 주소에 쓰이는 값이다.
const isEmailCode = (holder: unknown) => typeof holder === "object" && holder !== null && "attempts" in holder && "expiresAt" in holder

const sensitive = (holder: unknown, key: string) => sealedKeys.has(key) || (key === "code" && isEmailCode(holder))

// 저장할 때마다 문서의 모든 비밀 값을 봉하므로, 키에서 만든 바이트를 키가 바뀔 때까지 다시 쓴다.
let derived: { secret: string; key: Buffer } | undefined
const keyBytes = () => {
  const secret = config.secretsKey!
  if (derived?.secret === secret) return derived.key
  derived = { secret, key: createHash("sha256").update(secret).digest() }
  return derived.key
}

export function seal(value: string) {
  if (!config.secretsKey || value.startsWith(prefix)) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv)
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return `${prefix}${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")}`
}

// 키가 없거나 다르면 암호문을 그대로 둔다. 서비스 전체가 멈추는 것보다 2단계 로그인처럼 그
// 값을 쓰는 일만 실패하는 편이 낫고, 키를 되돌리면 그대로 읽힌다.
export function open(value: string) {
  if (!value.startsWith(prefix)) return value
  if (!config.secretsKey) {
    console.error("[secrets] sealed values are stored, but SECRETS_KEY isn't set")
    return value
  }
  try {
    const bytes = Buffer.from(value.slice(prefix.length), "base64url")
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(), bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    console.error("[secrets] a sealed value can't be opened with this SECRETS_KEY")
    return value
  }
}

export function sealDocument(document: unknown, indent?: number) {
  if (!config.secretsKey) return JSON.stringify(document, null, indent)
  return JSON.stringify(
    document,
    function (this: unknown, key, value: unknown) {
      return typeof value === "string" && sensitive(this, key) ? seal(value) : mapInside(key, value, seal)
    },
    indent,
  )
}

export function openDocument<T>(text: string) {
  return JSON.parse(text, function (this: unknown, key, value: unknown) {
    return typeof value === "string" && sensitive(this, key) ? open(value) : mapInside(key, value, open)
  }) as T
}

// 보관하는 복구 코드: 대소문자 구분 없이, 대시는 있어도 없어도 된다. 코드의 경우의 수가
// 많지 않아 해시만으로는 유출된 값을 맞춰 볼 수 있으므로, `SECRETS_KEY`가 있으면 키를 섞는다.
const plainRecovery = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "")
const oldRecoveryHash = (code: string) => createHash("sha256").update(plainRecovery(code)).digest("hex")

// 비밀 값이 같은지 시간 차 없이 견준다. 양쪽을 해시하면 무엇을 보냈든(한글이어도) 길이가
// 같아져 timingSafeEqual을 쓸 수 있다.
export const sameSecret = (given: string, expected: string) =>
  timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest())

export const hashRecovery = (code: string) =>
  config.secretsKey ? createHmac("sha256", config.secretsKey).update(plainRecovery(code)).digest("hex") : oldRecoveryHash(code)

// 키를 켜기 전에 받은 복구 코드도 계속 통한다.
export const recoveryHashesOf = (code: string) => [hashRecovery(code), oldRecoveryHash(code)]
