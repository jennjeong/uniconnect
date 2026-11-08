// 백업 복구 훈련(#328). Postgres의 uniconnect_backups에 남은 백업이 운영자 API로
// 실제로 복원되는지, 데이터가 커지면 얼마나 걸리는지 잰다.
//
//   npx tsx backend/loadtest/restore-drill.ts                  프로세스 안의 Postgres(PGlite)
//   npx tsx backend/loadtest/restore-drill.ts <연결 문자열 파일>   빈 측정용 Neon 브랜치
//
// 연결 문자열은 출력하지 않는다. 데이터를 덮어쓰므로 Neon에서는 빈 측정용 브랜치에서만
// 돈다. uniconnect_store에 행이 있는데 이 스크립트가 남긴 표시가 없으면 멈춘다.
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"

const target = process.argv[2]
const dataDir = await mkdtemp(path.join(tmpdir(), "uniconnect-drill-"))
// 운영 설정이 섞이지 않게 비운다. 메일도 보내지 않는다.
for (const key of ["DATABASE_URL", "POSTGRES_URL", "RESEND_API_KEY", "TOSS_SECRET_KEY", "SECRETS_KEY"]) delete process.env[key]
process.env.DATA_FILE = path.join(dataDir, "db.json")
process.env.FRONTEND_DIST = dataDir
process.env.ADMIN_TOKEN = randomBytes(24).toString("hex")

type Sql = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
let sql: Sql
let close = async () => {}
if (target) {
  const { neonSql } = await import("../src/lib/sql.js")
  sql = neonSql(readFileSync(target, "utf8").trim(), 60_000)
  const [{ exists }] = await sql("select to_regclass('uniconnect_store') is not null as exists")
  const rows = exists ? Number((await sql("select count(*)::int as count from uniconnect_store"))[0].count) : 0
  const [{ marked }] = await sql("select to_regclass('uniconnect_drill_marker') is not null as marked")
  if (rows > 0 && !marked) throw new Error("This database already holds data and is not a drill branch. Stopping.")
  await sql("create table if not exists uniconnect_drill_marker (at timestamptz default now())")
} else {
  const { PGlite } = await import("@electric-sql/pglite")
  const db = new PGlite()
  sql = async (text, params = []) => (await db.query<Record<string, unknown>>(text, params)).rows
  close = () => db.close()
}

const { useSql } = await import("../src/lib/sql.js")
useSql(sql)
const { createApp } = await import("../src/app.js")
const store = await import("../src/store.js")
const { DEMO_PASSWORD } = await import("../src/data/seed.js")
const { clearRateLimits } = await import("../src/lib/rateLimit.js")

// 지난 훈련의 데이터를 지우고 시드부터 시작한다.
await sql("drop table if exists uniconnect_store, uniconnect_backups")
useSql(sql)
await store.loadDatabase()

const server = createApp().listen(0, "127.0.0.1")
await new Promise((resolve) => server.once("listening", resolve))
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`

async function call(method: string, route: string, body?: unknown, admin = true) {
  const started = performance.now()
  const response = await fetch(baseUrl + route, {
    method,
    headers: { "content-type": "application/json", ...(admin ? { "x-admin-token": process.env.ADMIN_TOKEN! } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { status: response.status, data, ms: performance.now() - started }
}

// 잃어버릴 회원이다. 복원 뒤 이 회원으로 다시 로그인한다.
const lost = { role: "학생단체", email: "muse@syu.ac.kr" }
const template = store.getDatabase().accounts.find((account) => account.email !== lost.email && account.role === "학생단체")!

// 회원을 더해 문서를 키운다. 소개 글을 채워 회원 하나가 약 2KB가 되게 한다.
function grow(accounts: number) {
  const database = store.getDatabase()
  for (let index = 0; index < accounts; index += 1) {
    const id = `drill-${database.accounts.length}-${index}`
    database.accounts.push({ ...structuredClone(template), id, email: `${id}@drill.invalid`, name: `훈련 단체 ${index}`, intro: "가".repeat(600) } as typeof template)
  }
}

type Row = { label: string; documentKb: number; backupMs: number; summaryMs: number; restoreMs: number; reloadMs: number; accountsBack: number; wrongConfirm: number; login: number }
const results: Row[] = []

for (const [label, extra] of [
  ["seed", 0],
  ["+2,000 accounts", 2_000],
  ["+10,000 accounts", 8_000],
] as const) {
  grow(extra)
  clearRateLimits()
  await store.saveDatabase()

  // 이번 시간의 백업 행을 실제 코드 경로로 새로 찍는다.
  await sql("delete from uniconnect_backups")
  store.backups.lastAt = 0
  let started = performance.now()
  await store.saveDatabase()
  const backupMs = performance.now() - started
  const [{ bytes }] = await sql("select length(data)::int as bytes from uniconnect_backups")

  // 사고: 회원 하나가 사라진다.
  const database = store.getDatabase()
  database.accounts = database.accounts.filter((account) => account.email !== lost.email)
  await store.saveDatabase()

  const system = await call("GET", "/admin/system")
  const hour = (system.data.backups as { hour: string }[])[0].hour
  const summary = await call("GET", `/admin/backups/${hour}/summary`)
  const wrong = await call("POST", `/admin/backups/${hour}/restore`, { confirm: "2000-01-01T00" })
  const restore = await call("POST", `/admin/backups/${hour}/restore`, { confirm: hour })
  if (restore.status !== 200) throw new Error(`Restore answered ${restore.status}: ${JSON.stringify(restore.data)}`)

  // 서버를 새로 켠 것처럼 데이터베이스에서 다시 읽는다.
  started = performance.now()
  await store.loadDatabase()
  const reloadMs = performance.now() - started
  if (!store.getDatabase().accounts.some((account) => account.email === lost.email)) throw new Error("The lost account did not come back.")
  const logged = store.getDatabase().adminLog?.some((entry) => entry.action === "backup-restored" && entry.target.id === hour)
  if (!logged) throw new Error("The restore was not written to the admin log.")
  const login = await call("POST", "/auth/login", { ...lost, password: DEMO_PASSWORD }, false)

  results.push({
    label,
    documentKb: Math.round(Number(bytes) / 1024),
    backupMs: Math.round(backupMs),
    summaryMs: Math.round(summary.ms),
    restoreMs: Math.round(restore.ms),
    reloadMs: Math.round(reloadMs),
    accountsBack: Number(summary.data.accountsBack),
    wrongConfirm: wrong.status,
    login: login.status,
  })
}

server.close()
await close()
await rm(dataDir, { recursive: true, force: true })
console.log(`database: ${target ? "Neon (drill branch)" : "PGlite (in process)"}`)
console.table(results)
const failed = results.filter((row) => row.accountsBack !== 1 || row.wrongConfirm !== 400 || row.login !== 200)
if (failed.length) {
  console.error("Drill failed:", failed.map((row) => row.label).join(", "))
  process.exit(1)
}
