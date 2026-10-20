import { hashPassword } from "../lib/password.js"
import type { Account, Database, Match, MetricEntry, MetricKind, Report } from "../types.js"

// Demo accounts for trying the app. Both use DEMO_PASSWORD (see README).
export const DEMO_PASSWORD = "uniconnect2026"

// Brands student groups can browse. score is the match for the demo group's
// event; popularity counts sponsorships this semester.
export const seedBrands: Match[] = [
  {
    id: "afternoon-coffee",
    name: "오후의 커피",
    category: "카페 · 식음료",
    industry: "cafe",
    offer: "쿠폰 150장 + 현금 20만원",
    score: 94,
    tags: ["대학생 선호", "반경 1.2km"],
    popularity: 32,
  },
  {
    id: "moment-studio",
    name: "모먼트 스튜디오",
    category: "사진 · 콘텐츠",
    industry: "photo",
    offer: "행사 스냅 촬영 전체",
    score: 88,
    tags: ["공연 특화", "재협찬 높음"],
    popularity: 19,
  },
  {
    id: "freshon",
    name: "프레시온",
    category: "웰니스 · F&B",
    industry: "wellness",
    offer: "에너지 드링크 200개",
    score: 83,
    tags: ["현물 협찬", "20대 타깃"],
    popularity: 24,
  },
  {
    id: "glowlab",
    name: "글로우랩",
    category: "뷰티 · 화장품",
    industry: "beauty",
    offer: "립밤 샘플 300개 + 부스 운영",
    score: 82,
    tags: ["샘플링", "SNS 이벤트"],
    popularity: 41,
  },
  {
    id: "brewing-lab",
    name: "브루잉랩",
    category: "카페 · 디저트",
    industry: "cafe",
    offer: "음료 쿠폰 100장",
    score: 80,
    tags: ["캠퍼스 근처", "신메뉴 홍보"],
    popularity: 37,
  },
  {
    id: "runup-sports",
    name: "런업 스포츠",
    category: "스포츠 · 러닝",
    industry: "sports",
    offer: "러닝 양말 120켤레",
    score: 79,
    tags: ["체육대회", "현물 협찬"],
    popularity: 18,
  },
  {
    id: "studymate",
    name: "스터디메이트",
    category: "교육 · 스터디",
    industry: "education",
    offer: "스터디 플래너 150권",
    score: 77,
    tags: ["시험기간", "학습 지원"],
    popularity: 29,
  },
  {
    id: "film-log",
    name: "필름로그",
    category: "사진 · 포토부스",
    industry: "photo",
    offer: "포토부스 1일 운영",
    score: 76,
    tags: ["축제 인기", "현장 체험"],
    popularity: 35,
  },
  {
    id: "greenday",
    name: "그린데이 샐러드",
    category: "샐러드 · 건강식",
    industry: "wellness",
    offer: "샐러드 쿠폰 80장",
    score: 74,
    tags: ["건강식", "20대 여성"],
    popularity: 15,
  },
  {
    id: "mood-salon",
    name: "무드살롱",
    category: "헤어 · 뷰티",
    industry: "beauty",
    offer: "공연 헤어 스타일링 20명",
    score: 71,
    tags: ["공연 메이크업", "현장 서비스"],
    popularity: 22,
  },
  {
    id: "clip-studio",
    name: "클립스튜디오",
    category: "영상 · 콘텐츠",
    industry: "content",
    offer: "행사 하이라이트 영상 제작",
    score: 70,
    tags: ["영상 제작", "SNS 업로드"],
    popularity: 12,
  },
  {
    id: "english-up",
    name: "잉글리시업",
    category: "교육 · 어학",
    industry: "education",
    offer: "어학 강의 수강권 30장",
    score: 68,
    tags: ["경품", "어학 지원"],
    popularity: 9,
  },
]

const studentGroups: Match[] = [
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
]

// The last few records of each measurement at the busking day (KST).
export function seedMetricLog(): MetricEntry[] {
  const records: [MetricKind, number, string, string][] = [
    ["scans", 123, "2026-10-12T19:41:00+09:00", "정문 부스 QR"],
    ["scans", 124, "2026-10-12T19:44:00+09:00", "공연장 입구 QR"],
    ["scans", 125, "2026-10-12T19:48:00+09:00", "정문 부스 QR"],
    ["scans", 126, "2026-10-12T19:52:00+09:00", "공연장 입구 QR"],
    ["scans", 127, "2026-10-12T19:57:00+09:00", "정문 부스 QR"],
    ["scans", 128, "2026-10-12T20:03:00+09:00", "공연장 입구 QR"],
    ["coupons", 89, "2026-10-12T19:46:00+09:00", "아메리카노 1+1 쿠폰"],
    ["coupons", 90, "2026-10-12T19:50:00+09:00", "아메리카노 1+1 쿠폰"],
    ["coupons", 91, "2026-10-12T19:55:00+09:00", "디저트 20% 할인 쿠폰"],
    ["coupons", 92, "2026-10-12T19:59:00+09:00", "아메리카노 1+1 쿠폰"],
    ["coupons", 93, "2026-10-12T20:04:00+09:00", "디저트 20% 할인 쿠폰"],
    ["coupons", 94, "2026-10-12T20:08:00+09:00", "아메리카노 1+1 쿠폰"],
    ["visits", 36, "2026-10-13T12:20:00+09:00", "오후의 커피 공릉점"],
    ["visits", 37, "2026-10-13T15:05:00+09:00", "오후의 커피 공릉점"],
    ["visits", 38, "2026-10-14T11:42:00+09:00", "오후의 커피 공릉점"],
    ["visits", 39, "2026-10-14T18:30:00+09:00", "오후의 커피 공릉점"],
    ["visits", 40, "2026-10-15T13:10:00+09:00", "오후의 커피 공릉점"],
    ["visits", 41, "2026-10-16T16:25:00+09:00", "오후의 커피 공릉점"],
  ]
  return records
    .map(([kind, number, at, detail]) => ({
      id: `seed-${kind}-${number}`,
      kind,
      at: new Date(at).toISOString(),
      participant: `참여자 #${number}`,
      detail,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

export const seedReport: Report = {
  eventName: "가을 버스킹 데이",
  eventDate: "2026-10-12",
  expectedAudience: 350,
  sponsorValue: 680000,
  reach: 1240,
  roas: 243,
  targets: {
    reach: 1100,
    scans: 105,
    coupons: 75,
    visits: 26,
    qrRate: 30,
    visitRate: 25,
    roas: 170,
  },
  hourlyScans: [
    { hour: 17, scans: 12 },
    { hour: 18, scans: 26 },
    { hour: 19, scans: 38 },
    { hour: 20, scans: 29 },
    { hour: 21, scans: 15 },
    { hour: 22, scans: 8 },
  ],
  valueBreakdown: [
    { type: "현금", value: 200000 },
    { type: "제품", value: 330000 },
    { type: "서비스", value: 150000 },
  ],
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
    matches: {
      학생단체: structuredClone(seedBrands).sort((a, b) => b.score - a.score).slice(0, 3),
      브랜드: studentGroups,
    },
    brands: structuredClone(seedBrands),
    events: {
      [muse.id]: [
        {
          id: "event-muse-concert",
          name: "2026 뮤즈 종강 공연",
          date: "2026-11-27",
          people: "120명",
          types: ["현금", "제품"],
          status: "매칭 중",
          createdAt,
        },
        {
          id: "event-busking-day",
          name: "가을 버스킹 데이",
          date: "2026-10-12",
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
          date: "2026-11-14",
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
    metricLog: seedMetricLog(),
    report: structuredClone(seedReport),
  }
}
