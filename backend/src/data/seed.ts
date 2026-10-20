import { hashPassword } from "../lib/password.js"
import type { Account, Database, Match } from "../types.js"

// Demo accounts for trying the app. Both use DEMO_PASSWORD (see README).
export const DEMO_PASSWORD = "uniconnect2026"

const matches: Database["matches"] = {
  학생단체: [
    {
      id: "afternoon-coffee",
      name: "오후의 커피",
      category: "카페 · 식음료",
      industry: "cafe",
      offer: "쿠폰 150장 + 현금 20만원",
      score: 94,
      tags: ["대학생 선호", "반경 1.2km"],
    },
    {
      id: "moment-studio",
      name: "모먼트 스튜디오",
      category: "사진 · 콘텐츠",
      industry: "photo",
      offer: "행사 스냅 촬영 전체",
      score: 88,
      tags: ["공연 특화", "재협찬 높음"],
    },
    {
      id: "freshon",
      name: "프레시온",
      category: "웰니스 · F&B",
      industry: "wellness",
      offer: "에너지 드링크 200개",
      score: 83,
      tags: ["현물 협찬", "20대 타깃"],
    },
  ] satisfies Match[],
  브랜드: [
    {
      id: "syu-muse",
      name: "삼육대 뮤즈",
      category: "공연 · 동아리",
      industry: "performance",
      offer: "관객 120명 · 교내 SNS 3개 채널",
      score: 96,
      tags: ["공연 특화", "11월 27일"],
    },
    {
      id: "nowon-creators",
      name: "노원 크리에이터스",
      category: "콘텐츠 · 연합회",
      industry: "content",
      offer: "콘텐츠 8편 · 예상 도달 4,200명",
      score: 91,
      tags: ["콘텐츠 제작", "20대 타깃"],
    },
    {
      id: "swu-runners",
      name: "서울여대 러너스",
      category: "스포츠 · 동아리",
      industry: "sports",
      offer: "참여자 80명 · 현장 부스 운영",
      score: 84,
      tags: ["웰니스", "현장 체험"],
    },
  ] satisfies Match[],
}

export async function createSeed(): Promise<Database> {
  const createdAt = new Date().toISOString()
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  const muse: Account = {
    id: "demo-muse",
    role: "학생단체",
    name: "삼육대 뮤즈",
    type: "공연 동아리",
    school: "삼육대학교",
    email: "muse@syu.ac.kr",
    passwordHash,
    termsAgreedAt: createdAt,
    createdAt,
  }
  const coffee: Account = {
    id: "demo-coffee",
    role: "브랜드",
    name: "오후의 커피",
    type: "카페 · 식음료",
    school: "",
    email: "hello@afternoon-coffee.kr",
    passwordHash,
    termsAgreedAt: createdAt,
    createdAt,
  }

  return {
    accounts: [muse, coffee],
    sessions: [],
    emailCodes: [],
    matches,
    events: {
      [muse.id]: [
        {
          id: "event-muse-concert",
          name: "2026 뮤즈 종강 공연",
          date: "2026. 11. 27.",
          people: "120명",
          types: ["현금", "제품"],
          status: "매칭 중",
          createdAt,
        },
        {
          id: "event-busking-day",
          name: "가을 버스킹 데이",
          date: "2026. 10. 12.",
          people: "160명",
          types: ["제품"],
          status: "측정 완료",
          createdAt,
        },
      ],
      [coffee.id]: [
        {
          id: "event-coffee-tasting",
          name: "가을 신메뉴 캠퍼스 시음회",
          date: "2026. 11. 14.",
          people: "300명",
          types: ["제품"],
          status: "집행 예정",
          createdAt,
        },
      ],
    },
    proposals: {
      [muse.id]: ["moment-studio"],
      [coffee.id]: [],
    },
    demoAccountIds: { 학생단체: muse.id, 브랜드: coffee.id },
    metrics: { scans: 128, coupons: 94, visits: 41 },
  }
}
