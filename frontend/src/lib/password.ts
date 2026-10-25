import { t } from "../i18n"

// The rules a new password follows, as checkPassword in
// backend/src/lib/validation.ts holds them (lib/lists.sync.test.ts checks
// they agree): 8 to 64 characters with an English letter, a number and a
// symbol, and no spaces.
export function passwordRules(password: string) {
  return [
    { label: t("8~64자"), ok: password.length >= 8 && password.length <= 64 },
    { label: t("영문"), ok: /[A-Za-z]/.test(password) },
    { label: t("숫자"), ok: /\d/.test(password) },
    { label: t("특수문자"), ok: /[!-/:-@[-`{-~]/.test(password) },
    { label: t("공백 없음"), ok: password.length > 0 && !/\s/.test(password) },
  ]
}

// What is wrong with a new password, in the server's words, or "" when it
// follows every rule.
export function passwordProblem(password: string) {
  if (password.length < 8 || password.length > 64) return t("비밀번호는 8자에서 64자 사이로 정해 주세요.")
  if (/\s/.test(password)) return t("비밀번호에는 공백을 넣을 수 없어요.")
  if (passwordRules(password).some((rule) => !rule.ok)) return t("비밀번호에 영문, 숫자, 특수문자를 모두 넣어 주세요.")
  return ""
}
