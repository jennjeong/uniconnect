import { config } from "../config.js"
import { HttpError } from "./errors.js"

const subjects = {
  signup: "[uniconnect] 회원가입 인증번호",
  reset: "[uniconnect] 비밀번호 재설정 인증번호",
}

// Sends a 6-digit code by email through Resend (https://resend.com) once
// RESEND_API_KEY and MAIL_FROM are set; until then it only goes to the
// server log. Another service would replace the fetch below.
export async function sendVerificationCode(email: string, code: string, purpose: "signup" | "reset" = "signup") {
  if (!config.resendApiKey || !config.mailFrom) {
    console.log(`[mail] ${email} 인증번호 ${code}`)
    return
  }
  const lines = [
    `uniconnect ${purpose === "signup" ? "회원가입" : "비밀번호 재설정"} 인증번호는 ${code} 입니다.`,
    "3분 안에 입력해 주세요. 요청한 적이 없다면 이 메일은 무시해 주세요.",
  ]
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.mailFrom, to: [email], subject: subjects[purpose], text: lines.join("\n") }),
  }).catch(() => undefined)
  if (!response?.ok) {
    console.error(`[mail] Resend answered ${response?.status ?? "no response"} for a ${purpose} code`)
    throw new HttpError(502, "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.")
  }
}

export const mailConfigured = () => Boolean(config.resendApiKey && config.mailFrom)
