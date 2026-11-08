import { Router } from "express"

import { browse } from "../lib/catalog.js"
import { parseRole } from "../lib/validation.js"
import { getDatabase } from "../store.js"

export const matchesRouter = Router()

// 반대편 쪽 상위 세 곳의 리스팅이다. 로그인한 사용자는 자기 역할의 매칭을
// 받고, 방문자는 ?role=로 역할을 넘긴다. 추천 지수가 높아도 필수 조건이 어긋난
// 상대는 추천하지 않는다: 브랜드에게는 다가오는 행사가 없는 단체(제안할 행사가
// 없다)를 빼고, 목록(단체 찾기)에서는 그대로 보인다.
matchesRouter.get("/", (req, res) => {
  const role = req.account?.role ?? parseRole(req.query.role)
  const catalog = role === "학생단체" ? "brands" : "groups"
  const listed = browse(getDatabase(), catalog, req.account)
  const proposable = catalog === "groups" ? listed.filter((group) => "eventDate" in group && group.eventDate) : listed
  res.json({ matches: proposable.slice(0, 3) })
})
