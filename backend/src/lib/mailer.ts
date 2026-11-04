import { config } from "../config.js"
import { HttpError } from "./errors.js"
import { translate, type Lang } from "./i18n.js"

// Resend(https://resend.com)에 이메일 한 통을 보낸다. 테스트는 `post`를 바꿔
// 보내지 않고 나갈 내용을 확인한다.
export const mailTransport = {
  post: (body: { from: string; to: string[]; subject: string; text: string }) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
}

export const mailConfigured = () => Boolean(config.resendApiKey && config.mailFrom)

// RESEND_API_KEY와 MAIL_FROM이 있으면 이메일을 보낸다. 없으면 서버 로그에만
// 남긴다. Resend가 거절하면 던진다.
export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) {
    console.log(`[mail] ${to} · ${subject}`)
    return
  }
  const response = await mailTransport
    .post({ from: config.mailFrom!, to: [to], subject, text })
    .catch(() => undefined)
  if (!response?.ok) throw new Error(`Resend answered ${response?.status ?? "no response"}`)
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
    console.log(`[mail] ${email} 인증번호 ${code}`)
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
