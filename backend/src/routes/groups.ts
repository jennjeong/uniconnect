import { Router } from "express"

import { applicationsOf, holdApplication, parseDocument } from "../lib/applications.js"
import { browse } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { groupCheckMaxBytes, groupCheckRenewable, groupVerifiedNow } from "../lib/groupCheck.js"
import { createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

export const groupsRouter = Router()

// 브랜드가 둘러볼 수 있는 모든 학생단체를 잘 맞는 순서로, 각 단체의 다음
// 행사와 함께 보여 준다.
groupsRouter.get("/", (req, res) => {
  res.json({ groups: browse(getDatabase(), "groups", req.account) })
})

const checksPerDay = createRateLimit({
  limit: 3,
  windowMs: 24 * 60 * 60 * 1000,
  message: "확인 신청을 너무 많이 보냈어요. 내일 다시 시도해 주세요.",
})

const waitingCheck = (database: Database, account: Account) =>
  applicationsOf(database).some((item) => item.kind === "group" && item.linkAccountId === account.id)

function checkingGroup(account: Account) {
  if (account.role !== "학생단체") throw new HttpError(403, "학생단체만 신청할 수 있어요.")
  return account
}

// 이 단체의 확인 상태다. 서류는 돌려주지 않는다.
groupsRouter.get("/verification", (req, res) => {
  const account = checkingGroup(requireAccount(req))
  const verified = groupVerifiedNow(account)
  res.json({
    status: waitingCheck(getDatabase(), account) ? "waiting" : verified ? "verified" : "none",
    ...(verified ? account.groupVerified : {}),
    renewable: groupCheckRenewable(account),
  })
})

// 대표자의 재학 증명과 단체 소속 증빙을 낸다. 운영자가 /admin의 가입 승인에서
// 확인한다(lib/groupCheck.ts). 서류에 개인정보가 있어 대표만 낸다.
groupsRouter.post("/verification", async (req, res) => {
  const account = checkingGroup(requireAccount(req))
  if (req.memberId) throw new HttpError(403, "계정 대표만 할 수 있어요.")
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 신청할 수 없어요.")
  if (!groupCheckRenewable(account)) throw new HttpError(409, "이미 확인된 단체예요.")
  const assertNotWaiting = () => {
    if (waitingCheck(database, account)) throw new HttpError(409, "이미 서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요.")
  }
  assertNotWaiting()
  const representative = text(req.body?.representative)
  if (!representative || representative.length > 40) throw new HttpError(400, "대표자 이름을 40자 이하로 적어 주세요.")
  const enrollment = parseDocument(req.body?.enrollment, "대표자의 재학 증명 서류를 올려 주세요.")
  const membership = parseDocument(req.body?.membership, "단체 소속을 보여 주는 서류를 올려 주세요.")
  if (enrollment.bytes.length + membership.bytes.length > groupCheckMaxBytes) {
    throw new HttpError(400, "서류 둘을 합쳐 3MB 이하로 올려 주세요.")
  }
  await checksPerDay.take(account.id)
  assertNotWaiting()
  await holdApplication(
    database,
    saveDatabase,
    enrollment,
    { kind: "group", name: account.name, email: account.email, linkAccountId: account.id, representative },
    membership,
  )
  res.status(202).json({ pending: true })
})
