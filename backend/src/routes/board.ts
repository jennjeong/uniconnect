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
// 마감일을 얼마나 먼 날로 잡을 수 있는지와, 한 계정이 열어 둘 수 있는 글의 수다.
const maxDeadlineDays = 60
const maxOpenPosts = 5

// 하루에 누구나 올리는 수보다 많은 수다.
const postsPerDay = createRateLimit({
  limit: 10,
  windowMs: 24 * 60 * 60 * 1000,
  message: "모집 글을 너무 많이 올렸어요. 내일 다시 올려 주세요.",
})

// 글이 아직 지원을 받는지 정한다. 닫히지 않았고 마감이 지나지 않았으면 받는다.
export const isOpen = (post: BoardPost, today = todayInKorea()) => !post.closedAt && post.deadline >= today

// 글을 올린 쪽이 속한 카탈로그다.
const catalogOf = (role: Role) => (role === "학생단체" ? "groups" : "brands")

// 글을 올린 사람과 리스팅이다. 둘 다 있을 때만 있다.
function posterOf(database: Database, post: BoardPost) {
  const account = database.accounts.find((item) => item.id === post.accountId)
  const listing = account && findListing(database, account)
  return account && listing ? { account, listing } : undefined
}

// 보는 사람(`role`을 미리 보는 방문자라면 undefined)이 글을 찾을 수 있는지
// 정한다. 자기 글은 언제든 되고, 상대편 글은 열려 있고 올린 쪽의 리스팅이 보는
// 사람의 목록에 있을 때만 된다(회원에게는 회원의 것, 아니면 예시이며 멈춘
// 동안은 아니다).
function finds(database: Database, post: BoardPost, viewer: Account | undefined, role: Role) {
  const poster = posterOf(database, post)
  if (!poster) return false
  if (viewer?.id === post.accountId) return true
  if (post.hiddenAt) return false
  return poster.account.role !== role && isOpen(post) && listedTo(database, catalogOf(poster.account.role), poster.listing, viewer)
}

// 글에 지원한 제안을 올린 사람에게 보여 준다. 브랜드의 글에는 단체의 요청이,
// 단체의 글에는 브랜드의 제안이 온다.
function applicationsTo(database: Database, post: BoardPost, role: Role) {
  return role === "브랜드"
    ? database.requests
        .filter((item) => item.postId === post.id)
        .map((item) => ({ id: item.id, name: item.groupName, about: item.eventName, date: item.eventDate, status: statusOf(database, item) }))
    : database.offers
        .filter((item) => item.postId === post.id)
        .map((item) => ({ id: item.id, name: item.brandName, about: item.campaignName, date: item.campaignDate, status: statusOf(database, item) }))
}

// 보는 사람에게 보이는 글이다. 올린 사람(리스팅의 이름과 마크), 단체의 행사,
// 열려 있는지, 보는 사람 자신의 지원을 담고, 올린 사람에게는 지원 내역도 담는다.
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

// 계정(또는 ?role=를 미리 보는 방문자)의 게시판이다. 찾을 수 있는 상대편의
// 열린 글을 마감이 가까운 순으로, 자기 글을 열려 있든 아니든 최신순으로
// 보여 준다.
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

// 쓰거나 고친 글의 내용이다. 제목과 본문, 협찬의 종류, 오늘부터 60일 이내의
// 마감일, 단체의 행사(끝나지 않은 자기 행사 하나)를 담는다.
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

// 주소로 찾는 계정 자신의 글이다.
function ownPost(req: Request) {
  const account = requireAccount(req)
  const post = getDatabase().posts.find((item) => item.id === req.params.id && item.accountId === account.id)
  if (!post) throw new HttpError(404, "모집 글을 찾을 수 없어요.")
  return { account, post }
}

// 회원이 글을 올린다. 열린 글은 최대 다섯 개이고, 공유 데모 계정은 써 보는
// 모두가 함께 쓰므로 올릴 수 없다. 글이 리스팅으로 보이므로 리스팅을 먼저
// 써야 한다.
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

// 마감 전에 글을 닫는다. 게시판에서 사라지고 더 이상 지원하지 못하며, 이미
// 들어온 지원은 받은편지함에 남는다.
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
