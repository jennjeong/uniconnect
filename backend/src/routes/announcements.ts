import { Router } from "express"

import { liveAnnouncements } from "../lib/adminTools.js"
import { getDatabase } from "../store.js"

export const announcementsRouter = Router()

// The operators' notices this viewer sees, shown across the top of the site.
announcementsRouter.get("/", (req, res) => {
  res.json({ announcements: liveAnnouncements(getDatabase(), req.account) })
})
