import { Router } from "express"

import { browse } from "../lib/catalog.js"
import { parseRole } from "../lib/validation.js"
import { getDatabase } from "../store.js"

export const matchesRouter = Router()

// 반대편 쪽 상위 세 곳의 리스팅이다. 로그인한 사용자는 자기 역할의 매칭을
// 받고, 방문자는 ?role=로 역할을 넘긴다.
matchesRouter.get("/", (req, res) => {
  const role = req.account?.role ?? parseRole(req.query.role)
  const catalog = role === "학생단체" ? "brands" : "groups"
  res.json({ matches: browse(getDatabase(), catalog, req.account).slice(0, 3) })
})
