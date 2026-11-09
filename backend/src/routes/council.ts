import { Router } from "express"

import { clubSummary, clubsOf, councilsPerClub, isCouncil, newCouncilCode, sameCode } from "../lib/council.js"
import { HttpError } from "../lib/errors.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account } from "../types.js"

// 총학생회와 거기 속한 동아리다(lib/council.ts). 총학생회가 코드를 공유하면
// 동아리가 내 정보에서 코드로 연결하고, 총학생회의 소속 단체 페이지에서 연결된
// 동아리마다의 요약을 본다. 어느 쪽이든 언제든 연결을 끊을 수 있다.
export const councilRouter = Router()

// 주소별로 틀린 코드를 센다.
const codeFailures = createRateLimit({
  label: "학생회 인증 코드 시도",
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "코드를 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.",
})

function requireCouncil(account: Account) {
  if (!isCouncil(account)) throw new HttpError(403, "학생회 계정만 볼 수 있어요.")
  return account
}

// 동아리가 연결한 총학생회를 이름순으로 보여 준다.
function linksOf(club: Account) {
  const database = getDatabase()
  return (club.councils ?? []).flatMap((link) => {
    const council = database.accounts.find((item) => item.id === link.accountId)
    return council ? [{ id: council.id, name: council.name, type: council.type, school: council.school, linkedAt: link.linkedAt }] : []
  })
}

// 총학생회의 페이지다. 코드와 소속 동아리를 담는다(코드는 처음 열 때 만든다).
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

// 새 코드를 만든다. 기존 코드로는 더 이상 동아리를 연결할 수 없다(이미 연결된
// 곳은 그대로다).
councilRouter.post("/code", async (req, res) => {
  const council = requireCouncil(requireAccount(req))
  council.councilCode = { code: newCouncilCode(), createdAt: new Date().toISOString() }
  await saveDatabase()
  res.json({ code: council.councilCode.code })
})

// 총학생회가 동아리를 자기 페이지에서 뺀다.
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

// 동아리가 코드로 총학생회에 연결한다(총학생회는 최대 셋까지이며, 공유 데모
// 계정과 총학생회 자기 자신은 안 된다).
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

// 동아리가 총학생회와의 연결을 끊는다. 총학생회는 더 이상 그 동아리를 보지 못한다.
councilRouter.delete("/links/:id", async (req, res) => {
  const club = requireAccount(req)
  if (!club.councils?.some((link) => link.accountId === req.params.id)) throw new HttpError(404, "연결된 학생회를 찾을 수 없어요.")
  club.councils = club.councils.filter((link) => link.accountId !== req.params.id)
  await saveDatabase()
  res.json({ councils: linksOf(club) })
})
