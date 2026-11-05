import {
  createSeed,
  demoContacts,
  museConcertPage,
  seedBrands,
  seedConversations,
  seedReviews,
  seedSurvey,
  seedGroups,
  seedMeasurements,
  seedOffers,
  seedPosts,
  freshenDemoReport,
  freshenExamplePosts,
  seedRequests,
  seedSponsorships,
} from "./data/seed.js"
import { acceptedProposal, agreementShare } from "./lib/agreements.js"
import { toIsoDate } from "./lib/dates.js"
import { HttpError } from "./lib/errors.js"
import { emptyMetrics, newStaffPin, prunePasses, syncSponsors, upgradePins } from "./lib/measurements.js"
import { upgradeMethods } from "./lib/methods.js"
import { currentStorage, StaleWrite } from "./lib/storage.js"
import { renamedAccountTypes } from "./lib/validation.js"
import { hashToken } from "./middleware/session.js"
import type { Database, Metrics, MetricEntry, Report } from "./types.js"

// PR #283 이전에 시드된 데모 문장과 지금 읽히는 문장이다.
const demoCopy: Record<string, string> = {
  "반가워요! 현장 배부도 좋고, QR로 받는 디지털 쿠폰이면 매장 방문까지 집계돼서 더 좋아요. 예상 관객은 몇 명인가요?":
    "반가워요! 현장 배부도 좋고 QR로 받는 디지털 쿠폰이면 매장 방문까지 집계돼서 더 좋아요. 예상 관객은 몇 명인가요?",
  "버스킹 날 커피를 제때 보내 주셨고, 쿠폰을 들고 간 관객도 친절하게 맞아 주셨어요.":
    "버스킹 날 커피를 제때 보내 주셨고 쿠폰을 들고 간 관객도 친절하게 맞아 주셨어요.",
  "종강 공연 관객에게 립밤 샘플을 나눠 드리고, 공연장 앞에 체험 부스를 열고 싶어요.":
    "종강 공연 관객에게 립밤 샘플을 나눠 드리고 공연장 앞에 체험 부스를 열고 싶어요.",
  [museConcertPage.intro.replace("무대에 서고 ", "무대에 서고, ")]: museConcertPage.intro,
}

export { backupFolder, backups } from "./lib/storage.js"

// 데이터는 문서 하나로 메모리에 있다. 라우트는 getDatabase/saveDatabase로만
// 건드리며, saveDatabase가 데이터가 보관되는 곳(lib/storage.ts)에 쓴다. 한
// 대의 기계에서는 JSON 파일에, Vercel에서는 Postgres에 쓴다.
let database: Database | undefined
let pendingWrite = Promise.resolve()
// 쓰기가 실패하면 돌아갈 마지막으로 쓴 데이터와, 쓰기가 일어나거나 데이터를
// 새로 읽을 때마다 올라가는 횟수다.
let durable = ""
let generation = 0
// 이 복사본이 마지막으로 읽거나 쓴 저장 버전과, 다른 복사본의 쓰기를 마지막으로
// 살핀 시각이다.
let version = 0
let checkedAt = 0

// 공유 저장소를 쓰는 API 복사본이 다른 복사본의 쓰기를 살피는 주기다.
export const freshness = { everyMs: 2000 }

export async function loadDatabase() {
  if (await reload()) {
    // 복사본 하나가 저장하면 다른 복사본은 먼저 저장된 값을 읽는다.
    if (upgradePins(getDatabase())) await saveDatabase().catch(reload)
    return getDatabase()
  }
  const seed = await createSeed()
  for (const measurement of seed.measurements) syncSponsors(seed, measurement)
  freshenDemoReport(seed)
  replace(seed)
  durable = JSON.stringify(seed)
  version = 0
  try {
    await saveDatabase()
  } catch (error) {
    // API의 다른 복사본이 먼저 데이터베이스를 시드했으므로 그 데이터가 우선한다.
    if (!(await reload())) throw error
  }
  return getDatabase()
}

// 메모리에 있는 것 대신 데이터를 같은 객체 안에 넣는다. 데이터베이스를 쥐고
// 있는 코드에도 그것이 보이게 하기 위해서다.
function replace(next: Database) {
  if (!database) {
    database = next
    return
  }
  const current = database as unknown as Record<string, unknown>
  for (const key of Object.keys(current)) delete current[key]
  Object.assign(current, next)
}

// 저장된 데이터를 다시 읽는다(새로 시작할 때처럼 업그레이드한다). 아직 저장된
// 것이 없으면 false다. 그 전에 대기시킨 쓰기는 바뀐 데이터가 방금 대체한 것에
// 대한 변경이므로 거절한다.
async function reload() {
  const stored = await currentStorage().read()
  if (!stored) return false
  replace(upgradeDatabase(JSON.parse(stored.data) as Database))
  durable = JSON.stringify(getDatabase())
  version = stored.version
  generation += 1
  return true
}

// API의 다른 복사본(Vercel은 바쁘면 둘 이상 띄운다)이 이 복사본이 마지막으로
// 읽거나 쓴 뒤에 저장했을 수 있다. 공유 저장소에서는 요청마다 먼저 저장된
// 버전을 살피되 freshness.everyMs마다 한 번만 살피고, 버전이 달라졌으면 이
// 복사본이 대기시킨 쓰기가 끝난 뒤 데이터를 다시 읽는다. 데이터베이스에 닿지
// 않으면 데이터를 그대로 둔다.
export async function refreshDatabase() {
  const storage = currentStorage()
  if (!storage.shared || !database || Date.now() - checkedAt < freshness.everyMs) return
  checkedAt = Date.now()
  try {
    await pendingWrite
    const latest = await storage.version()
    if (latest !== undefined && latest !== version) await reload()
  } catch (error) {
    console.error(`[store] ${(error as Error).message}`)
  }
}

const notSaved = "저장하지 못해서 방금 한 작업을 되돌렸어요. 잠시 후 다시 시도해 주세요."

// db.json을 만든 뒤에 추가된 데이터를 채워, 업데이트해도 기존 계정, 세션,
// 행사가 살아남게 한다.
export function upgradeDatabase(stored: Database) {
  // 버전 2 이전에는 아무도 카탈로그를 고칠 수 없었고 시작할 때마다 시드로
  // 새로 채웠으므로, 오래된 파일은 현재 시드를 한 번 받는다(SNS와 포트폴리오
  // 포함). 그 뒤로는 내 정보에서 한 수정이 유지된다.
  if ((stored.catalogVersion ?? 1) < 2) {
    stored.brands = structuredClone(seedBrands)
    stored.groups = structuredClone(seedGroups)
    stored.catalogVersion = 2
  }
  // 버전 3은 캠퍼스까지의 거리를 위해 시드된 브랜드에 데모 매장 위치를 한 번
  // 주었다. 주소를 지운 브랜드는 지운 채로 둔다.
  if ((stored.catalogVersion ?? 1) < 3) {
    for (const brand of stored.brands) {
      const seeded = seedBrands.find((item) => item.id === brand.id)
      if (seeded?.location && !brand.location) brand.location = { ...seeded.location }
    }
    stored.catalogVersion = 3
  }
  // 버전 4는 보관할 수 없는 Kakao 주소 검색의 좌표를 버린다. 주소는 남고, 다음에
  // 저장할 때 OpenStreetMap으로 다시 위치를 잡는다. 데모 매장은 Kakao에서 온
  // 적이 없으므로 좌표를 그대로 둔다.
  if ((stored.catalogVersion ?? 1) < 4) {
    for (const brand of stored.brands) {
      const seeded = seedBrands.find((item) => item.id === brand.id)?.location
      const location = brand.location
      if (location?.lat === undefined) continue
      if (seeded && seeded.lat === location.lat && seeded.lng === location.lng) continue
      brand.location = { address: location.address }
    }
    stored.catalogVersion = 4
  }
  // 추천 매칭은 이제 카탈로그에서 계산한다.
  delete (stored as { matches?: unknown }).matches
  stored.conversations ??= seedConversations()
  stored.inquiries ??= []
  stored.invites ??= []
  stored.agreements ??= []
  stored.reports ??= []
  stored.blocks ??= {}
  stored.saved ??= {}
  // 오래된 데이터에는 이름이 붙은 데모 계정이 아직 없을 수 있다.
  stored.posts ??= seedPosts(stored.demoAccountIds ?? {})
  freshenExamplePosts(stored)
  stored.reviews ??= seedReviews()
  // 설문이 생기기 전에 만든 데이터를 위한 데모 버스킹 날의 설문이다.
  const surveyed = stored.measurements?.find((item) => item.eventId === "event-busking-day")
  if (surveyed) surveyed.survey ??= seedSurvey()
  if (stored.measurements && stored.sponsorships && stored.agreements && stored.demoAccountIds) {
    freshenDemoReport(stored as Parameters<typeof freshenDemoReport>[0])
  }
  // 평문 토큰으로 저장된 세션은 해시로 바꿔 저장해 계속 쓰이게 한다.
  stored.sessions = (stored.sessions ?? []).map((session) => {
    const legacy = session as typeof session & { token?: string }
    if (!legacy.token) return session
    const { token, ...rest } = legacy
    return { ...rest, tokenHash: hashToken(token) }
  })
  const demoStudent = stored.accounts?.find(
    (account) => account.id === stored.demoAccountIds?.학생단체,
  )
  if (demoStudent) demoStudent.groupId ??= "syu-muse"
  // 목록이 늘기 전의 계정 유형은 새 이름을 받는다. 계정과, 유형의 이름을 딴
  // 리스팅에 적용한다.
  for (const account of stored.accounts ?? []) {
    const renamed = renamedAccountTypes[account.type]
    if (!renamed) continue
    const listingId = account.groupId ?? account.brandId
    const listing = (account.role === "학생단체" ? stored.groups : stored.brands)?.find((item) => item.id === listingId)
    if (listing?.category === account.type) listing.category = renamed
    account.type = renamed
  }
  if (demoStudent) demoStudent.contact ??= demoContacts.학생단체
  // 측정은 버스킹 날 하나의 전역 집합이었는데, 그 행사 자신의 측정으로 옮기며
  // 지금까지의 집계와 기록을 유지한다.
  if (!stored.measurements) {
    const legacy = stored as Database & { metrics?: Metrics; metricLog?: MetricEntry[]; report?: Report }
    stored.measurements = demoStudent ? seedMeasurements(demoStudent.id) : []
    const busking = stored.measurements[0]
    if (busking && legacy.metrics) busking.metrics = legacy.metrics
    if (busking && legacy.metricLog) busking.log = legacy.metricLog
    delete legacy.metrics
    delete legacy.metricLog
    delete legacy.report
  }
  stored.requests ??= seedRequests()
  stored.offers ??= seedOffers()
  const demoBrandId = stored.demoAccountIds?.브랜드
  stored.sponsorships ??= demoBrandId ? { [demoBrandId]: seedSponsorships() } : {}
  const demoBrand = stored.accounts?.find((account) => account.id === demoBrandId)
  if (demoBrand) demoBrand.brandId ??= "afternoon-coffee"
  if (demoBrand) demoBrand.contact ??= demoContacts.브랜드
  // 목표가 생기기 전에 저장된 협찬은 시드된 목표를 받고, 다른 협찬은 손익분기를
  // 받는다.
  const seededGoals = new Map(seedSponsorships().map((item) => [item.id, item.targetRoas]))
  for (const list of Object.values(stored.sponsorships)) {
    for (const sponsorship of list) {
      sponsorship.targetRoas ??= seededGoals.get(sponsorship.id) ?? 100
    }
  }
  // 데모 브랜드의 시드 캠페인에 예산이 생겼다.
  const tasting = demoBrandId
    ? stored.events?.[demoBrandId]?.find((event) => event.id === "event-coffee-tasting")
    : undefined
  if (tasting) tasting.budget ??= 800000
  // 브랜드는 이제 제안을 직접 고른다. 데모 브랜드의 제안은 시드된 것이다.
  // 평범한 종류로 저장된 제안은 행이 된다.
  const demoListing = stored.brands?.find((brand) => brand.id === "afternoon-coffee")
  if (demoListing) demoListing.offers ??= seedBrands[0].offers
  for (const brand of stored.brands ?? []) {
    if (brand.offers) brand.offers = brand.offers.map((item) => (typeof item === "string" ? { kind: item } : item))
  }
  // 데모 단체의 콘서트에 행사 페이지가 생겼다.
  const demoGroupId = stored.demoAccountIds?.학생단체
  const concert = demoGroupId
    ? stored.events?.[demoGroupId]?.find((event) => event.id === "event-muse-concert")
    : undefined
  if (concert && !concert.packages) Object.assign(concert, museConcertPage)
  // 데모의 문장에서 이어짐 어미 뒤 쉼표가 빠졌다(PR #283). 이전에 저장된
  // 데이터는 여기서 다시 쓰일 때까지 옛 문장을 유지한다.
  const rewrite = (text: string | undefined) => (text !== undefined && Object.hasOwn(demoCopy, text) ? demoCopy[text] : text)
  for (const list of Object.values(stored.events ?? {})) for (const event of list) event.intro = rewrite(event.intro)
  for (const review of stored.reviews ?? []) review.comment = rewrite(review.comment) ?? review.comment
  for (const offer of stored.offers ?? []) offer.message = rewrite(offer.message) ?? offer.message
  for (const conversation of stored.conversations ?? []) {
    for (const message of conversation.messages) message.text = rewrite(message.text) ?? message.text
  }
  // 행사는 더 이상 여성 비율을 묻지 않으므로 저장된 값은 지운다.
  for (const list of Object.values(stored.events ?? {})) {
    for (const event of list) {
      const makeup = event.makeup as (NonNullable<typeof event.makeup> & { female?: number }) | undefined
      if (makeup?.female === undefined) continue
      delete makeup.female
      if (!makeup.years?.length && !makeup.majors) delete event.makeup
    }
  }
  // 버스킹 날의 협찬은 그 행사의 측정을 따른다.
  const busking = demoBrandId
    ? stored.sponsorships[demoBrandId]?.find((sponsorship) => sponsorship.id === "sp-busking")
    : undefined
  if (busking) busking.eventId ??= "event-busking-day"
  for (const events of Object.values(stored.events)) {
    for (const event of events) event.date = toIsoDate(event.date) ?? event.date
  }
  // 옛 데모 테스트 버튼으로 만든 기록은 이제 실제 체크인처럼 읽힌다.
  const testDetails: Record<string, string> = {
    "QR 스캔 테스트": "현장 QR 스캔",
    "쿠폰 수령 테스트": "아메리카노 1+1 쿠폰",
    "방문 확인 테스트": "매장 방문 확인",
  }
  for (const measurement of stored.measurements) {
    for (const entry of measurement.log) entry.detail = testDetails[entry.detail] ?? entry.detail
    // 방문은 이제 직원 PIN과 스캔의 패스가 필요하다.
    measurement.staffPin ??= measurement.eventId === "event-busking-day" ? "1012" : newStaffPin()
    measurement.passes ??= {}
    // 현장 집계와 단체의 현장 PIN은 측정 방식과 함께 생겼다.
    measurement.metrics = { ...emptyMetrics(), ...measurement.metrics }
    measurement.groupPin ??= measurement.eventId === "event-busking-day" ? "1013" : newStaffPin()
    // 협찬사마다 자기 쿠폰과 집계를 받고, 행사의 유일한 협찬사는 행사가 가졌던
    // 것을 넘겨받는다.
    // ROAS 목표는 1%에서 시작한다. 0이 한때 쓰였는데 0으로는 나눌 수 없다.
    if (measurement.goals.targets.roas < 1) measurement.goals.targets.roas = 100
    measurement.sponsors ??= []
    syncSponsors(stored, measurement)
    const { scans: _, ...noCounts } = emptyMetrics()
    for (const sponsor of measurement.sponsors) sponsor.metrics = { ...noCounts, ...sponsor.metrics }
    // 나뉘기 전에 저장된 방법이다(쿠폰이 QR, 쿠폰, 매장 방문을 모두 뜻했다).
    for (const holder of [measurement, ...measurement.sponsors]) {
      if (holder.methods) holder.methods = upgradeMethods(holder.methods)
      if (holder.confirmedMethods) holder.confirmedMethods = upgradeMethods(holder.confirmedMethods)
    }
    // 시간별 스캔에 날짜가 생겼고, 이전 것은 행사의 첫날에 있었다.
    const event = stored.events[measurement.accountId]?.find((item) => item.id === measurement.eventId)
    for (const slot of measurement.hourlyScans) slot.date ??= event?.date ?? ""
    // 행사가 더 이상 필요 없는 참여 기록은 시작할 때마다 지운다.
    if (event) prunePasses(stored, measurement, event)
  }
  // 확정된 방법이 보관되기 전에 양쪽이 확정한 e-contract는 가진 방법을
  // 확정된 것으로 센다.
  for (const agreement of stored.agreements) {
    if (!agreement.confirmed?.group || !agreement.confirmed?.brand) continue
    const proposal = acceptedProposal(stored, agreement.id)
    const share = proposal && agreementShare(stored, proposal)
    const holder = share && (share.sponsor ?? share.measurement)
    if (holder?.methods && !holder.confirmedMethods) holder.confirmedMethods = holder.methods
  }
  return stored
}

export function getDatabase() {
  if (!database) throw new Error("loadDatabase() must run before handling requests")
  return database
}

// 쓰기는 대기열에 넣고, 각각 이 복사본이 마지막으로 읽거나 쓴 버전 위에 쓴다
// (lib/storage.ts는 파일 쓰기가 중간에 죽어도 안전하게 하고, 다른 복사본이
// 먼저 쓴 데이터베이스 쓰기는 거절한다). 쓰기가 실패하면 메모리의 데이터는
// 마지막으로 쓴 것으로 돌아가므로, 오류로 답한 요청은 아무것도 남기지 않고
// 그대로 다시 시도할 수 있다. 호출한 쪽과 그 뒤에 대기한 쓰기의 호출한 쪽
// (변경도 함께 돌아갔다)은 503을 받는다. 다른 복사본이 먼저 썼다면 그 데이터가
// 다음 요청에 들어온다. 대기열은 계속 돌아가므로 다음 저장이 다시 시도한다.
export function saveDatabase() {
  const storage = currentStorage()
  const snapshot = JSON.stringify(getDatabase(), null, storage.indent)
  const at = generation
  const write = pendingWrite.then(async () => {
    if (at !== generation) throw new HttpError(503, notSaved)
    try {
      version = await storage.write(snapshot, version)
      checkedAt = Date.now()
    } catch (error) {
      generation += 1
      rollBack()
      if (error instanceof StaleWrite) await reload().catch((caught: Error) => console.error(caught))
      else console.error(error)
      throw new HttpError(503, notSaved)
    }
    durable = snapshot
    await storage.backUp(snapshot)
  })
  pendingWrite = write.catch(() => {})
  return write
}

// 마지막으로 쓴 데이터를 제자리에 되돌린다.
function rollBack() {
  replace(JSON.parse(durable) as Database)
}
