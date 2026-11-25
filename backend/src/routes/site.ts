import { Router } from "express"

import { config } from "../config.js"
import { countSearch, searchSource, searchTerm, siteState } from "../lib/adminTools.js"
import { recordExperiment, runningExperiments } from "../lib/experiments.js"
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
    experiments: runningExperiments(database),
    ...(config.kakaoMapKey ? { maps: { kakao: config.kakaoMapKey } } : {}),
  })
})

const searches = createRateLimit({
  label: "카탈로그 검색어 집계",
  limit: 60,
  windowMs: 15 * 60 * 1000,
  message: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
})

// 카탈로그에서 검색된 단어를 누가 검색했는지는 빼고 센다. 방문자, 데모 계정, 회원 중
// 어디서 왔는지만 나눈다(콘솔이 범위를 고른다). 너무 짧거나 긴 검색어는 조용히 넘긴다.
siteRouter.post("/searches", async (req, res) => {
  await searches.take(clientKey(req))
  const term = searchTerm(req.body?.q)
  if (term) {
    const database = getDatabase()
    countSearch(database, term, searchSource(database, req.account))
    await saveDatabase()
  }
  res.status(204).end()
})

const experimentHits = createRateLimit({
  label: "A/B 테스트 집계",
  limit: 60,
  windowMs: 15 * 60 * 1000,
  message: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
})

// A/B 테스트의 노출과 전환을 횟수로만 센다(lib/experiments.ts). 누가 보냈는지는 남기지
// 않는다. 꺼진 실험이나 없는 갈래는 조용히 넘긴다.
siteRouter.post("/experiments", async (req, res) => {
  await experimentHits.take(clientKey(req))
  const database = getDatabase()
  const counted = await recordExperiment(database, req.body?.key, req.body?.variant, req.body?.event, req.body?.run)
  if (counted === "document") await saveDatabase()
  res.status(204).end()
})
