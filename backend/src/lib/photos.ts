import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "../config.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"

// Where photos are kept without a database: beside the data file, one folder
// per agreement (its id), event (`event-<id>`, eventPhotos) or conversation
// (`chat-<id>`, chatFiles), so a test's or a demo's data keeps its own.
export const uploadsFolder = (agreementId: string) =>
  path.join(path.dirname(config.dataFile), "uploads", agreementId.replace(/[^\w-]/g, "_"))

// An agreement's proof photos, an event's photos or a conversation's files,
// by the names they keep: files on disk, or rows in Postgres on Vercel,
// where files don't last (base64, so every driver hands them back alike).
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

// The folder an event's photos go in (pages/EventDetailPage.tsx).
export const eventPhotos = (eventId: string) => `event-${eventId}`

// A photo the browser resized (lib/image.ts), small enough for the request
// size limit, and the name it is kept by.
const photoPattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/
const photoMaxLength = 280_000
export const photoName = /^[\w-]+\.(png|jpg|webp)$/

// The file really is the kind it says, by its first bytes.
function looksLike(kind: string, bytes: Buffer) {
  if (kind === "png") return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  if (kind === "jpeg") return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP"
}

// A data URL from the page as a photo to keep: its bytes and a new name,
// or undefined when it isn't a PNG, JPG or WebP within the size.
export function parsePhoto(image: unknown) {
  const match = typeof image === "string" && image.length <= photoMaxLength ? photoPattern.exec(image) : null
  const bytes = match ? Buffer.from(match[2], "base64") : undefined
  if (!match || !bytes || !looksLike(match[1], bytes)) return undefined
  return { bytes, name: `${randomUUID()}.${match[1] === "jpeg" ? "jpg" : match[1]}` }
}

// The folder a conversation's files go in (routes/conversations.ts).
export const chatFiles = (conversationId: string) => `chat-${conversationId}`

// A file kept for a conversation: a photo's name or a PDF's.
export const fileName = /^[\w-]+\.(png|jpg|webp|pdf)$/

// The largest PDF a conversation takes.
export const pdfMaxBytes = 2 * 1024 * 1024
const pdfPattern = /^data:application\/pdf;base64,([A-Za-z0-9+/]+=*)$/

// A PDF from the page as a data URL, 2 MB at most and really a PDF by its
// first bytes: its bytes and a new name.
export function parsePdf(file: unknown) {
  const fits = typeof file === "string" && file.length <= Math.ceil((pdfMaxBytes * 4) / 3) + 40
  const match = fits ? pdfPattern.exec(file) : null
  const bytes = match ? Buffer.from(match[1], "base64") : undefined
  if (!bytes || bytes.length > pdfMaxBytes || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return undefined
  return { bytes, name: `${randomUUID()}.pdf` }
}

// The type a kept photo or file is served as.
export const photoType = (name: string) =>
  name.endsWith(".pdf")
    ? "application/pdf"
    : name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg"
