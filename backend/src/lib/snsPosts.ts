import { config } from "../config.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Database, Measurement, SnsPost } from "../types.js"
import { acceptedProposal, sponsoredEvent } from "./agreements.js"
import { HttpError } from "./errors.js"

// How much one agreement holds.
export const postLimits = { posts: 10, photos: 3, reason: 100, reach: 100_000_000 }

// A post's address: https only, as it opens from the other side's page.
export function parsePostUrl(value: unknown) {
  const link = typeof value === "string" ? value.trim() : ""
  try {
    const url = new URL(link)
    if (url.protocol === "https:" && link.length <= 300) return url.href
  } catch {
    // Not an address; answered below.
  }
  throw new HttpError(400, "게시물 링크는 https://로 시작하는 주소로 적어 주세요.")
}

// The video a YouTube address points at: watch?v=, youtu.be/, shorts/ or live/.
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

// Public view counts from the YouTube Data API (videos.list, one unit a call
// of up to 50 videos), once YOUTUBE_API_KEY is set. A video left out of the
// answer is private or deleted. Only the video's id leaves the server. Tests
// swap `views`.
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

// Keeps what YouTube said: views, or none when the video can't be read, so
// the number the group wrote counts instead.
function record(post: SnsPost, views: number | undefined, at: string) {
  post.youtube = { ...(views === undefined ? {} : { views }), at }
}

// One post's views as it is added. Failing here leaves the daily round to
// try again, and the post goes in all the same.
export async function fetchViews(post: SnsPost) {
  const id = youtubeId(post.url)
  if (!id || !youtube.ready()) return
  try {
    record(post, (await youtube.views([id])).get(id), new Date().toISOString())
  } catch (error) {
    console.warn(`[youtube] ${(error as Error).message}`)
  }
}

// The daily round (index.ts hourly, the cron route on Vercel): every YouTube
// post not read in the past 20 hours. Returns how many were read.
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
  // Looked up again: the data may have been read anew during the calls.
  const now = new Date().toISOString()
  const database = getDatabase()
  for (const { agreementId, postId, id } of read) {
    const post = database.agreements.find((item) => item.id === agreementId)?.snsPosts?.find((item) => item.id === postId)
    if (post && youtubeId(post.url) === id) record(post, found.get(id), now)
  }
  await saveDatabase()
  return read.length
}

// What a post counts for: the views YouTube gave, or the number written.
export const reachOf = (post: SnsPost) => post.youtube?.views ?? post.reach

// The reach of an event's posts, across its sponsors: what the brands
// confirmed, which goes into the reports, and what still waits for them. A
// post shared with several sponsors counts once, as confirmed if any of them
// did; a sponsorship called off counts for nothing.
export function postedReach(database: Database, measurement: Measurement) {
  const byUrl = new Map<string, SnsPost>()
  for (const agreement of database.agreements) {
    if (!agreement.snsPosts?.length) continue
    const proposal = acceptedProposal(database, agreement.id)
    if (!proposal || proposal.canceled) continue
    const sponsored = sponsoredEvent(database, proposal)
    if (sponsored?.event.id !== measurement.eventId || sponsored.owner.id !== measurement.accountId) continue
    for (const post of agreement.snsPosts) {
      const kept = byUrl.get(post.url)
      if (!kept || (post.status === "confirmed" && kept.status !== "confirmed")) byUrl.set(post.url, post)
    }
  }
  const posts = [...byUrl.values()]
  const sum = (status: SnsPost["status"]) =>
    posts.filter((post) => post.status === status).reduce((total, post) => total + reachOf(post), 0)
  return { confirmed: sum("confirmed"), pending: sum("pending") }
}
