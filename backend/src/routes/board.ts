import { randomUUID } from "node:crypto"
import { Router, type Request } from "express"

import { findListing, listedTo } from "../lib/catalog.js"
import { addDays, todayInKorea, toIsoDate } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { statusOf } from "../lib/proposals.js"
import { createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { parseRole, sponsorTypes, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, BoardPost, Database, Role } from "../types.js"

export const boardRouter = Router()

const maxTitle = 60
const maxBody = 1000
// How far ahead a deadline may be, and how many open posts one account keeps.
const maxDeadlineDays = 60
const maxOpenPosts = 5

// More than anyone posts in a day.
const postsPerDay = createRateLimit({
  limit: 10,
  windowMs: 24 * 60 * 60 * 1000,
  message: "모집 글을 너무 많이 올렸어요. 내일 다시 올려 주세요.",
})

// Whether a post still takes applications: not closed, and its deadline not past.
export const isOpen = (post: BoardPost, today = todayInKorea()) => !post.closedAt && post.deadline >= today

// The catalog a post's poster is listed in.
const catalogOf = (role: Role) => (role === "학생단체" ? "groups" : "brands")

// The post's poster and listing, while both are there.
function posterOf(database: Database, post: BoardPost) {
  const account = database.accounts.find((item) => item.id === post.accountId)
  const listing = account && findListing(database, account)
  return account && listing ? { account, listing } : undefined
}

// Whether the viewer (a visitor previewing `role` when undefined) finds a
// post: its own any time; the other side's while it is open and its poster's
// listing is in the viewer's lists (members' for members, the examples
// otherwise, not while paused).
function finds(database: Database, post: BoardPost, viewer: Account | undefined, role: Role) {
  const poster = posterOf(database, post)
  if (!poster) return false
  if (viewer?.id === post.accountId) return true
  if (post.hiddenAt) return false
  return poster.account.role !== role && isOpen(post) && listedTo(database, catalogOf(poster.account.role), poster.listing, viewer)
}

// The proposals that applied to a post, to its poster: a brand's post gets
// groups' requests, a group's post brands' offers.
function applicationsTo(database: Database, post: BoardPost, role: Role) {
  return role === "브랜드"
    ? database.requests
        .filter((item) => item.postId === post.id)
        .map((item) => ({ id: item.id, name: item.groupName, about: item.eventName, date: item.eventDate, status: statusOf(database, item) }))
    : database.offers
        .filter((item) => item.postId === post.id)
        .map((item) => ({ id: item.id, name: item.brandName, about: item.campaignName, date: item.campaignDate, status: statusOf(database, item) }))
}

// A post as the viewer sees it: who posted it (its listing's name and mark),
// a group's event, whether it is open, the viewer's own application, and to
// its poster the applications.
function postView(database: Database, post: BoardPost, viewer: Account | undefined) {
  const poster = posterOf(database, post)!
  const event = post.eventId ? (database.events[post.accountId] ?? []).find((item) => item.id === post.eventId) : undefined
  const own = viewer?.id === post.accountId
  const applied = viewer
    ? [...database.requests, ...database.offers].find((item) => item.postId === post.id && item.fromAccountId === viewer.id)
    : undefined
  const { accountId: _account, ...shown } = post
  const { id, name, category, industry, logo, school } = poster.listing
  return {
    ...shown,
    role: poster.account.role,
    poster: { id, name, category, industry, ...(logo ? { logo } : {}), ...(school ? { school } : {}) },
    ...(event ? { event: { id: event.id, name: event.name, date: event.date, endDate: event.endDate, people: event.people } } : {}),
    open: isOpen(post),
    own,
    ...(applied ? { applied: statusOf(database, applied) } : {}),
    ...(own ? { applications: applicationsTo(database, post, poster.account.role) } : {}),
  }
}

// The board for the account (or a visitor previewing ?role=): the other
// side's open posts it finds, the soonest deadline first, and its own,
// newest first, open or not.
boardRouter.get("/", (req, res) => {
  const database = getDatabase()
  const viewer = req.account
  const role = viewer?.role ?? parseRole(req.query.role)
  const others = database.posts
    .filter((post) => post.accountId !== viewer?.id && finds(database, post, viewer, role))
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
  const mine = viewer ? database.posts.filter((post) => post.accountId === viewer.id).reverse() : []
  res.json({
    posts: others.map((post) => postView(database, post, viewer)),
    mine: mine.filter((post) => posterOf(database, post)).map((post) => postView(database, post, viewer)),
  })
})

boardRouter.get("/:id", (req, res) => {
  const database = getDatabase()
  const post = database.posts.find((item) => item.id === req.params.id)
  const role = req.account?.role ?? parseRole(req.query.role)
  if (!post || !finds(database, post, req.account, role)) throw new HttpError(404, "모집 글을 찾을 수 없어요.")
  res.json({ post: postView(database, post, req.account) })
})

// A post's words as written or edited: a title and body, the kinds of
// sponsorship, a deadline from today to 60 days on, and a group's event (one
// of its own that hasn't ended).
function parsePost(account: Account, body: Request["body"]) {
  const title = text(body?.title)
  const words = text(body?.body)
  const types = Array.isArray(body?.types) ? sponsorTypes.filter((type) => body.types.map(String).includes(type)) : []
  const deadline = toIsoDate(text(body?.deadline))
  const today = todayInKorea()
  if (!title || !words) throw new HttpError(400, "제목과 내용을 적어 주세요.")
  if (title.length > maxTitle) throw new HttpError(400, `제목은 ${maxTitle}자 이하로 적어 주세요.`)
  if (words.length > maxBody) throw new HttpError(400, `내용은 ${maxBody}자 이하로 적어 주세요.`)
  if (types.length === 0) throw new HttpError(400, "협찬 종류를 하나 이상 골라 주세요.")
  if (!deadline || deadline < today || deadline > addDays(today, maxDeadlineDays)) {
    throw new HttpError(400, `마감일은 오늘부터 ${maxDeadlineDays}일 안으로 골라 주세요.`)
  }
  let eventId: string | undefined
  if (account.role === "학생단체") {
    const event = (getDatabase().events[account.id] ?? []).find((item) => item.id === text(body?.eventId))
    if (!event || (event.endDate ?? event.date) < today) throw new HttpError(400, "협찬을 찾을 다가오는 행사를 골라 주세요.")
    eventId = event.id
  }
  return { title, body: words, types, deadline, ...(eventId ? { eventId } : {}) }
}

// The account's own post, by the address.
function ownPost(req: Request) {
  const account = requireAccount(req)
  const post = getDatabase().posts.find((item) => item.id === req.params.id && item.accountId === account.id)
  if (!post) throw new HttpError(404, "모집 글을 찾을 수 없어요.")
  return { account, post }
}

// A member posts, five open posts at most; the shared demo accounts can't,
// as everyone trying them would. Its listing must be written first, as the
// post shows as it.
boardRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 모집 글을 올릴 수 없어요.")
  const listing = findListing(database, account)
  if (!listing) throw new HttpError(409, "내 정보에서 소개를 먼저 써 주세요. 모집 글은 소개와 함께 보여요.")
  const fields = parsePost(account, req.body)
  const open = database.posts.filter((post) => post.accountId === account.id && isOpen(post))
  if (open.length >= maxOpenPosts) throw new HttpError(409, `열려 있는 모집 글은 ${maxOpenPosts}개까지예요. 다 된 글을 먼저 닫아 주세요.`)
  await postsPerDay.take(account.id)
  const post: BoardPost = {
    id: randomUUID(),
    accountId: account.id,
    listingId: listing.id,
    ...fields,
    createdAt: new Date().toISOString(),
  }
  database.posts.push(post)
  await saveDatabase()
  res.status(201).json({ post: postView(database, post, account) })
})

boardRouter.put("/:id", async (req, res) => {
  const { account, post } = ownPost(req)
  const fields = parsePost(account, req.body)
  delete post.eventId
  Object.assign(post, fields, { updatedAt: new Date().toISOString() })
  await saveDatabase()
  res.json({ post: postView(getDatabase(), post, account) })
})

// Closes a post before its deadline: it leaves the board, and no one applies
// any more; the applications already in stay in the inbox.
boardRouter.post("/:id/close", async (req, res) => {
  const { account, post } = ownPost(req)
  post.closedAt ??= new Date().toISOString()
  await saveDatabase()
  res.json({ post: postView(getDatabase(), post, account) })
})

boardRouter.delete("/:id", async (req, res) => {
  const { post } = ownPost(req)
  const database = getDatabase()
  database.posts = database.posts.filter((item) => item.id !== post.id)
  await saveDatabase()
  res.status(204).end()
})
