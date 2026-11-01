import { Router } from "express"

import { config } from "../config.js"
import { countSearch, searchTerm, siteState } from "../lib/adminTools.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { publicCounts } from "../lib/stats.js"
import { getDatabase, saveDatabase } from "../store.js"

export const siteRouter = Router()

// What the whole site needs from the operators' switches: maintenance,
// whether sign-up is open, and the help center questions they added or hid;
// with the members' counts the dashboards show.
siteRouter.get("/", (_req, res) => {
  const database = getDatabase()
  res.json({
    ...siteState(database),
    faq: database.faq ?? { added: [], hidden: [] },
    counts: publicCounts(database),
    ...(config.kakaoMapKey ? { maps: { kakao: config.kakaoMapKey } } : {}),
  })
})

const searches = createRateLimit({
  limit: 60,
  windowMs: 15 * 60 * 1000,
  message: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
})

// A word searched in a catalog, counted without who searched it. Too
// short or long a search is let go quietly.
siteRouter.post("/searches", async (req, res) => {
  await searches.take(clientKey(req))
  const term = searchTerm(req.body?.q)
  if (term) {
    countSearch(getDatabase(), term)
    await saveDatabase()
  }
  res.status(204).end()
})
