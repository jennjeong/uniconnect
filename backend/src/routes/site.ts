import { Router } from "express"

import { config } from "../config.js"
import { countSearch, searchTerm, siteState } from "../lib/adminTools.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { publicCounts } from "../lib/stats.js"
import { getDatabase, saveDatabase } from "../store.js"

export const siteRouter = Router()

// 운영자의 스위치로 사이트 전체가 알아야 할 것들이다. 점검 중인지, 가입이
// 열려 있는지, 운영자가 추가하거나 숨긴 도움말 센터 질문, 그리고 대시보드가
// 보여 주는 회원 수를 담는다.
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
  label: "카탈로그 검색어 집계",
  limit: 60,
  windowMs: 15 * 60 * 1000,
  message: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
})

// 카탈로그에서 검색된 단어를 누가 검색했는지는 빼고 센다. 너무 짧거나 긴
// 검색어는 조용히 넘긴다.
siteRouter.post("/searches", async (req, res) => {
  await searches.take(clientKey(req))
  const term = searchTerm(req.body?.q)
  if (term) {
    countSearch(getDatabase(), term)
    await saveDatabase()
  }
  res.status(204).end()
})
