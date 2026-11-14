import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "../config.js"
import { recordError } from "./errorLog.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"

// 저장된 그대로의 데이터. 쓸 때마다 올라가는 버전이 붙는다.
export type Stored = { data: string; version: number }

// 다른 API 복사본이 먼저 써서 이 쓰기는 이뤄지지 않았다.
export class StaleWrite extends Error {}

// 데이터가 있는 곳(store.ts가 이를 통해 쓴다). JSON 파일(로컬 실행, 테스트,
// 디스크가 있는 서버 한 대)은 쓰는 쪽이 하나다. Postgres 데이터베이스
// (파일이 남지 않는 Vercel)는 API의 모든 복사본이 공유하므로, 쓸 때마다
// 어느 버전 위에 쓰는지 밝히고 각 복사본이 다른 쪽의 쓰기를 살핀다.
export type Storage = {
  shared: boolean
  // JSON.stringify에 쓰는 들여쓰기. 파일이 읽기 쉽게 남는다.
  indent?: number
  read(): Promise<Stored | undefined>
  version(): Promise<number | undefined>
  write(data: string, version: number): Promise<number>
  // 저장할 때마다 부르지만 복사본은 한 시간에 한 번 이하로 만들고, 찍은 지 24시간이
  // 지난 것은 지운다(개수가 아니라 시각이다). 정기 백업(store.ts의 backUpNow: 크론과
  // 한 시간 타이머)은 force로 그 간격과 상관없이 찍는다. 잘못된 변경을 되돌릴 수
  // 있게 한다(README에 방법이 있다). 실패는 운영자의 오류 기록에 남기며(where
  // "backup"), 저장할 때의 백업이 실패해도 저장은 실패하지 않는다. force일 때는
  // 실패를 던진다.
  backUp(data: string, force?: boolean): Promise<void>
  // 남은 복사본을 찍은 시각(UTC, "2026-10-24T13")별로 새것부터 나열하고, 그중
  // 하나를 통째로 읽는다. 운영자 콘솔용이다.
  listBackups(): Promise<{ hour: string; bytes: number }[]>
  readBackup(hour: string): Promise<string | undefined>
}

const backupHour = /^\d{4}-\d{2}-\d{2}T\d{2}$/

// 테스트는 lastAt을 초기화해 곧바로 복사본을 만든다.
export const backups = { lastAt: 0, everyMs: 60 * 60 * 1000, keptHours: 24 }

const backupDue = (force = false) => {
  if (!force && Date.now() - backups.lastAt < backups.everyMs) return false
  backups.lastAt = Date.now()
  return true
}

// 오류 기록에서 백업 실패를 찾는 표시(lib/backupStatus.ts).
export const backupWhere = "backup"

function backupFailed(error: unknown, force: boolean) {
  const message = (error as Error).message
  console.error(`[backup] ${message}`)
  recordError({ source: "server", message: `Backup failed: ${message}`, where: backupWhere, path: "/backup" })
  if (force) throw error
}

export const backupFolder = () => path.join(path.dirname(config.dataFile), "backups")

// config.dataFile은 호출마다 읽어서 테스트가 다른 곳을 가리킬 수 있다.
const fileStorage: Storage = {
  shared: false,
  indent: 2,
  async read() {
    try {
      return { data: await readFile(config.dataFile, "utf8"), version: 0 }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  },
  async version() {
    return undefined
  },
  // 임시 파일을 거쳐, 쓰다 멈춰도 db.json이 반쯤 쓰인 채 남지 않는다.
  async write(data, version) {
    await mkdir(path.dirname(config.dataFile), { recursive: true })
    const tempFile = `${config.dataFile}.tmp`
    await writeFile(tempFile, data)
    await rename(tempFile, config.dataFile)
    return version + 1
  },
  // 데이터 파일 옆 backups 폴더에 db-2026-10-24-13.json 식으로 둔다. 찍은
  // 시각은 UTC 기준 시(hour)다.
  async backUp(data, force = false) {
    if (!backupDue(force)) return
    try {
      const folder = backupFolder()
      await mkdir(folder, { recursive: true })
      await writeFile(path.join(folder, `db-${new Date().toISOString().slice(0, 13).replace("T", "-")}.json`), data)
      const files = (await readdir(folder)).filter((file) => /^db-.+\.json$/.test(file)).sort()
      // 개수가 아니라 찍은 시각으로 지운다. 쓰기가 적어도 처리방침의 보관 기간을 넘기지 않는다.
      const oldest = new Date(Date.now() - backups.keptHours * 60 * 60 * 1000).toISOString().slice(0, 13).replace("T", "-")
      await Promise.all(files.filter((file) => file.slice(3, 16) < oldest).map((file) => unlink(path.join(folder, file))))
    } catch (error) {
      backupFailed(error, force)
    }
  },
  async listBackups() {
    try {
      const folder = backupFolder()
      const files = (await readdir(folder)).filter((file) => /^db-.+\.json$/.test(file)).sort().reverse()
      return await Promise.all(
        files.map(async (file) => ({
          hour: file.slice(3, 16).replace(/-(\d{2})$/, "T$1"),
          bytes: (await stat(path.join(folder, file))).size,
        })),
      )
    } catch {
      return []
    }
  },
  async readBackup(hour) {
    if (!backupHour.test(hour)) return undefined
    try {
      return await readFile(path.join(backupFolder(), `db-${hour.replace("T", "-")}.json`), "utf8")
    } catch {
      return undefined
    }
  },
}

function postgresStorage(sql: Sql): Storage {
  return {
    shared: true,
    async read() {
      await ensureTables(sql)
      const [row] = await sql("select data, version from uniconnect_store where id = 1")
      return row ? { data: String(row.data), version: Number(row.version) } : undefined
    },
    async version() {
      await ensureTables(sql)
      const [row] = await sql("select version from uniconnect_store where id = 1")
      return row ? Number(row.version) : undefined
    },
    // 이 복사본이 가진 버전 위에서만 쓴다. 아니면 다른 복사본이 먼저 쓴
    // 것이다(버전 0이면 먼저 시드한 것).
    async write(data, version) {
      await ensureTables(sql)
      const rows =
        version === 0
          ? await sql(
              "insert into uniconnect_store (id, data, version) values (1, $1, 1) on conflict (id) do nothing returning version",
              [data],
            )
          : await sql(
              "update uniconnect_store set data = $1, version = version + 1, saved_at = now() where id = 1 and version = $2 returning version",
              [data, version],
            )
      if (rows.length === 0) throw new StaleWrite("The data was saved by another copy first.")
      return Number(rows[0].version)
    },
    // 시간(UTC)마다 한 행이며 그 시간에 처음 찍은 것을 둔다. 복사본마다 시계를
    // 따로 재므로 같은 시간에 다시 와도 덮어쓰지 않는다. 처리방침의 보관 기간이
    // 지난 행은 찍은 시각으로 지운다.
    async backUp(data, force = false) {
      if (!backupDue(force)) return
      try {
        await sql(
          "insert into uniconnect_backups (taken_at, data) values (date_trunc('hour', now()), $1) on conflict (taken_at) do nothing",
          [data],
        )
        await sql(
          "delete from uniconnect_backups where taken_at < now() - make_interval(hours => $1::int)",
          [backups.keptHours],
        )
      } catch (error) {
        backupFailed(error, force)
      }
    },
    async listBackups() {
      await ensureTables(sql)
      const rows = await sql("select to_char(taken_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24') as hour, length(data) as bytes from uniconnect_backups order by taken_at desc")
      return rows.map((row) => ({ hour: String(row.hour), bytes: Number(row.bytes) }))
    },
    async readBackup(hour) {
      if (!backupHour.test(hour)) return undefined
      await ensureTables(sql)
      const [row] = await sql("select data from uniconnect_backups where taken_at = $1::timestamptz", [`${hour}:00:00Z`])
      return row ? String(row.data) : undefined
    },
  }
}

// DATABASE_URL이 있으면(또는 테스트가 넘겨 주면) 데이터베이스, 아니면
// JSON 파일.
export function currentStorage(): Storage {
  const sql = databaseSql()
  return sql ? postgresStorage(sql) : fileStorage
}
