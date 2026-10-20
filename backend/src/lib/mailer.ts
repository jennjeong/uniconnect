// Stand-in for a mail service. Swap the body for SMTP, Amazon SES, Resend, etc.
// once real emails should go out.
export async function sendVerificationCode(email: string, code: string) {
  console.log(`[mail] ${email} 인증번호 ${code}`)
}
