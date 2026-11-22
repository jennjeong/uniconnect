import type { BoardPost, Database } from "../types.js"

// 행사에 이어진 모집 글(단체의 협찬사 찾기)은 그 행사가 끝난 뒤에 지원을 받지 않는다.
// 마감일은 행사의 마지막 날을 넘지 않는다(쓸 때는 routes/board.ts가 막고, 행사 날짜가
// 바뀌거나 예전 데이터를 불러올 때는 여기서 당긴다).

// 글이 이어진 행사의 마지막 날이다. 이어진 행사가 없으면 undefined다.
export function postEventLastDay(database: Pick<Database, "events">, post: Pick<BoardPost, "accountId" | "eventId">) {
  if (!post.eventId) return undefined
  const event = (database.events?.[post.accountId] ?? []).find((item) => item.id === post.eventId)
  return event ? event.endDate ?? event.date : undefined
}

// 행사의 마지막 날보다 늦은 마감을 그날로 당긴다. 바꾼 글의 수를 돌려준다.
export function clampPostDeadlines(database: Pick<Database, "posts" | "events">) {
  let changed = 0
  for (const post of database.posts ?? []) {
    const lastDay = postEventLastDay(database, post)
    if (lastDay && post.deadline > lastDay) {
      post.deadline = lastDay
      changed += 1
    }
  }
  return changed
}
