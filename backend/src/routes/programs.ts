import { Router } from "express"
import type { Request } from "express"

import { logAdmin } from "../lib/adminTools.js"
import { withVat } from "../lib/billing.js"
import { HttpError } from "../lib/errors.js"
import {
  addProgram,
  candidateOptions,
  findOwnProgram,
  moveProgram,
  ownPrograms,
  parseBrief,
  parseCandidates,
  parseQuote,
  programsOf,
  programView,
  quoteProgram,
  withdrawProgram,
} from "../lib/programs.js"
import { notify } from "../lib/notices.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { writeRouter } from "../middleware/retrying.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { ProgramStatus } from "../types.js"
import { requireAdmin } from "./admin.js"

// 브랜드의 캠퍼스 캠페인이다(lib/programs.ts, #400). 운영비 결제는 다른 상품처럼
// `POST /api/billing/orders`에 kind "program"과 캠페인 id로 한다.
export const programsRouter = writeRouter()

function brandOnly(req: Request) {
  const account = requireAccount(req)
  if (account.role !== "브랜드") throw new HttpError(403, "캠퍼스 캠페인은 브랜드 계정만 쓸 수 있어요.")
  return account
}

programsRouter.get("/", (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  res.json({ programs: ownPrograms(database, account.id).map((program) => programView(database, program)).reverse() })
})

// 여러 방문자가 함께 쓰는 데모 계정은 요청서를 내지 못한다.
programsRouter.post("/", async (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 캠페인을 요청할 수 없어요.")
  const program = addProgram(database, account, parseBrief(req.body))
  await saveDatabase()
  res.status(201).json({ program: programView(database, program) })
})

programsRouter.get("/:id", (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  res.json({ program: programView(database, findOwnProgram(database, account.id, req.params.id)) })
})

// 결제 전에 거둔다.
programsRouter.post("/:id/withdraw", async (req, res) => {
  const account = brandOnly(req)
  const database = getDatabase()
  const program = findOwnProgram(database, account.id, req.params.id)
  withdrawProgram(database, program)
  await saveDatabase()
  res.json({ program: programView(database, program) })
})

// 콘솔에서 보는 캠페인이다.
export const adminProgramsRouter = Router()

const adminStatuses: readonly ProgramStatus[] = ["섭외 중", "집행 중", "완료", "취소"]

function anyProgram(id: unknown) {
  const database = getDatabase()
  const program = programsOf(database).find((item) => item.id === id)
  if (!program) throw new HttpError(404, "캠페인을 찾을 수 없어요.")
  return { database, program }
}

adminProgramsRouter.get("/", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const programs = programsOf(database)
    .map((program) => {
      const account = database.accounts.find((item) => item.id === program.accountId)
      return { ...programView(database, program), accountId: program.accountId, brandName: account?.name ?? "" }
    })
    .reverse()
  res.json({ programs })
})

adminProgramsRouter.put("/:id/quote", async (req, res) => {
  await requireAdmin(req)
  const { database, program } = anyProgram(req.params.id)
  quoteProgram(database, program, parseQuote(req.body))
  logAdmin(database, "program-quoted", { kind: "program", id: program.id })
  await saveDatabase()
  // 저장한 뒤에 브랜드에게 알린다.
  void notify(
    database.accounts.find((account) => account.id === program.accountId),
    "account",
    "캠퍼스 캠페인 견적이 나왔어요",
    [
      `'${program.brief.name}' 캠페인의 견적이 나왔어요.`,
      `운영비는 부가세를 더해 ${withVat(program.quote!.fee).toLocaleString("ko-KR")}원이에요.`,
      "실비는 견적에 적힌 금액만큼 단체와 업체에 직접 지급해요.",
      "견적을 확인하고 운영비를 결제하면 학교 섭외를 시작해요.",
    ],
    `/programs/${program.id}`,
  )
  res.json({ program: programView(database, program) })
})

adminProgramsRouter.post("/:id/status", async (req, res) => {
  await requireAdmin(req)
  const { database, program } = anyProgram(req.params.id)
  const status = text(req.body?.status) as ProgramStatus
  if (!adminStatuses.includes(status)) throw new HttpError(400, "단계를 확인해 주세요.")
  moveProgram(database, program, status, text(req.body?.reason))
  logAdmin(database, "program-status", { kind: "program", id: program.id }, status)
  await saveDatabase()
  res.json({ program: programView(database, program) })
})

// 후보로 담을 수 있는 단체다. 그 브랜드가 찾을 수 있는 회원 단체만 나온다.
adminProgramsRouter.get("/:id/groups", async (req, res) => {
  await requireAdmin(req)
  const { database, program } = anyProgram(req.params.id)
  res.json({ groups: candidateOptions(database, program, text(req.query.q)) })
})

// 후보 목록을 통째로 바꾼다. 새로 담긴 후보가 있으면 저장한 뒤 브랜드에게 알린다.
adminProgramsRouter.put("/:id/candidates", async (req, res) => {
  await requireAdmin(req)
  const { database, program } = anyProgram(req.params.id)
  const before = new Set((program.candidates ?? []).map((item) => item.groupId))
  const candidates = parseCandidates(database, program, req.body)
  const added = candidates.filter((item) => !before.has(item.groupId)).length
  program.candidates = candidates
  program.updatedAt = new Date().toISOString()
  logAdmin(database, "program-candidates", { kind: "program", id: program.id }, String(candidates.length))
  await saveDatabase()
  if (added > 0) {
    void notify(
      database.accounts.find((account) => account.id === program.accountId),
      "account",
      "캠퍼스 캠페인 후보 학교가 준비됐어요",
      [
        `'${program.brief.name}' 캠페인에 후보 학교 ${added}곳을 담았어요.`,
        "후보를 보고 고른 학교에 제안을 보내 주세요.",
      ],
      `/programs/${program.id}`,
    )
  }
  res.json({ program: programView(database, program) })
})
