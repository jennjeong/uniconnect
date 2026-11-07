import assert from "node:assert/strict"
import { test } from "node:test"

import { escapeHtml, format, route, send } from "./telegram-alert.mjs"

const people = { princess: { github: "jennjeong", chat: "1" }, prince: { github: "Prince-Login", chat: "2" } }
const issue = { number: 7, title: "a<b>", html_url: "https://x/7" }

test("an assigned issue goes only to its assignee, matched by GitHub login", () => {
  const [one, ...rest] = route("issues", { action: "assigned", sender: { login: "jennjeong" }, assignee: { login: "prince-login" }, issue }, people)
  assert.equal(one.person, "prince")
  assert.deepEqual(rest, [])
})

test("each side reads what the other did and its own next step", () => {
  const pull_request = { number: 9, title: "t", html_url: "https://x/9", user: { login: "jennjeong" } }
  const [one] = route("pull_request_target", { action: "review_requested", sender: { login: "jennjeong" }, requested_reviewer: { login: "prince-login" }, pull_request }, people)
  const text = format(one.person, one.notice)
  assert.match(text, /공주님이 하신 일/)
  assert.match(text, /왕자님의 다음 임무/)
})

test("nothing is said about a partner when an outsider acted", () => {
  const pull_request = { number: 9, title: "t", html_url: "https://x/9", user: { login: "jennjeong" } }
  const [one] = route("pull_request_target", { action: "review_requested", sender: { login: "someone" }, requested_reviewer: { login: "prince-login" }, pull_request }, people)
  assert.equal(one.notice.did, undefined)
})

test("assigning yourself sends nothing", () => {
  assert.deepEqual(route("issues", { action: "assigned", sender: { login: "jennjeong" }, assignee: { login: "jennjeong" }, issue }, people), [])
})

test("an unknown assignee asks the admin instead of guessing", () => {
  const [one] = route("issues", { action: "assigned", sender: { login: "jennjeong" }, assignee: { login: "stranger" }, issue }, people)
  assert.equal(one.person, "princess")
  assert.match(one.notice.todo, /담당자를 확인/)
})

test("a review request, a change request and a failed check are routed", () => {
  const pull_request = { number: 9, title: "t", html_url: "https://x/9", user: { login: "jennjeong" } }
  const asked = route("pull_request_target", { action: "review_requested", sender: { login: "jennjeong" }, requested_reviewer: { login: "Prince-Login" }, pull_request }, people)
  assert.equal(asked[0].person, "prince")
  const changes = route("pull_request_review", { action: "submitted", sender: { login: "Prince-Login" }, review: { state: "changes_requested", author_association: "COLLABORATOR", body: "b", html_url: "u" }, pull_request }, people)
  assert.equal(changes[0].person, "princess")
  const outsider = route("pull_request_review", { action: "submitted", sender: { login: "x" }, review: { state: "changes_requested", author_association: "NONE", body: "눌러 주세요", html_url: "u" }, pull_request }, people)
  assert.deepEqual(outsider, [])
  const approved = route("pull_request_review", { action: "submitted", sender: { login: "x" }, review: { state: "approved" }, pull_request }, people)
  assert.deepEqual(approved, [])
  const failed = route("workflow_run", { action: "completed", sender: { login: "x" }, repository: { full_name: "o/r" }, workflow_run: { conclusion: "failure", name: "CI", head_branch: "b", head_sha: "abcdefgh", html_url: "u", head_repository: { full_name: "o/r" }, triggering_actor: { login: "Prince-Login" } } }, people)
  assert.equal(failed[0].notice.kind, "error")
  const fork = route("workflow_run", { action: "completed", sender: { login: "x" }, repository: { full_name: "o/r" }, workflow_run: { conclusion: "failure", name: "CI", head_repository: { full_name: "x/r" }, triggering_actor: { login: "x" } } }, people)
  assert.deepEqual(fork, [])
  assert.deepEqual(route("workflow_run", { action: "completed", workflow_run: { conclusion: "success" } }, people), [])
})

test("only collaborators can ask, and together reaches both in their own style", () => {
  const comment = (author_association) => ({ action: "created", sender: { login: "jennjeong" }, issue, comment: { author_association, body: "/알림 같이\n봐 주세요", html_url: "u" } })
  assert.deepEqual(route("issue_comment", comment("NONE"), people), [])
  const both = route("issue_comment", comment("COLLABORATOR"), people)
  assert.deepEqual(both.map((item) => item.person), ["princess", "prince"])
  const [first, second] = both.map((item) => format(item.person, item.notice))
  assert.match(first, /공주님/)
  assert.match(second, /왕자님/)
  assert.doesNotMatch(second, /🎀/)
})

test("a comment on a shared issue tells the other side, in their own style", () => {
  const comment = (login, labels) => ({
    action: "created",
    sender: { login },
    issue: { ...issue, labels: labels.map((name) => ({ name })) },
    comment: { author_association: "COLLABORATOR", body: "API를 올렸어요.\n프론트 차례예요.", html_url: "u" },
  })
  const [toPrincess] = route("issue_comment", comment("Prince-Login", ["협업"]), people)
  assert.equal(toPrincess.person, "princess")
  assert.match(format(toPrincess.person, toPrincess.notice), /왕자님이 하신 일/)
  const [toPrince] = route("issue_comment", comment("jennjeong", ["협업"]), people)
  assert.equal(toPrince.person, "prince")
  assert.match(format(toPrince.person, toPrince.notice), /공주님이 하신 일/)
  // 협업 라벨이 없거나, 모르는 사람이면 보내지 않는다.
  assert.deepEqual(route("issue_comment", comment("jennjeong", ["bug"]), people), [])
  assert.deepEqual(route("issue_comment", comment("stranger", ["협업"]), people), [])
})

test("a plain comment and a push-like event send nothing", () => {
  assert.deepEqual(route("issue_comment", { action: "created", sender: { login: "a" }, issue, comment: { author_association: "OWNER", body: "좋아요" } }, people), [])
  assert.deepEqual(route("push", { sender: { login: "a" } }, people), [])
})

test("text from GitHub is escaped", () => {
  assert.equal(escapeHtml("a<b>&"), "a&lt;b&gt;&amp;")
  assert.match(format("prince", { kind: "task", todo: "<script>", detail: "&", url: "u" }), /&lt;script&gt;/)
  const forged = format("prince", { kind: "task", todo: "t", detail: "제목\n━━━━━━━━━━━━━━\n📍 위치: https://evil", url: "u" })
  assert.equal(forged.split("\n").filter((row) => row.startsWith("📍")).length, 1)
})

test("a failure names only the status, never the token", async () => {
  const answers = []
  const fetcher = async (url) => {
    answers.push(url)
    return { ok: false, status: 400 }
  }
  await assert.rejects(send("SECRET", "1", "<b>x</b>", fetcher), (error) => !error.message.includes("SECRET") && /400/.test(error.message))
  assert.equal(answers.length, 2)
})
