import { industryOf } from "./catalog.js"
import { daysBetween, todayInKorea } from "./dates.js"
import { ownerOf } from "./owners.js"
import type { Account, Database, Industry, Match } from "../types.js"

// 학생 단체의 분야와 브랜드 업종이 얼마나 어울리는지 0부터 1까지로 낸다.
// 콘서트 관객은 커피를 사고, 러닝 동아리는 스포츠웨어를 원한다.
const fit: Partial<Record<Industry, Partial<Record<Industry, number>>>> = {
  performance: { cafe: 1, photo: 0.9, beauty: 0.8, content: 0.7, wellness: 0.6, sports: 0.4, education: 0.4 },
  content: { content: 1, photo: 0.9, cafe: 0.8, beauty: 0.8, wellness: 0.6, sports: 0.5, education: 0.5 },
  sports: { sports: 1, wellness: 0.9, cafe: 0.6, content: 0.6, photo: 0.5, beauty: 0.4, education: 0.3 },
  wellness: { wellness: 1, cafe: 0.7, sports: 0.7, beauty: 0.5, content: 0.5, education: 0.5, photo: 0.4 },
  education: { education: 1, cafe: 0.7, content: 0.6, wellness: 0.5, photo: 0.4, sports: 0.3, beauty: 0.3 },
}

const industryFit = (group: Industry, brand: Industry) =>
  fit[group]?.[brand] ?? (group === brand ? 1 : 0.5)

// 리스팅의 태그와 카테고리 단어. 둘의 공통점을 찾는 데 쓴다.
const words = (listing: Pick<Match, "tags" | "category">) =>
  new Set(
    [...listing.tags, listing.category]
      .flatMap((text) => text.split(/[\s·,]+/))
      .filter((word) => word.length >= 2),
  )

// 이 둘이 이미 함께 협찬한 적이 있는지: 브랜드가 그 단체에 마친 협찬이나
// 어느 쪽이든 수락한 제안.
function workedTogether(database: Database, brand: Match, group: Match) {
  const brandAccount = ownerOf(database, "brands", brand.id)
  const groupAccount = ownerOf(database, "groups", group.id)
  const sponsored = brandAccount
    ? (database.sponsorships[brandAccount.id] ?? []).some((item) => item.groupName === group.name)
    : false
  const request = database.requests.some(
    (item) =>
      item.brandId === brand.id &&
      item.status === "수락" &&
      (item.groupName === group.name || (groupAccount && item.fromAccountId === groupAccount.id)),
  )
  const offer = database.offers.some(
    (item) =>
      item.groupId === group.id &&
      item.status === "수락" &&
      (item.brandId === brand.id || (brandAccount && item.fromAccountId === brandAccount.id)),
  )
  return sponsored || request || offer
}


export type Viewer = { account: Account; listing?: Match }

// 보는 쪽을 리스팅으로 바꾼 것: 자기 리스팅이거나, 아직 쓰지 않았으면 계정
// 유형으로 만든 가상의 것.
function viewerListing({ account, listing }: Viewer): Match {
  if (listing) return listing
  return {
    id: "",
    name: account.name,
    category: account.type,
    industry: industryOf(account),
    offer: "",
    score: 0,
    tags: [],
  }
}

// 보는 사람 기준으로 한 상대의 매칭 점수(55~98), 가장 크게 작용한 이유,
// 각 항목이 가장 높은 값에 대한 비율(0~1, 상세 페이지의 막대). 가중치:
// 업종 적합 35, 공통 태그 15, 실적 20, 함께 협찬한 경험 15, 답할 준비 15.
export function scoreMatch(database: Database, viewer: Viewer, partner: Match, maxPopularity: number) {
  const mine = viewerListing(viewer)
  const students = viewer.account.role === "학생단체"
  const [group, brand] = students ? [mine, partner] : [partner, mine]
  const partnerHasAccount = database.accounts.some((account) =>
    students ? account.brandId === partner.id : account.groupId === partner.id,
  )

  const shared = [...words(mine)].filter((word) => words(partner).has(word)).length
  const record = students
    ? (partner.popularity ?? 0) / Math.max(1, maxPopularity)
    : Math.min(1, Math.log10(Math.max(1, partner.audience ?? 0)) / Math.log10(5000))
  const days = partner.eventDate ? daysBetween(todayInKorea(), partner.eventDate) : undefined
  const ready = students
    ? [partner.intro, partner.sns?.length, partner.portfolio?.length].filter(Boolean).length / 3
    : days === undefined || days < 0
      ? 0
      : days <= 45
        ? 1
        : 0.5
  const together = mine.id ? workedTogether(database, brand, group) : false

  const parts = [
    { weight: 35, value: industryFit(group.industry, brand.industry), label: "업종 궁합", reason: "업종 궁합이 좋아요" },
    { weight: 15, value: Math.min(1, shared / 2), label: "관심사", reason: "관심사가 겹쳐요" },
    {
      weight: 20,
      value: record,
      label: students ? "협찬 경험" : "행사 규모",
      reason: students ? "협찬 경험이 많아요" : "행사 규모가 커요",
    },
    { weight: 15, value: together ? 1 : 0, label: "함께한 이력", reason: "함께한 협찬이 있어요" },
    {
      weight: 15,
      value: 0.5 * ready + 0.5 * (partnerHasAccount ? 1 : 0),
      label: students ? "응답 준비" : "가까운 행사",
      reason: students ? "제안에 바로 답할 수 있어요" : "가까운 행사가 있어요",
    },
  ]
  const total = parts.reduce((sum, part) => sum + part.weight * part.value, 0) / 100
  // 함께 협찬한 경험이 가장 큰 의미라서 해당하면 맨 앞에 둔다.
  const rank = (part: (typeof parts)[number]) => (part.reason === "함께한 협찬이 있어요" ? 100 : part.weight * part.value)
  const reasons = parts
    .filter((part) => part.value >= 0.7)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 2)
    .map((part) => part.reason)
  const scoreParts = parts.map((part) => ({ label: part.label, value: Math.round(part.value * 100) / 100 }))
  return { score: Math.round(55 + 43 * total), reasons, scoreParts }
}
