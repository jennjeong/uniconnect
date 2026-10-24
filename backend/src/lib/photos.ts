import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "../config.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"

// Where an agreement's photos are kept without a database: beside the data
// file, one folder per agreement, so a test's or a demo's data keeps its own.
export const uploadsFolder = (agreementId: string) =>
  path.join(path.dirname(config.dataFile), "uploads", agreementId.replace(/[^\w-]/g, "_"))

// An agreement's proof photos, by the names the agreement keeps: files on
// disk, or rows in Postgres on Vercel, where files don't last (base64, so
// every driver hands them back alike).
export type PhotoStore = {
  put(agreementId: string, name: string, bytes: Buffer): Promise<void>
  get(agreementId: string, name: string): Promise<Buffer | undefined>
  remove(agreementId: string, names: string[]): Promise<void>
  removeAll(agreementIds: string[]): Promise<void>
}

const filePhotos: PhotoStore = {
  async put(agreementId, name, bytes) {
    const folder = uploadsFolder(agreementId)
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, name), bytes)
  },
  async get(agreementId, name) {
    return readFile(path.join(uploadsFolder(agreementId), name)).catch(() => undefined)
  },
  async remove(agreementId, names) {
    await Promise.all(names.map((name) => rm(path.join(uploadsFolder(agreementId), name), { force: true })))
  },
  async removeAll(agreementIds) {
    await Promise.all(agreementIds.map((id) => rm(uploadsFolder(id), { recursive: true, force: true })))
  },
}

function postgresPhotos(sql: Sql): PhotoStore {
  return {
    async put(agreementId, name, bytes) {
      await ensureTables(sql)
      await sql(
        "insert into uniconnect_photos (agreement_id, name, data) values ($1, $2, $3) on conflict (agreement_id, name) do update set data = excluded.data",
        [agreementId, name, bytes.toString("base64")],
      )
    },
    async get(agreementId, name) {
      await ensureTables(sql)
      const [row] = await sql("select data from uniconnect_photos where agreement_id = $1 and name = $2", [agreementId, name])
      return row ? Buffer.from(String(row.data), "base64") : undefined
    },
    async remove(agreementId, names) {
      if (names.length === 0) return
      await ensureTables(sql)
      for (const name of names) {
        await sql("delete from uniconnect_photos where agreement_id = $1 and name = $2", [agreementId, name])
      }
    },
    async removeAll(agreementIds) {
      if (agreementIds.length === 0) return
      await ensureTables(sql)
      for (const id of agreementIds) await sql("delete from uniconnect_photos where agreement_id = $1", [id])
    },
  }
}

// In the database when there is one, else on disk.
export function photos(): PhotoStore {
  const sql = databaseSql()
  return sql ? postgresPhotos(sql) : filePhotos
}
