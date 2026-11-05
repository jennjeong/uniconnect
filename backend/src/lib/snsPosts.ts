import { config } from "../config.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Database, Measurement, SnsPost } from "../types.js"
import { acceptedProposal, sponsoredEvent } from "./agreements.js"
import { HttpError } from "./errors.js"

// 계약서 하나에 담는 양.
export const postLimits = { posts: 10, photos: 3, reason: 100, reach: 100_000_000 }

// 게시물 주소. 상대의 화면에서 열리므로 https만 받고, 계정 정보가 든 주소는
// 받지 않는다.
export function parsePostUrl(value: unknown) {
  const link = typeof value === "string" ? value.trim() : ""
  try {
    const url = new URL(link)
    if (url.protocol === "https:" && link.length <= 300 && !url.username && !url.password) return url.href
  } catch {
    // 주소가 아니다. 아래에서 답한다.
  }
  throw new HttpError(400, "게시물 링크는 https://로 시작하는 주소로 적어 주세요.")
}

// 유튜브 주소가 가리키는 영상. watch?v=, youtu.be/, shorts/, live/ 꼴이다.
export function youtubeId(address: string) {
  const url = new URL(address)
  const host = url.hostname.replace(/^(www|m|music)\./, "")
  const id =
    host === "youtu.be"
      ? url.pathname.split("/")[1]
      : host === "youtube.com"
        ? (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1])
        : undefined
  return id && /^[\w-]{6,20}$/.test(id) ? id : undefined
}

// 공유 추적 값. 같은 게시물을 다른 주소로 두 번 세지 않도록 비교할 때 뺀다.
const trackers = /^(utm_\w+|fbclid|igsh|igshid|si|feature|ref)$/

// 같은 게시물인지 비교하는 값. 유튜브는 영상 ID, 그 밖에는 추적 값과 조각,
// www · m, 끝의 빗금을 뺀 주소다.
export function postKey(address: string) {
  const id = youtubeId(address)
  if (id) return `youtube:${id}`
  const url = new URL(address)
  for (const name of [...url.searchParams.keys()]) {
    if (trackers.test(name)) url.searchParams.delete(name)
  }
  url.hash = ""
  url.hostname = url.hostname.replace(/^(www|m)\./, "")
  url.pathname = url.pathname.replace(/\/+$/, "")
  return url.href
}

// YOUTUBE_API_KEY가 있을 때 YouTube Data API(videos.list, 영상 50개까지 호출당
// 1단위)에서 공개 조회수를 읽는다. 답에서 빠진 영상은 비공개거나 삭제된 것이다.
// 서버 밖으로는 영상 ID만 나간다. 테스트는 `views`를 바꿔 쓴다.
export const youtube = {
  ready: () => Boolean(config.youtubeApiKey),
  views: async (ids: string[]) => {
    const query = new URLSearchParams({ part: "statistics", id: ids.join(","), key: config.youtubeApiKey ?? "" })
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${query}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`YouTube answered ${response.status}`)
    const body = (await response.json()) as { items?: { id: string; statistics?: { viewCount?: string } }[] }
    return new Map(
      (body.items ?? []).flatMap((item) => {
        const views = Number(item.statistics?.viewCount)
        return Number.isSafeInteger(views) ? [[item.id, views] as const] : []
      }),
    )
  },
}

// 유튜브의 답을 보관한다. 영상을 읽을 수 없으면 조회수 없이 남겨, 단체가 적은
// 숫자로 센다.
function record(post: SnsPost, views: number | undefined, at: string) {
  post.youtube = { ...(views === undefined ? {} : { views }), at }
}

// 게시물을 올릴 때의 조회수. 실패해도 게시물은 올라가고 매일 도는 일이 다시
// 읽는다.
export async function fetchViews(post: SnsPost) {
  const id = youtubeId(post.url)
  if (!id || !youtube.ready()) return
  try {
    record(post, (await youtube.views([id])).get(id), new Date().toISOString())
  } catch (error) {
    console.warn(`[youtube] ${(error as Error).message}`)
  }
}

// 매일 도는 일(index.ts는 한 시간마다, Vercel은 cron 경로). 20시간 안에 읽지
// 않은 유튜브 게시물을 읽고 읽은 수를 돌려준다.
export async function refreshViews() {
  if (!youtube.ready()) return 0
  const due = Date.now() - 20 * 60 * 60 * 1000
  const stale = getDatabase().agreements.flatMap((agreement) =>
    (agreement.snsPosts ?? []).flatMap((post) => {
      const id = youtubeId(post.url)
      return id && (!post.youtube || Date.parse(post.youtube.at) < due) ? [{ agreementId: agreement.id, postId: post.id, id }] : []
    }),
  )
  const found = new Map<string, number>()
  const read: typeof stale = []
  for (let start = 0; start < stale.length; start += 50) {
    const batch = stale.slice(start, start + 50)
    try {
      for (const [id, views] of await youtube.views([...new Set(batch.map((item) => item.id))])) found.set(id, views)
      read.push(...batch)
    } catch (error) {
      console.warn(`[youtube] ${(error as Error).message}`)
    }
  }
  if (read.length === 0) return 0
  // 호출하는 동안 데이터를 새로 읽었을 수 있어 다시 찾는다.
  const now = new Date().toISOString()
  const database = getDatabase()
  for (const { agreementId, postId, id } of read) {
    const post = database.agreements.find((item) => item.id === agreementId)?.snsPosts?.find((item) => item.id === postId)
    if (post && youtubeId(post.url) === id) record(post, found.get(id), now)
  }
  await saveDatabase()
  return read.length
}

// 게시물이 세는 값. 유튜브 조회수, 없으면 적은 숫자다.
export const reachOf = (post: SnsPost) => post.youtube?.views ?? post.reach

// 행사의 협찬사 전체에 걸친 게시물 도달. 브랜드가 확인해 리포트에 들어가는
// 값과 아직 기다리는 값이다. 여러 협찬사에 올린 게시물은 한 번만 세고, 한 곳이
// 확인했으면 확인으로 친다. 취소된 협찬은 세지 않는다.
export function postedReach(database: Database, measurement: Measurement) {
  const byKey = new Map<string, SnsPost>()
  for (const agreement of database.agreements) {
    if (!agreement.snsPosts?.length) continue
    const proposal = acceptedProposal(database, agreement.id)
    if (!proposal || proposal.canceled) continue
    const sponsored = sponsoredEvent(database, proposal)
    if (sponsored?.event.id !== measurement.eventId || sponsored.owner.id !== measurement.accountId) continue
    for (const post of agreement.snsPosts) {
      const key = postKey(post.url)
      const kept = byKey.get(key)
      if (!kept || (post.status === "confirmed" && kept.status !== "confirmed")) byKey.set(key, post)
    }
  }
  const posts = [...byKey.values()]
  const sum = (status: SnsPost["status"]) =>
    posts.filter((post) => post.status === status).reduce((total, post) => total + reachOf(post), 0)
  return { confirmed: sum("confirmed"), pending: sum("pending") }
}
