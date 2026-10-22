import { brandIndustries, groupIndustries } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import type { Account, Database, Industry, Match } from "../types.js"

// How well a student group's field and a brand's industry go together, from
// 0 to 1: a concert crowd buys coffee, a running club wants sportswear.
const fit: Partial<Record<Industry, Partial<Record<Industry, number>>>> = {
  performance: { cafe: 1, photo: 0.9, beauty: 0.8, content: 0.7, wellness: 0.6, sports: 0.4, education: 0.4 },
  content: { content: 1, photo: 0.9, cafe: 0.8, beauty: 0.8, wellness: 0.6, sports: 0.5, education: 0.5 },
  sports: { sports: 1, wellness: 0.9, cafe: 0.6, content: 0.6, photo: 0.5, beauty: 0.4, education: 0.3 },
  wellness: { wellness: 1, cafe: 0.7, sports: 0.7, beauty: 0.5, content: 0.5, education: 0.5, photo: 0.4 },
  education: { education: 1, cafe: 0.7, content: 0.6, wellness: 0.5, photo: 0.4, sports: 0.3, beauty: 0.3 },
}

const industryFit = (group: Industry, brand: Industry) =>
  fit[group]?.[brand] ?? (group === brand ? 1 : 0.5)

// Words of a listing's tags and category, for finding what two have in common.
const words = (listing: Pick<Match, "tags" | "category">) =>
  new Set(
    [...listing.tags, listing.category]
      .flatMap((text) => text.split(/[\s·,]+/))
      .filter((word) => word.length >= 2),
  )

// Have these two already sponsored together? A brand's finished sponsorship
// of the group, or a proposal either side accepted.
function workedTogether(database: Database, brand: Match, group: Match) {
  const brandAccount = database.accounts.find((account) => account.brandId === brand.id)
  const groupAccount = database.accounts.find((account) => account.groupId === group.id)
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

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export type Viewer = { account: Account; listing?: Match }

// The viewer's side as a listing: its own, or one made up from the
// account's type before it has written one.
function viewerListing({ account, listing }: Viewer): Match {
  if (listing) return listing
  const students = account.role === "학생단체"
  return {
    id: "",
    name: account.name,
    category: account.type,
    industry: (students ? groupIndustries : brandIndustries)[account.type] ?? (students ? "performance" : "cafe"),
    offer: "",
    score: 0,
    tags: [],
  }
}

// One partner's match for the viewer, 55 to 98, with the reasons that
// count most. Weights: industry fit 35, shared tags 15, track record 20,
// sponsored together before 15, ready to answer 15.
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
    { weight: 35, value: industryFit(group.industry, brand.industry), reason: "업종 궁합이 좋아요" },
    { weight: 15, value: Math.min(1, shared / 2), reason: "관심사가 겹쳐요" },
    { weight: 20, value: record, reason: students ? "협찬 경험이 많아요" : "행사 규모가 커요" },
    { weight: 15, value: together ? 1 : 0, reason: "함께한 협찬이 있어요" },
    {
      weight: 15,
      value: 0.5 * ready + 0.5 * (partnerHasAccount ? 1 : 0),
      reason: students ? "제안에 바로 답할 수 있어요" : "가까운 행사가 있어요",
    },
  ]
  const total = parts.reduce((sum, part) => sum + part.weight * part.value, 0) / 100
  // Having sponsored together says the most, so it leads when it applies.
  const rank = (part: (typeof parts)[number]) => (part.reason === "함께한 협찬이 있어요" ? 100 : part.weight * part.value)
  const reasons = parts
    .filter((part) => part.value >= 0.7)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 2)
    .map((part) => part.reason)
  return { score: Math.round(55 + 43 * total), reasons }
}
