import type { Database, Match } from "../types.js"

// 회원 브랜드의 기본 정보와 태그는 입력이 아니라 한 일로 계산한다: 위치는
// 매장 주소에서, 제공 서비스는 고른 제공 항목에서, 선호 행사는 협찬한
// 행사 종류에서, 평균 응답은 학생 단체의 제안에 답한 속도에서 얻는다.
// 근거가 없는 항목은 뺀다. 예시(어느 계정도 갖지 않은 리스팅)는 시드에
// 적힌 대로 둔다. 팔로워 수는 어느 브랜드에도 보이지 않는다.
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

// "서울 노원구 공릉로 232" → "서울 노원구": 시와 구. 학생 단체가 매장을
// 가늠하는 부분이다.
export function district(address: string | undefined) {
  const words = address?.trim().split(/\s+/) ?? []
  return words.length >= 2 ? words.slice(0, 2).join(" ") : undefined
}

// 브랜드가 협찬했거나 제안을 수락한 행사의 종류. 많은 순.
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

// 학생 단체의 제안부터 브랜드가 답할 때까지 걸린 평균 시간(시간 단위).
// 아직 답한 적이 없으면 undefined.
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
