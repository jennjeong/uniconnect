import { createListing, findListing } from "./catalog.js"
import { HttpError } from "./errors.js"
import { notify } from "./notices.js"
import type { Account, Database, Match, ShopInvite } from "../types.js"

// A brand account takes an invitation: its listing (made now if it has none
// yet) becomes that shop, so groups nearby see it joined and can send
// proposals. The caller saves, then tells the groups.
export function linkShop(database: Database, account: Account, invite: ShopInvite) {
  const listing = findListing(database, account)
  const holder = database.brands.find((brand) => brand.kakaoPlaceId === invite.placeId)
  if (holder && holder.id !== listing?.id) throw new HttpError(409, "이미 다른 브랜드와 연결된 가게예요.")
  if (listing?.kakaoPlaceId && listing.kakaoPlaceId !== invite.placeId) {
    throw new HttpError(409, "이미 다른 가게와 연결된 브랜드예요.")
  }
  const brand = listing ?? createListing(database, account)
  brand.kakaoPlaceId = invite.placeId
  const now = new Date().toISOString()
  const answered = database.invites.filter((item) => item.placeId === invite.placeId && !item.acceptedAt)
  for (const item of answered) {
    item.acceptedAt = now
    item.brandId = brand.id
  }
  return { brand, answered }
}

// Every group that invited the shop hears about it.
export function tellInviters(database: Database, brand: Match, answered: ShopInvite[]) {
  for (const item of answered) {
    void notify(
      database.accounts.find((other) => other.id === item.accountId),
      "proposals",
      "초대한 가게가 uniconnect에 가입했어요",
      [`${brand.name}에서 초대를 받고 uniconnect에 가입했어요.`, "추천 매칭의 가까운 순에서 바로 협찬을 제안할 수 있어요."],
      `/matches/${encodeURIComponent(brand.id)}`,
    )
  }
}
