import { randomUUID } from "node:crypto"

import { HttpError } from "./errors.js"
import { parsePdf, parsePhoto, photos } from "./photos.js"
import { text } from "./validation.js"
import type { Application, Database } from "../types.js"

// 운영자가 세기 전에 확인하는 가입(/admin의 가입 승인): 회사 이메일이 없는
// 가게 주인이 내는 사업 서류, 공동 관리자가 내는 재직 증빙. 운영자가
// 승인하기 전에는 아무것도 생기지 않는다. 계정이나 공동 관리자는 통째로
// 여기서 기다리고 이메일은 사용 중으로 친다. 서류는 결정이 나면 지운다.
export const applicationsOf = (database: Database) => (database.applications ??= [])

export const applicationFolder = (id: string) => `application-${id}`

export const applicationFor = (database: Database, email: string) =>
  applicationsOf(database).find((application) => application.email === email && !application.linkAccountId)

// 보낸 그대로의 서류: 줄인 사진이나 2MB 이하 PDF와 그 이름. 오류는 빠진 것을
// 말해 준다.
export function parseDocument(input: unknown, missing: string) {
  const body = (input ?? {}) as { file?: unknown; name?: unknown }
  const parsed = parsePhoto(body.file) ?? parsePdf(body.file)
  if (!parsed) throw new HttpError(400, missing)
  // 확장자는 내용을 따른다. 보낸 이름의 것을 남기면 운영자가 내려받아 연 파일이
  // .html로 실행될 수 있다.
  const stem = text(body.name).replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ").replace(/\.[^.]*$/, "").trim().slice(0, 70)
  const name = `${stem || "서류"}.${parsed.name.split(".").pop()}`
  return { file: parsed.name, bytes: parsed.bytes, name }
}

// 서류를 보관하고 신청을 더한다. 저장이 실패하면 서류도 지우고 신청은
// 데이터와 함께 되돌린다.
export async function holdApplication(
  database: Database,
  save: () => Promise<void>,
  document: ReturnType<typeof parseDocument>,
  fields: Omit<Application, "id" | "document" | "requestedAt">,
) {
  const id = randomUUID()
  // 서류를 보관하기 전에 신청부터 남긴다. 그래야 동시에 온 요청이 중복 확인을
  // 지나지 못한다.
  applicationsOf(database).push({
    ...fields,
    id,
    document: { file: document.file, name: document.name, size: document.bytes.length },
    requestedAt: new Date().toISOString(),
  })
  try {
    await photos().put(applicationFolder(id), document.file, document.bytes)
    await save()
  } catch (error) {
    const held = applicationsOf(database)
    const index = held.findIndex((application) => application.id === id)
    if (index >= 0) held.splice(index, 1)
    await photos().removeAll([applicationFolder(id)])
    throw error
  }
}
