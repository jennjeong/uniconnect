import { Router } from "express"

import { browse } from "../lib/catalog.js"
import { getDatabase } from "../store.js"

export const groupsRouter = Router()

// Every student group brands can browse, best match first, each with its
// next event.
groupsRouter.get("/", (_req, res) => {
  res.json({ groups: browse(getDatabase(), "groups") })
})
