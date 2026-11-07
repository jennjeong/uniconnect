import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "../config.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"

// 데이터베이스가 없을 때 사진을 두는 곳: 데이터 파일 옆에 계약서(id),
// 행사(`event-<id>`, eventPhotos), 대화(`chat-<id>`, chatFiles)마다 폴더를
// 둔다. 그래서 테스트나 데모의 데이터가 각자 자기 것을 갖는다.
export const uploadsFolder = (agreementId: string) =>
  path.join(path.dirname(config.dataFile), "uploads", agreementId.replace(/[^\w-]/g, "_"))

// 계약서의 증빙 사진, 행사의 사진, 대화의 파일을 붙은 이름으로 둔다.
// 디스크의 파일이거나, 파일이 남지 않는 Vercel에서는 Postgres의 행(base64라
// 드라이버가 달라도 똑같이 돌려준다)이다.
export type PhotoStore = {
  put(agreementId: string, name: string, bytes: Buffer): Promise<void>
  get(agreementId: string, name: string): Promise<Buffer | undefined>
  remove(agreementId: string, names: string[]): Promise<void>
  removeAll(agreementIds: string[]): Promise<void>
  bytes(agreementIds: string[]): Promise<number>
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
  async bytes(agreementIds) {
    let total = 0
    for (const id of agreementIds) {
      const folder = uploadsFolder(id)
      const names = await readdir(folder).catch(() => [] as string[])
      for (const name of names) total += (await stat(path.join(folder, name))).size
    }
    return total
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
    async bytes(agreementIds) {
      if (agreementIds.length === 0) return 0
      await ensureTables(sql)
      // base64는 4글자가 3바이트다.
      const [row] = await sql("select coalesce(sum(length(data)), 0) as size from uniconnect_photos where agreement_id = any($1)", [agreementIds])
      return Math.floor((Number(row.size) * 3) / 4)
    },
  }
}

// 데이터베이스가 있으면 거기에, 없으면 디스크에 둔다.
export function photos(): PhotoStore {
  const sql = databaseSql()
  return sql ? postgresPhotos(sql) : filePhotos
}

// 행사의 사진을 넣는 폴더(pages/EventDetailPage.tsx).
// 기록을 저장한 뒤에 파일을 지운다. 이미 저장된 일이므로 삭제가 실패해도 요청을 실패시키지
// 않고 남긴다(읽는 경로는 기록에 없는 파일을 내주지 않는다).
export async function forgetPhotos(folder: string, names: string[]) {
  await photos()
    .remove(folder, names)
    .catch((error: Error) => console.error(`[photos] removing ${names.length} from ${folder}: ${error.message}`))
}

// 폴더들의 파일이 차지하는 바이트다.
export const folderBytes = (folders: string[]) => photos().bytes(folders)

export const eventPhotos = (eventId: string) => `event-${eventId}`

// 브라우저가 줄인 사진(lib/image.ts). 요청 크기 제한에 들 만큼 작고, 그
// 사진을 가리키는 이름이 붙는다.
const photoPattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/
const photoMaxLength = 280_000
export const photoName = /^[\w-]+\.(png|jpg|webp)$/

// 파일이 첫 바이트로 보아 말한 종류가 맞다.
function looksLike(kind: string, bytes: Buffer) {
  if (kind === "png") return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  if (kind === "jpeg") return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP"
}

// 페이지가 보낸 data URL을 보관할 사진으로: 바이트와 새 이름. PNG, JPG,
// WebP이고 크기 안이 아니면 undefined.
export function parsePhoto(image: unknown) {
  const match = typeof image === "string" && image.length <= photoMaxLength ? photoPattern.exec(image) : null
  const bytes = match ? Buffer.from(match[2], "base64") : undefined
  if (!match || !bytes || !looksLike(match[1], bytes)) return undefined
  return { bytes, name: `${randomUUID()}.${match[1] === "jpeg" ? "jpg" : match[1]}` }
}

// 대화의 파일을 넣는 폴더(routes/conversations.ts).
export const chatFiles = (conversationId: string) => `chat-${conversationId}`

// 대화에 보관된 파일: 사진 이름 또는 PDF 이름.
export const fileName = /^[\w-]+\.(png|jpg|webp|pdf)$/

// 대화가 받는 가장 큰 PDF.
export const pdfMaxBytes = 2 * 1024 * 1024
const pdfPattern = /^data:application\/pdf;base64,([A-Za-z0-9+/]+=*)$/

// 페이지가 data URL로 보낸 PDF. 2MB 이하이고 첫 바이트로 보아 진짜 PDF
// 여야 한다. 바이트와 새 이름을 돌려준다.
export function parsePdf(file: unknown) {
  const fits = typeof file === "string" && file.length <= Math.ceil((pdfMaxBytes * 4) / 3) + 40
  const match = fits ? pdfPattern.exec(file) : null
  const bytes = match ? Buffer.from(match[1], "base64") : undefined
  if (!bytes || bytes.length > pdfMaxBytes || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return undefined
  return { bytes, name: `${randomUUID()}.pdf` }
}

// 보관된 사진이나 파일을 내려보낼 때의 타입.
export const photoType = (name: string) =>
  name.endsWith(".pdf")
    ? "application/pdf"
    : name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg"
