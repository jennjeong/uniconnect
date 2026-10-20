import { Router } from "express"

import { getDatabase } from "../store.js"

export const brandsRouter = Router()

// Every brand student groups can browse, best match first.
brandsRouter.get("/", (_req, res) => {
  const brands = [...getDatabase().brands].sort((a, b) => b.score - a.score)
  res.json({ brands })
})
