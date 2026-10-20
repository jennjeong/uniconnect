import { Router } from "express"

import { browse } from "../lib/catalog.js"
import { getDatabase } from "../store.js"

export const brandsRouter = Router()

// Every brand student groups can browse, best match first.
brandsRouter.get("/", (_req, res) => {
  res.json({ brands: browse(getDatabase(), "brands") })
})
