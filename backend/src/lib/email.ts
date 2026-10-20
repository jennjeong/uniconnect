import type { Role } from "../types.js"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const freeMailDomains = new Set([
  "gmail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "nate.com",
  "yahoo.com",
  "yahoo.co.kr",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
])

const isSchoolDomain = (domain: string) =>
  domain.endsWith(".ac.kr") || /\.edu(\.[a-z]{2})?$/.test(domain)

export const normalizeEmail = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()

// Student groups must use a school address; sponsors a company address.
export function emailRuleError(role: Role, email: string) {
  if (!emailPattern.test(email)) return "이메일 형식을 확인해 주세요."
  const domain = email.split("@")[1]
  if (role === "학생단체") {
    return isSchoolDomain(domain)
      ? ""
      : "학교 이메일(예: name@syu.ac.kr)로 인증해 주세요."
  }
  if (freeMailDomains.has(domain)) {
    return "개인 메일은 사용할 수 없어요. 회사 이메일로 인증해 주세요."
  }
  if (isSchoolDomain(domain)) {
    return "학교 이메일은 '협찬 받기'로 가입해 주세요."
  }
  return ""
}
