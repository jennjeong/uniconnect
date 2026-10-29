import type { AccountContact, MailKind, Role } from "../types.js"
import { HttpError } from "./errors.js"

// Keep in sync with accountTypeGroups in frontend/src/data/roles.ts, which
// shows them in groups in this order.
export const accountTypes: Record<Role, string[]> = {
  학생단체: [
    "총학생회",
    "단과대 학생회",
    "학과 학생회",
    "축제 · 행사 기획단",
    "공연 동아리",
    "밴드 · 음악 동아리",
    "댄스 동아리",
    "연극 · 뮤지컬 동아리",
    "사진 · 영상 동아리",
    "학술 동아리",
    "창업 · 경영 동아리",
    "국제교류 · 어학 동아리",
    "언론 · 방송 동아리",
    "봉사 동아리",
    "스포츠 동아리",
    "게임 · e스포츠 동아리",
    "종교 동아리",
    "연합 동아리",
    "서포터즈 · 홍보대사",
    "기타",
  ],
  브랜드: [
    "카페 · 식음료",
    "베이커리 · 디저트",
    "음식점",
    "주점 · 펍",
    "편의점 · 마트",
    "뷰티 · 화장품",
    "헤어 · 네일",
    "패션 · 의류",
    "사진 · 스튜디오",
    "콘텐츠 · 미디어",
    "게임 · 엔터테인먼트",
    "IT · 앱 서비스",
    "교육 · 학원",
    "출판 · 문구",
    "문화 · 공연",
    "스포츠 · 피트니스",
    "헬스케어 · 웰니스",
    "여행 · 숙박",
    "금융 · 보험",
    "생활용품 · 리빙",
    "기타",
  ],
}

// Account types from before the lists grew, and what they became.
export const renamedAccountTypes: Record<string, string> = {
  학생회: "총학생회",
  "뷰티 · 패션": "뷰티 · 화장품",
  "스포츠 · 웰니스": "스포츠 · 피트니스",
  교육: "교육 · 학원",
}

// A new password (sign-up, a reset, a change): 8 to 64 characters with an
// English letter, a number and a symbol, and no spaces. The forms list the
// same rules as the password is typed (frontend lib/password.ts;
// lists.sync.test.ts checks they agree).
export function checkPassword(password: string) {
  if (password.length < 8 || password.length > 64) {
    throw new HttpError(400, "비밀번호는 8자에서 64자 사이로 정해 주세요.")
  }
  if (/\s/.test(password)) throw new HttpError(400, "비밀번호에는 공백을 넣을 수 없어요.")
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[!-/:-@[-`{-~]/.test(password)) {
    throw new HttpError(400, "비밀번호에 영문, 숫자, 특수문자를 모두 넣어 주세요.")
  }
  return password
}

// The person running an account: name, position and a mobile number,
// stored as 010-1234-5678.
export function parseContact(input: unknown): AccountContact {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const name = text(value.name)
  const position = text(value.position)
  const digits = text(value.phone).replace(/\D/g, "")
  if (!name) throw new HttpError(400, "담당자 이름을 입력해 주세요.")
  if (name.length > 20) throw new HttpError(400, "담당자 이름은 20자 이하로 입력해 주세요.")
  if (!position) throw new HttpError(400, "직책을 입력해 주세요.")
  if (position.length > 20) throw new HttpError(400, "직책은 20자 이하로 입력해 주세요.")
  if (!/^01[016789]\d{7,8}$/.test(digits)) {
    throw new HttpError(400, "휴대폰 번호를 010-1234-5678처럼 입력해 주세요.")
  }
  const middle = digits.length === 11 ? 7 : 6
  return { name, position, phone: `${digits.slice(0, 3)}-${digits.slice(3, middle)}-${digits.slice(middle)}` }
}

// Fixed facts each side's listing can fill in from 내 정보.
// Keep in sync with frontend/src/data/profile.ts.
export const factLabels: Record<Role, string[]> = {
  학생단체: ["회원 수", "주요 활동", "행사 규모", "활동 기간"],
  브랜드: ["위치", "제공 서비스", "선호 행사", "평균 응답"],
}

export const snsPlatforms = ["인스타그램", "유튜브", "틱톡", "블로그", "웹사이트", "기타"]

// "기타" comes with a free-text typeNote on the event.
export const sponsorTypes = ["현금", "제품", "서비스", "기타"]

// Kinds of question for the operators. Keep in sync with
// frontend/src/data/inquiries.ts.
// Why a member reports another (routes/reports.ts); frontend/src/data/reports.ts.
export const reportReasons = ["스팸 · 광고", "욕설 · 괴롭힘", "사기 의심", "기타"]

// The kinds of notice email, in the order 내 정보 lists them
// (frontend/src/data/mail.ts; lib/lists.sync.test.ts checks).
export const mailKinds: MailKind[] = ["proposals", "sponsorships", "messages", "reminders"]

export const inquiryCategories = ["이용 방법", "계정 · 가입", "제안 · 매칭", "오류 신고", "기타"]

// Kinds of shop students can look for around their campus: Kakao Local's
// category group codes (카페, 음식점, 편의점, 학원, 문화시설). Keep in sync
// with frontend/src/data/places.ts.
export const placeCategories = ["CE7", "FD6", "CS2", "AC5", "CT1"]

// Tags a sponsorship review may pick, by the side it is about (frontend
// data/reviews.ts shows the same).
export const reviewTags: Record<Role, string[]> = {
  브랜드: ["약속을 잘 지켜요", "응답이 빨라요", "협찬 물품이 좋아요", "매장 응대가 친절해요", "다시 함께하고 싶어요"],
  학생단체: ["약속을 잘 지켜요", "응답이 빨라요", "홍보를 잘해요", "성과 공유가 꼼꼼해요", "다시 함께하고 싶어요"],
}

export function parseRole(value: unknown): Role {
  if (value === "학생단체" || value === "브랜드") return value
  throw new HttpError(400, "회원 유형을 선택해 주세요.")
}

export const text = (value: unknown) => String(value ?? "").trim()
