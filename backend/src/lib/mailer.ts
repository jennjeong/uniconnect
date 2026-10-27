import { config } from "../config.js"
import { HttpError } from "./errors.js"
import { translate, type Lang } from "./i18n.js"

// Posts one email to Resend (https://resend.com). Tests swap `post` to see
// what would go out without sending it.
export const mailTransport = {
  post: (body: { from: string; to: string[]; subject: string; text: string }) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
}

export const mailConfigured = () => Boolean(config.resendApiKey && config.mailFrom)

// Sends an email once RESEND_API_KEY and MAIL_FROM are set; until then it
// only goes to the server log. Throws when Resend refuses it.
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

// A 6-digit code for signing up, resetting a password or moving to a new
// login email, in the language the app was shown in when it was asked for.
// Without a mail service it goes to the server log, code included, for the
// demo.
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
