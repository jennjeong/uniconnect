import { Router } from "express"

import { browse } from "../lib/catalog.js"
import { parseRole } from "../lib/validation.js"
import { getDatabase } from "../store.js"

export const matchesRouter = Router()

// The other side's top three listings. Logged-in users get matches for their
// own role; visitors pass ?role=.
matchesRouter.get("/", (req, res) => {
  const role = req.account?.role ?? parseRole(req.query.role)
  const catalog = role === "학생단체" ? "brands" : "groups"
  res.json({ matches: browse(getDatabase(), catalog).slice(0, 3) })
})
