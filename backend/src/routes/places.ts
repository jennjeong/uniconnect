import { Router } from "express"

import { config } from "../config.js"
import { listedTo, viewerFor } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { campusOf } from "../lib/geo.js"
import { exampleNearby, nearbyPlaces, nearestPlaces } from "../lib/places.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { placeCategories } from "../lib/validation.js"
import { getDatabase } from "../store.js"

export const placesRouter = Router()

// 조회할 때마다 Kakao에 다시 묻기 때문에(결과를 보관할 수 없다) 주소마다
// 물을 수 있는 횟수를 제한하고, 묻는 종류마다 센다. 종류를 가끔 골라 보는
// 정도는 한도에 훨씬 못 미친다.
const asksPerClient = createRateLimit({
  label: "주변 가게 검색",
  limit: 30,
  windowMs: 60 * 1000,
  message: "가게 검색이 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// 학생단체 캠퍼스 주변의 실제 매장을 가까운 순으로 Kakao Local에서 바로
// 가져온다. 한 종류만, 또는 모든 종류를 함께("all") 가져온다. 지도 키가
// 없거나 캠퍼스 표에 없는 학교면 결과가 없다. 각 매장에는 보는 단체가 초대한
// 적이 있는지와 어느 브랜드로 합류했는지가 담기고, 캠퍼스에는 약식 지도용
// 좌표가 함께 온다. 방문자에게는 데모 단체의 캠퍼스 주변에 있는 가짜 매장을
// 대신 보여 주며(example: true) Kakao에는 묻지 않는다.
placesRouter.get("/", async (req, res) => {
  const category = String(req.query.category ?? "")
  const kinds = category === "all" ? placeCategories : placeCategories.filter((kind) => kind === category)
  if (kinds.length === 0) throw new HttpError(400, "찾을 가게 종류를 골라 주세요.")
  const viewer = viewerFor(getDatabase(), req.account, "brands")
  const campus =
    viewer && campusOf({ email: viewer.account.email, school: viewer.listing?.school ?? viewer.account.school })
  const key = config.kakaoRestApiKey
  if (!req.account) {
    res.json(
      campus
        ? {
            map: Boolean(key),
            example: true,
            campus: campus.name,
            center: { lat: campus.lat, lng: campus.lng },
            places: exampleNearby(campus, kinds),
          }
        : { map: Boolean(key), example: true, campus: null, places: [] },
    )
    return
  }
  if (!key || !campus) {
    res.json({ map: Boolean(key), campus: campus?.name ?? null, places: [] })
    return
  }
  // 종류마다 Kakao에 한 번씩 묻는다.
  for (const _kind of kinds) await asksPerClient.take(clientKey(req))
  try {
    const found = await Promise.all(kinds.map((kind) => nearbyPlaces(campus, kind, key)))
    const database = getDatabase()
    const invited = new Set(
      req.account?.role === "학생단체"
        ? database.invites.filter((invite) => invite.accountId === req.account!.id).map((invite) => invite.placeId)
        : [],
    )
    const places = nearestPlaces(found.flat()).map((place) => {
      // 매장이 합류한 브랜드로 보이는 것은 그 브랜드를 목록에서 찾을 수 있는
      // 사람에게만이다(멈춘 동안은 보이지 않는다).
      const brand = database.brands.find(
        (item) => item.kakaoPlaceId === place.id && listedTo(database, "brands", item, req.account),
      )
      return {
        ...place,
        ...(invited.has(place.id) ? { invited: true as const } : {}),
        ...(brand ? { brandId: brand.id } : {}),
      }
    })
    res.json({ map: true, campus: campus.name, center: { lat: campus.lat, lng: campus.lng }, places })
  } catch (error) {
    console.error(`[places] Kakao category search: ${(error as Error).message}`)
    throw new HttpError(502, "주변 가게를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
  }
})
