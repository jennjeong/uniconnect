import { Router } from "express"

import { browse } from "../lib/catalog.js"
import { getDatabase } from "../store.js"

export const brandsRouter = Router()

// 학생단체가 둘러볼 수 있는 모든 브랜드를 잘 맞는 순서로 보여 준다.
brandsRouter.get("/", (req, res) => {
  res.json({ brands: browse(getDatabase(), "brands", req.account) })
})
