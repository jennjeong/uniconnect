import type { Database, Match } from "../types.js"

// A member brand's 기본 정보 and tags, worked out from what it has done
// rather than typed: 위치 from its store address, 제공 서비스 from the offers
// it picked, 선호 행사 from the kinds of events it sponsored, 평균 응답 from
// how fast it answered student groups' proposals. Facts with nothing to go
// on are left out. The examples (listings no account owns) keep what the
// seed wrote. No brand shows follower counts.
export function brandProfile(database: Database, stored: Match): Match {
  const listing = stored.sns ? { ...stored, sns: stored.sns.map(({ followers, ...row }) => row) } : stored
  const owner = database.accounts.find((account) => account.brandId === listing.id)
  if (!owner) return listing
  const place = district(listing.location?.address)
  const offers = (listing.offers ?? []).map((item) => item.kind)
  const kinds = sponsoredKinds(database, owner.id, listing.id)
  const answerHours = averageAnswerHours(database, listing.id)
  const sponsored = database.sponsorships[owner.id]?.length ?? 0
  const facts = [
    { label: "위치", value: place ?? "" },
    { label: "제공 서비스", value: offers.join(" · ") },
    { label: "선호 행사", value: kinds.slice(0, 3).join(" · ") },
    { label: "평균 응답", value: answerHours === undefined ? "" : answerLabel(answerHours) },
  ].filter((fact) => fact.value)
  const tags = [
    sponsored > 0 ? `협찬 ${sponsored}회` : "",
    answerHours !== undefined && answerHours <= 24 ? "응답 빠름" : "",
    kinds[0] ? `${kinds[0]} 선호` : "",
    place?.split(" ").at(-1) ?? "",
    offers[0] ?? "",
  ]
    .filter((tag) => tag && tag.length <= 12)
    .slice(0, 4)
  return { ...listing, facts, tags }
}

// "서울 노원구 공릉로 232" → "서울 노원구": the city and district, the part a
// student group places a store by.
export function district(address: string | undefined) {
  const words = address?.trim().split(/\s+/) ?? []
  return words.length >= 2 ? words.slice(0, 2).join(" ") : undefined
}

// The kinds of the events the brand sponsored or accepted a proposal about,
// most often first.
function sponsoredKinds(database: Database, ownerId: string, brandId: string) {
  const eventIds = new Set([
    ...(database.sponsorships[ownerId] ?? []).flatMap((item) => (item.eventId ? [item.eventId] : [])),
    ...database.requests
      .filter((request) => request.brandId === brandId && request.status === "수락" && request.eventId)
      .map((request) => request.eventId!),
  ])
  const counts = new Map<string, number>()
  for (const events of Object.values(database.events)) {
    for (const event of events) {
      if (eventIds.has(event.id) && event.kind) counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([kind]) => kind)
}

// Hours from a group's proposal to the brand's answer, on average; undefined
// before it has answered any.
function averageAnswerHours(database: Database, brandId: string) {
  const hours = database.requests
    .filter((request) => request.brandId === brandId && request.respondedAt)
    .map((request) => (Date.parse(request.respondedAt!) - Date.parse(request.createdAt)) / 3_600_000)
    .filter((value) => Number.isFinite(value) && value >= 0)
  return hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : undefined
}

export function answerLabel(hours: number) {
  if (hours <= 1) return "1시간 이내"
  if (hours < 24) return `${Math.ceil(hours)}시간 이내`
  return `${Math.ceil(hours / 24)}일 이내`
}
