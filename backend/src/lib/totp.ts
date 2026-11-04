import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"

// 인증 앱을 쓰는 2단계 로그인(RFC 6238: 6자리, 30초 단위, HMAC-SHA1).
// Google Authenticator 같은 앱이 otpauth:// 주소에서 읽는 방식이다.

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const stepSeconds = 30

export function toBase32(bytes: Buffer) {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31]
  return out
}

export function fromBase32(text: string) {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char)
    if (index < 0) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

// 새 비밀: 무작위 20바이트를 앱이 받는 base32로 쓴다.
export const newSecret = () => toBase32(randomBytes(20))

// 어느 순간이 속하는 30초 단위.
export const stepAt = (ms: number) => Math.floor(ms / 1000 / stepSeconds)

// 한 단위의 6자리 코드.
export function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac("sha1", fromBase32(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(number).padStart(6, "0")
}

// 입력한 코드가 속하는 단위. 시계가 조금 어긋난 경우를 위해 앞뒤 한 단위씩
// 허용하되, `usedStep` 이하는 허용하지 않아 코드가 한 번만 통한다. 어느
// 단위에도 맞지 않으면 undefined다.
export function matchStep(secret: string, typed: string, now = Date.now(), usedStep = -1) {
  const code = typed.replace(/\s/g, "")
  if (!/^\d{6}$/.test(code)) return undefined
  const current = stepAt(now)
  for (const step of [current - 1, current, current + 1]) {
    if (step <= usedStep) continue
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(code))) return step
  }
  return undefined
}

// 인증 앱이 QR 코드에서 읽는 주소.
export const otpauthUrl = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`uniconnect:${email}`)}?secret=${secret}&issuer=uniconnect&digits=6&period=${stepSeconds}`

// 4F7K-9QX2 같은 일회용 복구 코드 열 개. 휴대폰을 잃었을 때 쓰며 해시만
// 보관한다.
const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const chars = Array.from({ length: 8 }, () => recoveryAlphabet[randomInt(recoveryAlphabet.length)]).join("")
    return `${chars.slice(0, 4)}-${chars.slice(4)}`
  })
}

// 보관하는 복구 코드: 대소문자 구분 없이, 대시는 있어도 없어도 된다.
export const hashRecovery = (code: string) =>
  createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex")
