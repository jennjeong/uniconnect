import { randomUUID } from "node:crypto"
import { config } from "../config.js"
import { HttpError } from "./errors.js"
import { translate, type Lang } from "./i18n.js"

// Resend(https://resend.com)에 이메일 한 통을 보낸다. 테스트는 `post`를 바꿔
// 보내지 않고 나갈 내용을 확인한다.
// `key`는 Resend의 Idempotency-Key다. 다시 보낼 때 같은 키를 써서, 첫 요청이 사실
// 닿았어도 메일이 두 통 가지 않게 한다.
export const mailTransport = {
  post: (body: { from: string; to: string[]; subject: string; text: string }, key?: string) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    }),
}

// 답이 없거나 Resend가 잠시 받지 못할 때(429, 5xx) 한 번만 다시 보낸다. 주소나 내용이
// 틀린 거절(4xx)은 다시 보내도 같으므로 그대로 실패한다.
export const mailRetry = { waitMs: 800 }
const worthRetrying = (response: Response | undefined) => !response || response.status === 429 || response.status >= 500

// 메일 본문의 한 줄과 제목에 넣기 전에, 회원이 쓴 값(이름 등)의 줄바꿈과 제어 문자를 공백으로
// 바꾼다. 줄을 끼워 넣어 서비스가 보낸 안내처럼 보이게 하지 못하게 한다.
export const oneLine = (text: string) =>
  text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()

export const mailConfigured = () => Boolean(config.resendApiKey && config.mailFrom)

// 인증번호를 받는 사람에게 닿게 할 수 있는지: 메일이 설정됐거나, 개발용으로 화면에
// 코드를 보여 준다(EXPOSE_EMAIL_CODES). 둘 다 아니면 코드는 어디에도 닿지 않는다.
export const codesDeliverable = () => mailConfigured() || config.exposeEmailCodes

// 코드를 보낼 수 없으면 성공처럼 답하지 않고, 코드를 만들기 전에 멈춘다.
export function assertCodesDeliverable() {
  if (!codesDeliverable()) {
    throw new HttpError(503, "지금은 인증 메일을 보낼 수 없어요. 잠시 뒤에 다시 시도하거나 도움말 센터로 문의해 주세요.")
  }
}

// 이 API 복사본에서 마지막으로 메일을 보낸 결과다(설정 여부와 실제 발송을 나눠 보인다).
// 서버가 다시 켜지면 비고, 다른 복사본의 결과는 모른다. 주소나 내용은 남기지 않는다.
export const mailHealth: { lastSentAt?: string; lastFailedAt?: string; lastError?: string } = {}

// RESEND_API_KEY와 MAIL_FROM이 있으면 이메일을 보낸다. 없으면 서버 로그에만
// 남긴다. Resend가 거절하면 던진다.
export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) {
    console.log(config.isProduction ? "[mail] not configured: a mail wasn't sent" : `[mail] ${to} · ${subject}`)
    return
  }
  const body = { from: config.mailFrom!, to: [to], subject: oneLine(subject), text }
  const key = randomUUID()
  const send = () => mailTransport.post(body, key).catch(() => undefined)
  let response = await send()
  if (worthRetrying(response)) {
    await new Promise((resolve) => setTimeout(resolve, mailRetry.waitMs))
    response = await send()
  }
  if (!response?.ok) {
    mailHealth.lastFailedAt = new Date().toISOString()
    mailHealth.lastError = `Resend ${response?.status ?? "no response"}`
    throw new Error(`Resend answered ${response?.status ?? "no response"}`)
  }
  mailHealth.lastSentAt = new Date().toISOString()
}

const subjects = {
  signup: "[uniconnect] 회원가입 인증번호",
  reset: "[uniconnect] 비밀번호 재설정 인증번호",
  change: "[uniconnect] 로그인 이메일 변경 인증번호",
}

const actions = { signup: "회원가입", reset: "비밀번호 재설정", change: "로그인 이메일 변경" }

// 가입, 비밀번호 재설정, 새 로그인 이메일로 옮길 때 보내는 6자리 코드.
// 코드를 요청했을 때 앱이 보여 준 언어로 쓴다. 메일 서비스가 없으면 데모를
// 위해 코드를 포함해 서버 로그에 남긴다.
export async function sendVerificationCode(
  email: string,
  code: string,
  purpose: "signup" | "reset" | "change" = "signup",
  lang: Lang = "ko",
) {
  if (!mailConfigured()) {
    // 운영 환경의 로그에는 코드를 남기지 않는다. 로그를 읽는 사람이 쓸 수 있다.
    console.log(config.isProduction ? "[mail] not configured: a verification code wasn't sent" : `[mail] ${email} 인증번호 ${code}`)
    return
  }
  const say = (text: string) => translate(text, lang)
  const lines = [
    say(`uniconnect ${actions[purpose]} 인증번호는 ${code} 입니다.`),
    say("3분 안에 입력해 주세요. 요청한 적이 없다면 이 메일은 무시해 주세요."),
  ]
  try {
    await sendMail(email, say(subjects[purpose]), lines.join("\n"))
  } catch (error) {
    console.error(`[mail] ${purpose} code: ${(error as Error).message}`)
    throw new HttpError(502, "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.")
  }
}
