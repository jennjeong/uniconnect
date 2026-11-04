import { t } from "../i18n"

// 새 비밀번호가 따르는 규칙. backend/src/lib/validation.ts의 checkPassword가
// 가진 규칙과 같다 (lib/lists.sync.test.ts가 일치를 검사한다): 영문자, 숫자,
// 기호를 갖춘 8~64자이고 공백이 없어야 한다.
export function passwordRules(password: string) {
  return [
    { label: t("8~64자"), ok: password.length >= 8 && password.length <= 64 },
    { label: t("영문"), ok: /[A-Za-z]/.test(password) },
    { label: t("숫자"), ok: /\d/.test(password) },
    { label: t("특수문자"), ok: /[!-/:-@[-`{-~]/.test(password) },
    { label: t("공백 없음"), ok: password.length > 0 && !/\s/.test(password) },
  ]
}

// 새 비밀번호의 문제점을 서버의 표현으로 돌려준다. 모든 규칙을 지켰다면 "".
export function passwordProblem(password: string) {
  if (password.length < 8 || password.length > 64) return t("비밀번호는 8자에서 64자 사이로 정해 주세요.")
  if (/\s/.test(password)) return t("비밀번호에는 공백을 넣을 수 없어요.")
  if (passwordRules(password).some((rule) => !rule.ok)) return t("비밀번호에 영문, 숫자, 특수문자를 모두 넣어 주세요.")
  return ""
}
