import { Router } from "express"

import { parseRole } from "../lib/validation.js"
import { getDatabase } from "../store.js"

export const matchesRouter = Router()

// Logged-in users get matches for their own role; visitors pass ?role=.
matchesRouter.get("/", (req, res) => {
  const role = req.account?.role ?? parseRole(req.query.role)
  res.json({ matches: getDatabase().matches[role] })
})
