import { randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

const KEY_LENGTH = 64

type Cost = { N: number; r: number; p: number }
// OWASP가 scrypt에 권하는 최소 강도 중 하나(N=2^15, r=8, p=3)다. 메모리는 한 번에
// 32MB라 서버리스 인스턴스에서 로그인이 몰려도 버틴다. 노트북에서 한 번에 약 170ms.
const cost: Cost = { N: 2 ** 15, r: 8, p: 3 }
// 예전 형식("salt:hash")은 Node의 기본값으로 만든 것이다.
const legacy: Cost = { N: 2 ** 14, r: 8, p: 1 }

function derive(password: string, salt: string, { N, r, p }: Cost) {
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

// "scrypt:N:r:p:salt:hash"(16진수)로 저장한다. 평문 비밀번호는 디스크에 쓰지 않는다.
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const key = await derive(password, salt, cost)
  return `scrypt:${cost.N}:${cost.r}:${cost.p}:${salt}:${key.toString("hex")}`
}

function parse(stored: string): { salt: string; hash: string; cost: Cost } | undefined {
  const parts = stored.split(":")
  if (parts.length === 2) return parts[0] && parts[1] ? { salt: parts[0], hash: parts[1], cost: legacy } : undefined
  if (parts.length !== 6 || parts[0] !== "scrypt") return undefined
  const [N, r, p] = parts.slice(1, 4).map(Number)
  // 저장된 값이 터무니없는 강도로 서버를 붙잡지 못하게 한다.
  if (![N, r, p].every(Number.isInteger) || N < 2 || N > 2 ** 17 || (N & (N - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 8) return undefined
  return { salt: parts[4], hash: parts[5], cost: { N, r, p } }
}

export async function verifyPassword(password: string, stored: string) {
  const parsed = parse(stored)
  if (!parsed || !parsed.salt || !parsed.hash) return false
  const expected = Buffer.from(parsed.hash, "hex")
  const actual = await derive(password, parsed.salt, parsed.cost)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// 지금 강도보다 약하게 저장된 해시다. 로그인에 성공했을 때 맞는 비밀번호로 다시 만든다.
export function needsRehash(stored: string) {
  const parsed = parse(stored)
  return !parsed || parsed.cost.N !== cost.N || parsed.cost.r !== cost.r || parsed.cost.p !== cost.p
}

// 다시 만든 해시와 원래 해시의 짝이다. 로그인은 확인하는 동안 비밀번호가 바뀌었는지
// 해시를 비교해 살피는데, 다시 만든 것은 바뀐 것이 아니다. 이 복사본이 만든 것만
// 알면 된다. 다른 복사본의 것은 데이터를 새로 읽어야 보이므로 그 전에는 원래 해시다.
const upgraded = new Map<string, string>()

export function samePasswordHash(before: string | undefined, after: string | undefined) {
  return before !== undefined && (before === after || upgraded.get(before) === after)
}

// 맞는 비밀번호로 로그인한 뒤 부른다. 바꿨으면 true이고, 호출한 쪽이 저장한다.
export async function upgradePasswordHash(holder: { passwordHash: string }, password: string) {
  const before = holder.passwordHash
  if (!needsRehash(before)) return false
  const after = await hashPassword(password)
  // 다시 만드는 동안 비밀번호가 바뀌었으면 그쪽이 이긴다.
  if (holder.passwordHash !== before) return false
  if (upgraded.size > 10_000) upgraded.clear()
  upgraded.set(before, after)
  holder.passwordHash = after
  return true
}

// 없는 계정에도 비밀번호를 확인해 응답 시간으로 가입 여부를 알아내지 못하게 한다.
let decoy: Promise<string> | undefined
export const decoyPasswordHash = () => (decoy ??= hashPassword(randomUUID()))
