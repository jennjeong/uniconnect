import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

const KEY_LENGTH = 64

function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

// "salt:hash"(16진수)로 저장한다. 평문 비밀번호는 디스크에 쓰지 않는다.
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const key = await derive(password, salt)
  return `${salt}:${key.toString("hex")}`
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, "hex")
  const actual = await derive(password, salt)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
