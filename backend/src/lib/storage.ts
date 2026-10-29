import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "../config.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"

// The data as stored, with a version that moves on with every write.
export type Stored = { data: string; version: number }

// Another copy of the API wrote first, so this write was not made.
export class StaleWrite extends Error {}

// Where the data lives (store.ts writes through this). A JSON file (local
// runs, tests, one server with a disk) has a single writer. A Postgres
// database (Vercel, where files don't last) is shared by every copy of the
// API, so each write says which version it builds on, and each copy looks
// for the others' writes.
export type Storage = {
  shared: boolean
  // Spaces for JSON.stringify: the file stays readable.
  indent?: number
  read(): Promise<Stored | undefined>
  version(): Promise<number | undefined>
  write(data: string, version: number): Promise<number>
  // A copy at most once an hour, keeping the latest 24, so a bad change can
  // be undone (README says how). A failed backup never fails the save.
  backUp(data: string): Promise<void>
  // The copies kept, newest first, by the hour they were taken (UTC,
  // "2026-10-24T13"), and one of them in full, for the operators' console.
  listBackups(): Promise<{ hour: string; bytes: number }[]>
  readBackup(hour: string): Promise<string | undefined>
}

const backupHour = /^\d{4}-\d{2}-\d{2}T\d{2}$/

// Tests reset lastAt to take a copy at once.
export const backups = { lastAt: 0, everyMs: 60 * 60 * 1000, kept: 24 }

const backupDue = () => {
  if (Date.now() - backups.lastAt < backups.everyMs) return false
  backups.lastAt = Date.now()
  return true
}

export const backupFolder = () => path.join(path.dirname(config.dataFile), "backups")

// config.dataFile is read on every call, so tests can point it elsewhere.
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
  // Through a temp file, so a crash mid-write cannot leave half a db.json.
  async write(data, version) {
    await mkdir(path.dirname(config.dataFile), { recursive: true })
    const tempFile = `${config.dataFile}.tmp`
    await writeFile(tempFile, data)
    await rename(tempFile, config.dataFile)
    return version + 1
  },
  // In a backups folder beside the data file: db-2026-10-24-13.json, the
  // hour it was taken in UTC.
  async backUp(data) {
    if (!backupDue()) return
    try {
      const folder = backupFolder()
      await mkdir(folder, { recursive: true })
      await writeFile(path.join(folder, `db-${new Date().toISOString().slice(0, 13).replace("T", "-")}.json`), data)
      const files = (await readdir(folder)).filter((file) => /^db-.+\.json$/.test(file)).sort()
      await Promise.all(files.slice(0, -backups.kept).map((file) => unlink(path.join(folder, file))))
    } catch (error) {
      console.error(`[backup] ${(error as Error).message}`)
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
    // Only over the version this copy has; otherwise another copy wrote
    // first (or seeded first, for version 0).
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
    // One row per hour (UTC), the latest 24.
    async backUp(data) {
      if (!backupDue()) return
      try {
        await sql(
          "insert into uniconnect_backups (taken_at, data) values (date_trunc('hour', now()), $1) on conflict (taken_at) do update set data = excluded.data",
          [data],
        )
        await sql(
          "delete from uniconnect_backups where taken_at < (select min(taken_at) from (select taken_at from uniconnect_backups order by taken_at desc limit $1) as kept)",
          [backups.kept],
        )
      } catch (error) {
        console.error(`[backup] ${(error as Error).message}`)
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

// The database when DATABASE_URL is set (or a test handed one in), else
// the JSON file.
export function currentStorage(): Storage {
  const sql = databaseSql()
  return sql ? postgresStorage(sql) : fileStorage
}
