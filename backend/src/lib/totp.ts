import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"

// Two-step login with an authenticator app (RFC 6238: 6 digits, 30-second
// steps, HMAC-SHA1), as Google Authenticator and the others read it from
// an otpauth:// address.

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

// A new secret: 20 random bytes, in base32 as apps take it.
export const newSecret = () => toBase32(randomBytes(20))

// The 30-second step a moment falls in.
export const stepAt = (ms: number) => Math.floor(ms / 1000 / stepSeconds)

// The 6-digit code of one step.
export function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac("sha1", fromBase32(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(number).padStart(6, "0")
}

// The step a typed code belongs to, allowing a step either side for a
// clock off by a little, but none at or before `usedStep`, so a code
// works once; undefined when it matches none.
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

// The address an authenticator app reads from the QR code.
export const otpauthUrl = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`uniconnect:${email}`)}?secret=${secret}&issuer=uniconnect&digits=6&period=${stepSeconds}`

// Ten one-time recovery codes such as 4F7K-9QX2, for when the phone is
// lost; only their hashes are kept.
const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const chars = Array.from({ length: 8 }, () => recoveryAlphabet[randomInt(recoveryAlphabet.length)]).join("")
    return `${chars.slice(0, 4)}-${chars.slice(4)}`
  })
}

// A recovery code as kept: typed in any case, with or without the dash.
export const hashRecovery = (code: string) =>
  createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex")
