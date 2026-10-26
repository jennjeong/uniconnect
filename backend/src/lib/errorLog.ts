import { randomUUID } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { waitUntil } from "@vercel/functions"

import { config } from "../config.js"
import { sendMail } from "./mailer.js"
import { databaseSql, ensureTables } from "./sql.js"

// A request the server failed, or an error a visitor's browser caught,
// for the operators (/admin): what went wrong, where and when, with no
// names, emails or messages in it.
export type ErrorEntry = {
  id: string
  at: string
  source: "server" | "browser"
  message: string
  // The method and route for the server; the script, line and column for
  // a browser.
  where: string
  // The page's or API's path, without its query.
  path: string
  // The first frames of the server's stack, to find the line.
  stack?: string
}

// The newest ones kept.
const keep = 200
// Without another error in this long before it, a new one is news to the
// operators; after it, they already know something is wrong.
const quietMs = 60 * 60 * 1000

const errorsFile = () => path.join(path.dirname(config.dataFile), "errors.json")

async function readFileEntries(): Promise<ErrorEntry[]> {
  try {
    return JSON.parse(await readFile(errorsFile(), "utf8")) as ErrorEntry[]
  } catch {
    return []
  }
}

// Writes to the file go one at a time, so none is lost.
let fileQueue: Promise<unknown> = Promise.resolve()

// The newest first, from the Postgres table when there is a database (as
// files don't last on Vercel), else from the file beside the data.
export async function recentErrors(): Promise<ErrorEntry[]> {
  const sql = databaseSql()
  if (!sql) return (await readFileEntries()).sort((a, b) => b.at.localeCompare(a.at))
  await ensureTables(sql)
  const rows = await sql("select entry from uniconnect_errors order by at desc limit $1", [keep])
  return rows.map((row) => JSON.parse(String(row.entry)) as ErrorEntry)
}

async function store(entry: ErrorEntry) {
  const sql = databaseSql()
  if (sql) {
    await ensureTables(sql)
    await sql("insert into uniconnect_errors (id, at, entry) values ($1, $2, $3)", [entry.id, entry.at, JSON.stringify(entry)])
    await sql(
      "delete from uniconnect_errors where id not in (select id from uniconnect_errors order by at desc limit $1)",
      [keep],
    )
    return
  }
  fileQueue = fileQueue.then(async () => {
    const entries = [...(await readFileEntries()), entry].sort((a, b) => b.at.localeCompare(a.at)).slice(0, keep)
    await writeFile(errorsFile(), JSON.stringify(entries))
  })
  await fileQueue
}

// Keeps an error and, when it is the first after a quiet hour, emails the
// operators at OPERATOR_EMAIL. Never fails or holds up the request it
// came from; on Vercel waitUntil lets it finish after the answer.
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
    const [latest] = await recentErrors()
    await store(full)
    const news = !latest || Date.parse(full.at) - Date.parse(latest.at) > quietMs
    if (news && config.operatorEmail) {
      const link = config.siteUrl ? `${config.siteUrl.replace(/\/$/, "")}/admin` : undefined
      await sendMail(
        config.operatorEmail,
        "[uniconnect] 오류가 생겼어요",
        [
          `${full.source === "server" ? "서버" : "화면"}에서 오류가 생겼어요.`,
          `${full.where} · ${full.path}`,
          full.message,
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

// Tests start from an empty log.
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
