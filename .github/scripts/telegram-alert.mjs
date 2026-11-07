// 협업자에게 할 일이 생기는 GitHub 이벤트를 텔레그램으로 알린다.
// 이벤트 내용은 누구나 쓸 수 있는 글이므로 명령에 넣지 않고 이스케이프해 보낸다.
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const line = "━━━━━━━━━━━━━━"

const styles = {
  princess: {
    task: { title: "👑🎀 공주님, 직접 확인할 일이 생겼어요! 💌", todo: "🌷 해야 할 일", detail: "💖 확인할 내용" },
    error: { title: "🥺💔 공주님, 문제가 생겼어요!", todo: "🌷 해야 할 일", detail: "💖 무슨 일인지" },
    where: "위치",
    partner: "🤝 왕자님이 하신 일",
    next: "🌟 공주님이 다음에 하실 일",
    footer: "💕 공주님의 확인을 기다리고 있을게요! ✨",
  },
  prince: {
    task: { title: "👑⚔️ 왕자님, 새로운 임무가 도착했습니다! 📜", todo: "🏰 임무", detail: "🛡️ 상황 보고" },
    error: { title: "🚨⚔️ 왕자님, 문제가 발생했습니다!", todo: "🏰 임무", detail: "🛡️ 상황 보고" },
    where: "작업 위치",
    partner: "🤝 공주님이 하신 일",
    next: "⚔️ 왕자님의 다음 임무",
    footer: "💙 왕자님의 확인을 기다리겠습니다! 👑✨",
  },
}

// 이벤트 글을 한 줄로 눌러 알림의 줄과 구분선을 흉내 내지 못하게 한다.
export const escapeHtml = (text) =>
  String(text ?? "").replace(/\s+/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const clip = (text, size) => {
  const value = String(text ?? "").trim()
  return value.length > size ? `${value.slice(0, size)}…` : value
}

export function format(style, { kind, todo, detail, url, did, next }) {
  const look = styles[style]
  const parts = look[kind]
  return [
    `<b>${parts.title}</b>`,
    line,
    `<b>${parts.todo}</b>`,
    escapeHtml(todo),
    "",
    `<b>${parts.detail}</b>`,
    escapeHtml(detail),
    "",
    // 상대가 보낸 이벤트일 때만 상대가 한 일을 적는다.
    ...(did ? [`<b>${look.partner}</b>`, `• ${escapeHtml(did)}`, ""] : []),
    ...(next ? [`<b>${look.next}</b>`, `• ${escapeHtml(next)}`, ""] : []),
    `📍 <b>${look.where}:</b> ${escapeHtml(url)}`,
    line,
    look.footer,
  ].join("\n")
}

// 깃허브 계정을 사람으로 바꾼다. 모르는 계정을 추측하지 않는다.
const personOf = (people, login) => Object.keys(people).find((name) => people[name].github?.toLowerCase() === login?.toLowerCase())

const askAdmin = (notice, login) => ({
  person: "princess",
  notice: { ...notice, todo: `담당자를 확인해 주세요 (${login ?? "알 수 없음"})`, detail: notice.todo },
})

function toOne(people, login, notice) {
  const person = personOf(people, login)
  return [person ? { person, notice } : askAdmin(notice, login)]
}

// 이벤트를 일으킨 사람이 받는 사람의 상대일 때만 그 일을 적는다.
function withPartner(people, sender, list, did) {
  const from = personOf(people, sender)
  return list.map((item) => (from && from !== item.person ? { ...item, notice: { ...item.notice, did } } : item))
}

const trusted = ["OWNER", "MEMBER", "COLLABORATOR"]
const askTargets = { 왕자: ["prince"], 공주: ["princess"], 같이: ["princess", "prince"] }

// 알릴 일이면 받는 사람과 내용을 답한다. 알릴 일이 아니면 빈 목록이다.
export function route(event, payload, people) {
  const sender = payload.sender?.login
  if (sender?.endsWith("[bot]") && event !== "workflow_run") return []

  if (event === "issues" && payload.action === "assigned") {
    const login = payload.assignee?.login
    if (login === sender) return []
    const list = toOne(people, login, {
      kind: "task",
      todo: `이슈 #${payload.issue.number}의 담당자가 됐어요.`,
      detail: clip(payload.issue.title, 200),
      next: "이슈 내용을 읽고 작업을 시작하기",
      url: payload.issue.html_url,
    })
    return withPartner(people, sender, list, `이슈 #${payload.issue.number}의 담당자로 지정`)
  }

  if (event === "pull_request_target" && payload.action === "review_requested") {
    const login = payload.requested_reviewer?.login ?? payload.requested_team?.slug
    const list = toOne(people, login, {
      kind: "task",
      todo: `PR #${payload.pull_request.number}의 리뷰 요청이 왔어요.`,
      detail: clip(payload.pull_request.title, 200),
      next: "변경 내용을 보고 리뷰 남기기",
      url: payload.pull_request.html_url,
    })
    return withPartner(people, sender, list, `PR #${payload.pull_request.number} 리뷰 요청`)
  }

  // 공개 저장소라 누구나 리뷰를 남길 수 있다. 협업자의 리뷰만 전한다.
  if (
    event === "pull_request_review" &&
    payload.action === "submitted" &&
    payload.review?.state === "changes_requested" &&
    trusted.includes(payload.review.author_association)
  ) {
    const list = toOne(people, payload.pull_request.user?.login, {
      kind: "task",
      todo: `PR #${payload.pull_request.number}에 수정 요청이 왔어요.`,
      detail: clip(payload.review.body || payload.pull_request.title, 300),
      next: "리뷰 내용대로 고치고 다시 리뷰 요청하기",
      url: payload.review.html_url,
    })
    return withPartner(people, sender, list, `PR #${payload.pull_request.number} 리뷰에서 수정 요청`)
  }

  if (event === "workflow_run" && payload.action === "completed" && payload.workflow_run?.conclusion === "failure") {
    const run = payload.workflow_run
    // 포크에서 온 실행은 누구나 일으킬 수 있으므로 알리지 않는다.
    if (run.head_repository?.full_name !== payload.repository?.full_name) return []
    return toOne(people, run.triggering_actor?.login ?? run.actor?.login, {
      kind: "error",
      todo: `${clip(run.name, 60)} 검사가 실패했어요. 로그를 확인해 주세요.`,
      detail: `브랜치 ${clip(run.head_branch, 100)}, 커밋 ${String(run.head_sha ?? "").slice(0, 7)}`,
      next: "실패한 로그를 보고 고치기",
      url: run.html_url,
    })
  }

  // 협업자가 댓글 첫 줄에 `/알림 왕자`, `/알림 공주`, `/알림 같이`를 쓰면 확인을 요청한다.
  if (event === "issue_comment" && payload.action === "created" && trusted.includes(payload.comment?.author_association)) {
    const asked = /^\/알림\s+(왕자|공주|같이)\s*(?:\n|$)/.exec(payload.comment.body ?? "")
    // `협업` 라벨이 붙은 이슈는 번갈아 일하는 곳이다. 한쪽이 글을 남기면 상대에게 차례를 알린다.
    if (!asked) {
      const from = personOf(people, sender)
      const shared = (payload.issue?.labels ?? []).some((label) => label.name === "협업")
      if (!shared || !from) return []
      const partner = from === "princess" ? "prince" : "princess"
      return [
        {
          person: partner,
          notice: {
            kind: "task",
            todo: `#${payload.issue.number}에 새 글이 올라왔어요. 확인해 주세요.`,
            detail: clip(payload.comment.body, 300),
            did: `#${payload.issue.number}에 글 남김`,
            next: "글을 읽고 내 차례인 일을 이어 가기",
            url: payload.comment.html_url,
          },
        },
      ]
    }
    const rest = payload.comment.body.slice(asked[0].length)
    const list = askTargets[asked[1]]
      .filter((person) => people[person])
      .map((person) => ({
        person,
        notice: {
          kind: "task",
          todo: `${sender}님이 #${payload.issue.number} 확인을 요청했어요.`,
          detail: clip(rest || payload.issue.title, 300),
          next: "요청한 내용을 확인하고 답하기",
          url: payload.comment.html_url,
        },
      }))
    return withPartner(people, sender, list, `#${payload.issue.number} 확인 요청`)
  }
  return []
}

export async function send(token, chat, text, fetcher = fetch) {
  const post = (body) =>
    fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, link_preview_options: { is_disabled: true }, ...body }),
    })
  let status = 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await post({ parse_mode: "HTML" })
    status = response.status
    if (response.ok) return
    // 서식 오류면 일반 글로 보낸다.
    if (status === 400) {
      const plain = await post({ text: text.replace(/<\/?b>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") })
      if (plain.ok) return
      status = plain.status
      break
    }
    await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)))
  }
  // 주소에 토큰이 있으므로 상태 코드만 남긴다.
  throw new Error(`Telegram answered ${status}`)
}

async function main() {
  const env = process.env
  const people = {
    princess: { github: env.PRINCESS_GITHUB_LOGIN, chat: env.PRINCESS_TELEGRAM_CHAT_ID },
    prince: { github: env.PRINCE_GITHUB_LOGIN, chat: env.PRINCE_TELEGRAM_CHAT_ID },
  }
  // 포크의 PR이나 설정 전에는 값이 없다. 실패로 만들지 않는다.
  if (!env.TELEGRAM_BOT_TOKEN || !people.princess.chat) {
    console.log("::notice::Telegram is not set up here, so nothing was sent.")
    return
  }
  const payload = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"))
  for (const { person, notice } of route(env.GITHUB_EVENT_NAME, payload, people)) {
    if (!people[person].chat) {
      console.log(`::warning::No chat for ${person}, so it was not sent.`)
      continue
    }
    await send(env.TELEGRAM_BOT_TOKEN, people[person].chat, format(person, notice))
    console.log(`sent to ${person}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main()
