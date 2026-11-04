import type { AccountContact, MailKind, Role } from "../types.js"
import { HttpError } from "./errors.js"

// frontend/src/data/roles.ts의 accountTypeGroups와 맞춰 둔다. 거기서
// 이 순서대로 묶어 보여 준다.
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

// 목록이 늘기 전의 계정 유형과 그 뒤 바뀐 이름.
export const renamedAccountTypes: Record<string, string> = {
  학생회: "총학생회",
  "뷰티 · 패션": "뷰티 · 화장품",
  "스포츠 · 웰니스": "스포츠 · 피트니스",
  교육: "교육 · 학원",
}

// 새 비밀번호(가입, 재설정, 변경)는 8~64자에 영문, 숫자, 기호가 들어가고
// 공백이 없어야 한다. 입력하는 동안 폼이 같은 규칙을 보여 준다(frontend
// lib/password.ts, lists.sync.test.ts가 둘이 같은지 검사한다).
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

// 계정을 운영하는 사람: 이름, 직책, 휴대폰 번호(010-1234-5678로 저장).
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

// 각 측의 리스팅이 내 정보에서 채울 수 있는 고정 항목.
// frontend/src/data/profile.ts와 맞춰 둔다.
export const factLabels: Record<Role, string[]> = {
  학생단체: ["회원 수", "주요 활동", "행사 규모", "활동 기간"],
  브랜드: ["위치", "제공 서비스", "선호 행사", "평균 응답"],
}

export const snsPlatforms = ["인스타그램", "유튜브", "틱톡", "블로그", "웹사이트", "기타"]

// 브랜드가 프로필에서 고르는 제공 항목(몇 개든 가능). frontend/src/data/
// profile.ts의 brandOffers와 맞춰 둔다.
export const brandOffers = [
  "현금 후원",
  "제품 협찬",
  "음료 · 식품",
  "할인 쿠폰",
  "시음 · 샘플링",
  "굿즈 · 경품",
  "매장 공간 대관",
  "부스 운영",
  "촬영 · 디자인",
  "SNS 홍보",
]

// "기타"에는 행사의 자유 입력 typeNote가 따른다.
export const sponsorTypes = ["현금", "제품", "서비스", "기타"]

// 운영자에게 하는 문의의 종류. frontend/src/data/inquiries.ts와 맞춰 둔다.
// 회원이 다른 회원을 신고하는 이유(routes/reports.ts), frontend/src/data/reports.ts.
export const reportReasons = ["스팸 · 광고", "욕설 · 괴롭힘", "사기 의심", "기타"]

// 알림 이메일의 종류. 내 정보가 나열하는 순서다(frontend/src/data/mail.ts,
// lib/lists.sync.test.ts가 검사한다).
export const mailKinds: MailKind[] = ["proposals", "sponsorships", "messages", "reminders", "digest"]

export const inquiryCategories = ["이용 방법", "계정 · 가입", "제안 · 매칭", "오류 신고", "기타"]

// 학생이 캠퍼스 주변에서 찾을 수 있는 가게 종류. Kakao Local의 카테고리
// 그룹 코드(카페, 음식점, 편의점, 학원, 문화시설)이며 frontend/src/data/
// places.ts와 맞춰 둔다.
export const placeCategories = ["CE7", "FD6", "CS2", "AC5", "CT1"]

// 협찬 후기가 고를 수 있는 태그. 후기 대상이 되는 쪽별로 나눈다(frontend
// data/reviews.ts도 같다).
export const reviewTags: Record<Role, string[]> = {
  브랜드: ["약속을 잘 지켜요", "응답이 빨라요", "협찬 물품이 좋아요", "매장 응대가 친절해요", "다시 함께하고 싶어요"],
  학생단체: ["약속을 잘 지켜요", "응답이 빨라요", "홍보를 잘해요", "성과 공유가 꼼꼼해요", "다시 함께하고 싶어요"],
}

export function parseRole(value: unknown): Role {
  if (value === "학생단체" || value === "브랜드") return value
  throw new HttpError(400, "회원 유형을 선택해 주세요.")
}

export const text = (value: unknown) => String(value ?? "").trim()

// 체크인 페이지에서 참가자에게 묻는 선택 질문 셋. 행사의 상세 리포트에 집계
// 한다(frontend data/survey.ts와 같아야 하며 lists.sync.test.ts가 검사한다).
export const surveyOptions = {
  grade: ["1학년", "2학년", "3학년", "4학년 이상", "대학원생", "졸업생 · 기타"],
  field: ["인문 · 사회", "경영 · 경제", "자연 · 공학", "의약 · 보건", "예체능", "교육", "기타"],
  visited: ["처음이에요", "가 본 적 있어요", "잘 모르겠어요"],
  gender: ["여성", "남성", "밝히고 싶지 않아요"],
} as const

// 협찬 물품을 보낼 수 있는 택배사(협찬 물품 배송). 앱도 같은 목록을 쓴다
// (frontend data/carriers.ts).
export const carriers = ["CJ대한통운", "우체국택배", "한진택배", "롯데택배", "로젠택배", "경동택배", "대신택배", "편의점택배", "기타"] as const

// 학생 단체가 여는 행사의 종류(frontend data/eventDetails.ts도 같고
// lists.sync.test.ts가 검사한다)와 오는 사람.
export const eventKinds = ["축제", "체육대회", "MT · OT", "간식 행사", "세미나 · 강연", "네트워킹", "공모전 · 해커톤", "졸업 전시 · 패션쇼", "총회", "공연", "기타"] as const
export const audienceYears = ["1학년", "2학년", "3학년", "4학년", "대학원생", "졸업생 · 동문", "교직원", "지역 주민"] as const

// 단체가 행사에서 브랜드에 주는 것(홍보 · 배포 계획): 로고가 보이는 곳,
// 물품이 사람들에게 가는 방법, 올리는 게시물(frontend data/eventDetails.ts도
// 같고 lists.sync.test.ts가 검사한다).
export const logoSpots = ["행사 포스터", "현수막", "부스 배너", "SNS 카드뉴스", "SNS 릴스 · 숏폼", "행사 안내 자료", "무대 · 스크린 소개"] as const
export const handoutWays = ["운영진이 직접 배포", "부스 방문자에게 증정", "이벤트 참여자에게 증정", "선착순 배포", "추첨 당첨자에게 증정"] as const
export const promoPosts = ["협찬 게시물 1회", "협찬 게시물 2회", "릴스 · 숏폼 영상", "행사 전 SNS 사전 홍보", "행사 당일 스토리", "행사 후 후기 게시물", "브랜드 계정 태그"] as const
