import { Router } from "express"

import { browse } from "../lib/catalog.js"
import { getDatabase } from "../store.js"

export const groupsRouter = Router()

// 브랜드가 둘러볼 수 있는 모든 학생단체를 잘 맞는 순서로, 각 단체의 다음
// 행사와 함께 보여 준다.
groupsRouter.get("/", (req, res) => {
  res.json({ groups: browse(getDatabase(), "groups", req.account) })
})
