import { createHash, randomUUID } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { waitUntil } from "@vercel/functions"

import { config } from "../config.js"
import { sendMail } from "./mailer.js"
import { databaseSql, ensureTables } from "./sql.js"

// 서버가 실패한 요청이나 방문자 브라우저가 잡은 오류를 운영자(/admin)에게
// 보여 준다: 무엇이, 어디서, 언제 잘못됐는지. 이름, 이메일, 메시지는 담지
// 않는다.
export type ErrorEntry = {
  id: string
  at: string
  source: "server" | "browser"
  message: string
  // 서버는 메서드와 라우트, 브라우저는 스크립트, 줄, 열.
  where: string
  // 페이지나 API의 경로. 쿼리는 뺀다.
  path: string
  // 줄을 찾을 수 있도록 서버 스택의 첫 프레임들.
  stack?: string
}

// 같은 오류의 묶음이다. 낱낱의 기록(최근 keep건)이 밀려나도 처음과 최근 발생, 횟수가 남는다.
// deploy는 오류가 들어왔을 때 떠 있던 배포의 커밋(VERCEL_GIT_COMMIT_SHA 앞 7자, 로컬은 null)이라,
// lastDeploy가 지금 배포(currentDeploy)와 같으면 지금 배포에서도 나는 오류다. 운영자가
// "확인함"으로 두면 handledAt이 남고, 그 뒤에 다시 나면 state가 "again"이 된다.
export type ErrorGroup = {
  key: string
  source: ErrorEntry["source"]
  // 가장 최근 것의 내용이다.
  message: string
  where: string
  path: string
  stack?: string
  firstAt: string
  lastAt: string
  count: number
  firstDeploy: string | null
  lastDeploy: string | null
  handledAt: string | null
  handledBy: string | null
  state: "open" | "handled" | "again"
}

export const currentDeploy = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null

// 묶음은 최근에 난 것부터 이만큼만 둔다.
const keepGroups = 300

// 같은 오류인지 가리는 열쇠. 배포마다 바뀌는 번들 이름의 해시와 줄 · 열, 경로 속 id(숫자가
// 든 긴 조각)는 빼고 본다. 페이지 경로는 넣지 않는다(같은 오류가 여러 화면에서 난다).
const normalize = (text: string) =>
  text
    .replace(/-[A-Za-z0-9_]{8}(?=\.(m?js|css)\b)/g, "")
    .replace(/(\.m?js)(:\d+){1,2}/g, "$1")
    .replace(/\/[^/\s?#]*\d[^/\s?#]*/g, (segment) => (segment.length > 6 ? "/:id" : segment))
export const errorKey = (entry: Pick<ErrorEntry, "source" | "message" | "where">) =>
  createHash("sha256").update(`${entry.source}\u0000${normalize(entry.message)}\u0000${normalize(entry.where)}`).digest("hex").slice(0, 32)

const stateOf = (group: Omit<ErrorGroup, "state">): ErrorGroup["state"] =>
  !group.handledAt ? "open" : group.lastAt > group.handledAt ? "again" : "handled"

const groupsFile = () => path.join(path.dirname(config.dataFile), "error-groups.json")

async function readFileGroups(): Promise<Omit<ErrorGroup, "state">[]> {
  try {
    return JSON.parse(await readFile(groupsFile(), "utf8")) as Omit<ErrorGroup, "state">[]
  } catch {
    return []
  }
}

// 최근 것만 쪽마다 둔다. 브라우저 보고는 누구나 보낼 수 있으므로, 그것으로 서버 오류를
// 밀어내지 못하게 한다.
const keep = 200
// 이만한 시간 전까지 다른 오류가 없었으면 새 오류는 운영자에게 새 소식이다.
// 그 이후라면 이미 문제가 있음을 안다.
const quietMs = 60 * 60 * 1000

const errorsFile = () => path.join(path.dirname(config.dataFile), "errors.json")

async function readFileEntries(): Promise<ErrorEntry[]> {
  try {
    return JSON.parse(await readFile(errorsFile(), "utf8")) as ErrorEntry[]
  } catch {
    return []
  }
}

// 파일 쓰기는 한 번에 하나씩 해서 잃는 것이 없게 한다.
let fileQueue: Promise<unknown> = Promise.resolve()

// 새것부터. 데이터베이스가 있으면 Postgres 테이블에서(Vercel에는 파일이
// 남지 않는다), 없으면 데이터 옆 파일에서.
export async function recentErrors(): Promise<ErrorEntry[]> {
  const sql = databaseSql()
  if (!sql) return (await readFileEntries()).sort((a, b) => b.at.localeCompare(a.at))
  await ensureTables(sql)
  const rows = await sql("select entry from uniconnect_errors order by at desc limit $1", [keep * 2])
  return rows.map((row) => JSON.parse(String(row.entry)) as ErrorEntry)
}

async function store(entry: ErrorEntry) {
  const sql = databaseSql()
  const key = errorKey(entry)
  const deploy = currentDeploy()
  const sample = JSON.stringify({ message: entry.message, where: entry.where, path: entry.path, ...(entry.stack ? { stack: entry.stack } : {}) })
  if (sql) {
    await ensureTables(sql)
    await sql("insert into uniconnect_errors (id, at, entry) values ($1, $2, $3)", [entry.id, entry.at, JSON.stringify(entry)])
    // 한 문장으로 세서 복사본들이 함께 와도 잃지 않는다.
    await sql(
      `insert into uniconnect_error_groups (key, source, sample, first_at, last_at, count, first_deploy, last_deploy)
       values ($1, $2, $3, $4, $4, 1, $5, $5)
       on conflict (key) do update set sample = excluded.sample, count = uniconnect_error_groups.count + 1,
         last_at = greatest(uniconnect_error_groups.last_at, excluded.last_at), last_deploy = excluded.last_deploy`,
      [key, entry.source, sample, entry.at, deploy],
    )
    await sql(
      "delete from uniconnect_error_groups where key not in (select key from uniconnect_error_groups order by last_at desc limit $1)",
      [keepGroups],
    )
    await sql(
      `delete from uniconnect_errors where (entry::json->>'source') = $2 and id not in
         (select id from uniconnect_errors where (entry::json->>'source') = $2 order by at desc limit $1)`,
      [keep, entry.source],
    )
    return
  }
  fileQueue = fileQueue.then(async () => {
    const sorted = [...(await readFileEntries()), entry].sort((a, b) => b.at.localeCompare(a.at))
    const entries = (["server", "browser"] as const).flatMap((source) => sorted.filter((item) => item.source === source).slice(0, keep))
    await writeFile(errorsFile(), JSON.stringify(entries))
    const groups = await readFileGroups()
    const found = groups.find((group) => group.key === key)
    const latest = { ...JSON.parse(sample), lastAt: entry.at, lastDeploy: deploy }
    if (found) Object.assign(found, latest, { count: found.count + 1 })
    else groups.push({ key, source: entry.source, ...latest, firstAt: entry.at, count: 1, firstDeploy: deploy, handledAt: null, handledBy: null })
    groups.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    await writeFile(groupsFile(), JSON.stringify(groups.slice(0, keepGroups)))
  })
  await fileQueue
}

const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string).toISOString())

// 같은 오류의 묶음을 최근에 난 것부터.
export async function errorGroups(): Promise<ErrorGroup[]> {
  const sql = databaseSql()
  const groups: Omit<ErrorGroup, "state">[] = sql
    ? await (async () => {
        await ensureTables(sql)
        const rows = await sql(
          "select key, source, sample, first_at, last_at, count, first_deploy, last_deploy, handled_at, handled_by from uniconnect_error_groups order by last_at desc limit $1",
          [keepGroups],
        )
        return rows.map((row) => ({
          key: String(row.key),
          source: row.source as ErrorEntry["source"],
          ...(JSON.parse(String(row.sample)) as Pick<ErrorEntry, "message" | "where" | "path" | "stack">),
          firstAt: iso(row.first_at)!,
          lastAt: iso(row.last_at)!,
          count: Number(row.count),
          firstDeploy: (row.first_deploy as string | null) ?? null,
          lastDeploy: (row.last_deploy as string | null) ?? null,
          handledAt: iso(row.handled_at),
          handledBy: (row.handled_by as string | null) ?? null,
        }))
      })()
    : await (async () => {
        await fileQueue
        return readFileGroups()
      })()
  return groups.map((group) => ({ ...group, state: stateOf(group) }))
}

// 운영자가 묶음을 확인함으로 두거나 되돌린다. 없는 묶음이면 false다.
export async function markErrorGroup(key: string, handled: boolean, by: string | undefined, now = new Date()) {
  const handledAt = handled ? now.toISOString() : null
  const handledBy = handled ? (by ?? null) : null
  const sql = databaseSql()
  if (sql) {
    await ensureTables(sql)
    const rows = await sql("update uniconnect_error_groups set handled_at = $2, handled_by = $3 where key = $1 returning key", [key, handledAt, handledBy])
    return rows.length > 0
  }
  let found = false
  fileQueue = fileQueue.then(async () => {
    const groups = await readFileGroups()
    const group = groups.find((item) => item.key === key)
    if (!group) return
    found = true
    Object.assign(group, { handledAt, handledBy })
    await writeFile(groupsFile(), JSON.stringify(groups))
  })
  await fileQueue
  return found
}

// 오류를 남기고, 조용한 한 시간 뒤 처음 난 오류면 OPERATOR_EMAIL로 운영자에게
// 이메일을 보낸다. 원래 요청을 실패하게 하거나 붙잡지 않는다. Vercel에서는
// waitUntil이 응답 뒤에도 끝까지 돌게 한다.
export function recordError(entry: Omit<ErrorEntry, "id" | "at">) {
  const full: ErrorEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...entry,
    message: entry.message.slice(0, 300),
    where: entry.where.slice(0, 200),
    path: entry.path.split("?")[0].slice(0, 200),
  }
  const done = (async () => {
    // 서버 오류의 알림은 서버 오류만 막는다. 아니면 브라우저 보고를 한 시간마다 보내 알림을
    // 끊을 수 있다.
    const recent = await recentErrors()
    const latest = full.source === "server" ? recent.find((item) => item.source === "server") : recent[0]
    await store(full)
    const news = !latest || Date.parse(full.at) - Date.parse(latest.at) > quietMs
    if (news && config.operatorEmail) {
      const link = config.siteUrl ? `${config.siteUrl.replace(/\/$/, "")}/admin` : undefined
      await sendMail(
        config.operatorEmail,
        "[uniconnect] 오류가 생겼어요",
        [
          `${full.source === "server" ? "서버" : "화면"}에서 오류가 생겼어요.`,
          // 브라우저 보고의 내용은 누구나 쓸 수 있으므로 메일에 넣지 않는다.
          ...(full.source === "server" ? [`${full.where} · ${full.path}`, full.message] : []),
          "",
          "한 시간 안에 이어지는 오류는 따로 알리지 않아요. 운영자 화면의 최근 오류에서 모두 볼 수 있어요.",
          ...(link ? [`바로 가기: ${link}`] : []),
          "",
          "uniconnect",
        ].join("\n"),
      )
    }
  })().catch((error: Error) => {
    console.error(`[errors] could not keep an error: ${error.message}`)
  })
  waitUntil(done)
  return done
}

// 테스트는 빈 로그에서 시작한다.
export async function clearErrorLog() {
  const sql = databaseSql()
  if (sql) {
    await ensureTables(sql)
    await sql("delete from uniconnect_errors")
    await sql("delete from uniconnect_error_groups")
    return
  }
  fileQueue = fileQueue.then(() => Promise.all([writeFile(errorsFile(), "[]"), writeFile(groupsFile(), "[]")]))
  await fileQueue
}
