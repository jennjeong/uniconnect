import { Router } from "express"

import { getDatabase } from "../store.js"

export const groupsRouter = Router()

// Every student group brands can browse, best match first.
groupsRouter.get("/", (_req, res) => {
  const groups = [...getDatabase().groups].sort((a, b) => b.score - a.score)
  res.json({ groups })
})
