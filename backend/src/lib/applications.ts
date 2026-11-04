import { randomUUID } from "node:crypto"

import { HttpError } from "./errors.js"
import { parsePdf, parsePhoto, photos } from "./photos.js"
import { text } from "./validation.js"
import type { Application, Database } from "../types.js"

// Sign-ups the operators check before they count (/admin's 가입 승인): a shop
// owner with no company email, who shows a business document, and a
// co-admin, who shows proof of employment. Until an operator approves it,
// nothing exists: the account or co-admin waits here, whole, and its email
// counts as taken. The document goes once it is decided.
export const applicationsOf = (database: Database) => (database.applications ??= [])

export const applicationFolder = (id: string) => `application-${id}`

export const applicationFor = (database: Database, email: string) =>
  applicationsOf(database).find((application) => application.email === email)

// A document as sent: a resized photo or a PDF up to 2 MB, with the name it
// had; the error says what is missing.
export function parseDocument(input: unknown, missing: string) {
  const body = (input ?? {}) as { file?: unknown; name?: unknown }
  const parsed = parsePhoto(body.file) ?? parsePdf(body.file)
  if (!parsed) throw new HttpError(400, missing)
  const name = text(body.name).replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80) || parsed.name
  return { file: parsed.name, bytes: parsed.bytes, name }
}

// Keeps the document and adds the application; if the save fails the
// document goes again and the application with the data.
export async function holdApplication(
  database: Database,
  save: () => Promise<void>,
  document: ReturnType<typeof parseDocument>,
  fields: Omit<Application, "id" | "document" | "requestedAt">,
) {
  const id = randomUUID()
  await photos().put(applicationFolder(id), document.file, document.bytes)
  applicationsOf(database).push({
    ...fields,
    id,
    document: { file: document.file, name: document.name, size: document.bytes.length },
    requestedAt: new Date().toISOString(),
  })
  try {
    await save()
  } catch (error) {
    await photos().removeAll([applicationFolder(id)])
    throw error
  }
}
