import { randomUUID } from "node:crypto"
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
  if (sql) {
    await ensureTables(sql)
    await sql("insert into uniconnect_errors (id, at, entry) values ($1, $2, $3)", [entry.id, entry.at, JSON.stringify(entry)])
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
  })
  await fileQueue
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
    return
  }
  fileQueue = fileQueue.then(() => writeFile(errorsFile(), "[]"))
  await fileQueue
}
