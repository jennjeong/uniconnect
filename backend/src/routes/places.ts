import { Router } from "express"

import { config } from "../config.js"
import { viewerFor } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { campusOf } from "../lib/geo.js"
import { nearbyPlaces, nearestPlaces } from "../lib/places.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { placeCategories } from "../lib/validation.js"
import { getDatabase } from "../store.js"

export const placesRouter = Router()

// Every look asks Kakao again (its results can't be kept), so each address
// may ask only so often, counted per kind asked; picking kinds now and then
// stays well under it.
const asksPerClient = createRateLimit({
  limit: 30,
  windowMs: 60 * 1000,
  message: "가게 검색이 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// Real shops around the student group's campus (the demo group's for
// visitors), nearest first, straight from Kakao Local: of one kind, or of
// every kind together ("all"). Without the map key, or for a school not in
// the campus table, there are none. Each shop says whether the group looking
// invited it and which brand it joined as; the campus comes with its point
// for the schematic map.
placesRouter.get("/", async (req, res) => {
  const category = String(req.query.category ?? "")
  const kinds = category === "all" ? placeCategories : placeCategories.filter((kind) => kind === category)
  if (kinds.length === 0) throw new HttpError(400, "찾을 가게 종류를 골라 주세요.")
  const viewer = viewerFor(getDatabase(), req.account, "brands")
  const campus =
    viewer && campusOf({ email: viewer.account.email, school: viewer.listing?.school ?? viewer.account.school })
  const key = config.kakaoRestApiKey
  if (!key || !campus) {
    res.json({ map: Boolean(key), campus: campus?.name ?? null, places: [] })
    return
  }
  // Each kind is one question to Kakao.
  kinds.forEach(() => asksPerClient.take(clientKey(req)))
  try {
    const found = await Promise.all(kinds.map((kind) => nearbyPlaces(campus, kind, key)))
    const database = getDatabase()
    const invited = new Set(
      req.account?.role === "학생단체"
        ? database.invites.filter((invite) => invite.accountId === req.account!.id).map((invite) => invite.placeId)
        : [],
    )
    const places = nearestPlaces(found.flat()).map((place) => {
      const brand = database.brands.find((item) => item.kakaoPlaceId === place.id)
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
