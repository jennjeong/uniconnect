import { t } from "../i18n"

// 새 비밀번호가 따르는 규칙. backend/src/lib/validation.ts의 checkPassword가
// 가진 규칙과 같다 (lib/lists.sync.test.ts가 일치를 검사한다): 영문자, 숫자,
// 기호를 갖춘 8자 이상. 128자를 넘으면 해시 비용 때문에 서버가 받지 않지만,
// 조건으로 보이지는 않는다.
export const passwordMaxLength = 128

export function passwordRules(password: string) {
  return [
    { label: t("8자 이상"), ok: password.length >= 8 },
    { label: t("영문"), ok: /[A-Za-z]/.test(password) },
    { label: t("숫자"), ok: /\d/.test(password) },
    { label: t("특수문자"), ok: /[!-/:-@[-`{-~]/.test(password) },
  ]
}

// 새 비밀번호의 문제점을 서버의 표현으로 돌려준다. 모든 규칙을 지켰다면 "".
export function passwordProblem(password: string) {
  if (password.length < 8) return t("비밀번호는 8자 이상으로 정해 주세요.")
  if (password.length > passwordMaxLength) return t("비밀번호가 너무 길어요.")
  if (passwordRules(password).some((rule) => !rule.ok)) return t("비밀번호에 영문, 숫자, 특수문자를 모두 넣어 주세요.")
  return ""
}
