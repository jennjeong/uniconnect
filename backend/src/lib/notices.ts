import { waitUntil } from "@vercel/functions"

import { config } from "../config.js"
import { translate } from "./i18n.js"
import { mailConfigured, sendMail } from "./mailer.js"
import { getDatabase } from "../store.js"
import type { Account, MailKind } from "../types.js"

// 공용 데모 계정에는 이메일을 보내지 않는다. 데모를 써 보는 모두가 쓰므로
// 주소가 누구도 가리키지 않고, 하나는 실제 대학교 도메인에 있다. 운영자가
// 정지한 계정에도 보내지 않는다.
const isDemo = (account: Account) => Object.values(getDatabase().demoAccountIds).includes(account.id)

// 계정에 처리할 일이 있다고 이메일로 알린다: 제안, 답, 메시지. SITE_URL이
// 있으면 페이지 링크를 붙인다. 계정이 내 정보에서 끈 종류는 보내지 않지만
// "account"(로그인 이메일, 운영자의 답)는 늘 보낸다. 이메일은 계정이 앱을
// 마지막으로 쓴 언어로 가며, 서버가 한국어로 쓴 줄은 translate(i18n/en.ts,
// 값이 있는 줄은 {name} 패턴)를 거친다. 일으킨 요청을 붙잡거나 실패하게 하지
// 않는다. Vercel에서는 응답을 보내면 함수가 멈출 수 있어서 waitUntil로 메일이
// 나갈 때까지 돌게 하며, 다른 곳에서는 아무 일도 하지 않는다. 메일이 실패했을
// 때만 false로 답한다(끄거나 정지한 계정처럼 보내지 않기로 한 것은 true).
export function notify(
  account: Account | undefined,
  kind: MailKind | "account",
  subject: string,
  lines: string[],
  path: string,
) {
  if (!account || isDemo(account) || account.suspendedAt) return Promise.resolve(true)
  if (kind !== "account" && account.mailOff?.includes(kind)) return Promise.resolve(true)
  return deliver(account, kind, subject, lines, path)
}

function deliver(account: Account, kind: MailKind | "account", subject: string, lines: string[], path: string) {
  const say = (text: string) => translate(text, account.language ?? "ko")
  const site = config.siteUrl?.replace(/\/$/, "")
  const text = [
    ...lines.map(say),
    ...(site ? ["", `${say("바로 가기")}: ${site}${path}`] : []),
    // 이 종류를 끄는 곳.
    ...(site && kind !== "account" ? [`${say("받을 메일 바꾸기")}: ${site}/me`] : []),
    "",
    "uniconnect",
  ].join("\n")
  const sending = sendMail(account.email, `[uniconnect] ${say(subject)}`, text).then(
    () => true,
    (error: Error) => {
      console.error(`[mail] notice "${subject}": ${error.message}`)
      return false
    },
  )
  waitUntil(sending)
  return sending
}

// 이용을 제한했다고 알린다(약관의 이용 제한과 탈퇴). 정지된 계정에 보내는 유일한
// 메일이며, 저장한 뒤에 부른다. 실제로 메일을 보냈을 때만 true라서, false면
// 운영자가 직접 알려야 한다.
export async function notifySuspended(account: Account, reason: string) {
  if (!mailConfigured()) return false
  const appeal = config.supportEmail
    ? `이의가 있으면 ${config.supportEmail}으로 알려 주세요.`
    : "이의가 있으면 이 메일에 답장해 주세요."
  return deliver(
    account,
    "account",
    "계정 이용이 제한됐어요",
    ["운영자가 계정 이용을 제한했어요. 로그인할 수 없고, 다른 회원에게 보이지 않아요.", `사유: ${translate(reason, account.language ?? "ko")}`, appeal],
    "/",
  )
}

// 제한을 풀었다고 알린다.
export const notifyRestored = (account: Account) =>
  notify(account, "account", "계정 이용 제한이 풀렸어요", ["운영자가 계정 이용 제한을 풀었어요. 다시 로그인할 수 있어요."], "/")
