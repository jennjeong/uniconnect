import { Router } from "express"

import { clubSummary, clubsOf, councilsPerClub, isCouncil, newCouncilCode, sameCode } from "../lib/council.js"
import { HttpError } from "../lib/errors.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account } from "../types.js"

// A student council and the clubs that belong to it (lib/council.ts): the
// council shares a code, a club links with it from 내 정보, and the council's
// 소속 단체 page reads each linked club's summary. Either side unlinks at
// any time.
export const councilRouter = Router()

// Wrong codes, per address.
const codeFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "코드를 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.",
})

function requireCouncil(account: Account) {
  if (!isCouncil(account)) throw new HttpError(403, "학생회 계정만 볼 수 있어요.")
  return account
}

// The councils a club linked to, by name.
function linksOf(club: Account) {
  const database = getDatabase()
  return (club.councils ?? []).flatMap((link) => {
    const council = database.accounts.find((item) => item.id === link.accountId)
    return council ? [{ id: council.id, name: council.name, type: council.type, school: council.school, linkedAt: link.linkedAt }] : []
  })
}

// The council's page: its code and its clubs (the code is made the first time).
councilRouter.get("/clubs", async (req, res) => {
  const council = requireCouncil(requireAccount(req))
  const database = getDatabase()
  if (!council.councilCode) {
    council.councilCode = { code: newCouncilCode(), createdAt: new Date().toISOString() }
    await saveDatabase()
  }
  res.json({
    code: council.councilCode.code,
    clubs: clubsOf(database, council)
      .map((club) => clubSummary(database, club, council))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  })
})

// A new code; the old one links no more clubs (those linked stay).
councilRouter.post("/code", async (req, res) => {
  const council = requireCouncil(requireAccount(req))
  council.councilCode = { code: newCouncilCode(), createdAt: new Date().toISOString() }
  await saveDatabase()
  res.json({ code: council.councilCode.code })
})

// The council takes a club off its page.
councilRouter.delete("/clubs/:id", async (req, res) => {
  const council = requireCouncil(requireAccount(req))
  const club = clubsOf(getDatabase(), council).find((item) => item.id === req.params.id)
  if (!club) throw new HttpError(404, "연결된 단체를 찾을 수 없어요.")
  club.councils = club.councils!.filter((link) => link.accountId !== council.id)
  await saveDatabase()
  res.status(204).end()
})

// A club's councils, for 내 정보.
councilRouter.get("/links", (req, res) => {
  res.json({ councils: linksOf(requireAccount(req)) })
})

// A club links to a council with its code (three councils at most; not the
// shared demo accounts, nor a council to itself).
councilRouter.post("/links", async (req, res) => {
  const club = requireAccount(req)
  const database = getDatabase()
  if (club.role !== "학생단체") throw new HttpError(403, "학생단체만 학생회에 연결할 수 있어요.")
  if (isDemoAccount(database, club)) throw new HttpError(403, "데모 계정은 학생회에 연결할 수 없어요.")
  await codeFailures.check(clientKey(req))
  const code = text(req.body?.code)
  const council = code ? database.accounts.find((item) => item.councilCode && sameCode(item.councilCode.code, code)) : undefined
  if (!council || !isCouncil(council)) {
    await codeFailures.hit(clientKey(req))
    throw new HttpError(400, "학생회 코드가 맞지 않아요. 학생회에 다시 확인해 주세요.")
  }
  if (council.id === club.id) throw new HttpError(400, "우리 학생회의 코드예요. 소속 단체가 이 코드를 입력해요.")
  if (club.councils?.some((link) => link.accountId === council.id)) throw new HttpError(409, "이미 연결한 학생회예요.")
  if ((club.councils?.length ?? 0) >= councilsPerClub) throw new HttpError(409, `학생회는 ${councilsPerClub}곳까지 연결할 수 있어요.`)
  club.councils = [...(club.councils ?? []), { accountId: council.id, linkedAt: new Date().toISOString() }]
  await saveDatabase()
  res.status(201).json({ councils: linksOf(club) })
})

// A club unlinks from a council; the council no longer sees it.
councilRouter.delete("/links/:id", async (req, res) => {
  const club = requireAccount(req)
  if (!club.councils?.some((link) => link.accountId === req.params.id)) throw new HttpError(404, "연결된 학생회를 찾을 수 없어요.")
  club.councils = club.councils.filter((link) => link.accountId !== req.params.id)
  await saveDatabase()
  res.json({ councils: linksOf(club) })
})
