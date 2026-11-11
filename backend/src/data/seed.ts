import { addDays, todayInKorea } from "../lib/dates.js"
import { emptyVenueCounts } from "../lib/methods.js"
import { hashPassword } from "../lib/password.js"
import type {
  Account,
  AccountContact,
  BoardPost,
  Conversation,
  Database,
  Match,
  Measurement,
  MetricEntry,
  MetricKind,
  Review,
  Role,
  SponsorOffer,
  SponsorRequest,
  Sponsorship,
  SurveyCounts,
} from "../types.js"

// 앱을 써 보는 데모 계정. 둘 다 DEMO_PASSWORD를 쓴다(README 참고).
export const DEMO_PASSWORD = "uniconnect2026"

// 시드의 날짜는 이 날(한국)을 오늘로 삼아 적었다. 새로 만드는 데이터베이스(로컬, 테스트,
// e2e)는 모든 날짜를 실제 오늘까지 같은 날 수만큼 민다(store.ts의 loadDatabase). 그래서
// 언제 만들어도 다가오는 행사와 답을 기다리는 제안이 이 날과 같은 모습이다. 이미 있는
// 데이터베이스(운영)와 운영자의 예시 되돌리기(resetExamples)는 그대로 둔다.
export const seedToday = "2026-11-09"

// 오늘이 seedToday에서 며칠 지났는지.
export const seedShift = (now = new Date()) =>
  Math.round((Date.parse(`${todayInKorea(now)}T00:00:00Z`) - Date.parse(`${seedToday}T00:00:00Z`)) / (24 * 60 * 60 * 1000))

// "YYYY-MM-DD"와 그 날의 시각(Z나 +09:00 같은 시간대가 붙은 것)이다.
const datedValue = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/

// 시드 안의 모든 날짜와 시각을 days일 민다. 날짜 부분만 바꾸므로 시각과 시간대는 그대로다.
// 날짜가 아닌 글(이름, 설명)은 건드리지 않으므로 시드의 글에는 날짜를 적지 않는다.
export function shiftSeedDates<T>(value: T, days: number): T {
  if (days === 0) return value
  const walk = (item: unknown): unknown => {
    if (typeof item === "string") {
      const match = datedValue.exec(item)
      return match ? addDays(match[1], days) + (match[2] ?? "") : item
    }
    if (Array.isArray(item)) return item.map(walk)
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, walk(entry)]))
    return item
  }
  return walk(value) as T
}

// 데모 계정의 연락처. 계약서에 나온다. 010-0000 번호는 누구에게도 배정되지
// 않은 번호다.
export const demoContacts: Record<"학생단체" | "브랜드", AccountContact> = {
  학생단체: { name: "김뮤즈", position: "회장", phone: "010-0000-0000" },
  브랜드: { name: "이오후", position: "점장", phone: "010-0000-0001" },
}

// 학생 단체가 둘러볼 수 있는 브랜드. score는 데모 단체의 행사에 대한
// 매칭 점수이고 popularity는 이번 학기 협찬 수다.
export const seedBrands: Match[] = [
  {
    id: "afternoon-coffee",
    name: "오후의 커피",
    // 데모 매장 위치(대략). 캠퍼스와의 거리 계산용.
    location: { address: "서울 노원구 공릉역 2번 출구 앞", lat: 37.6256, lng: 127.0731 },
    category: "카페 · 식음료",
    industry: "cafe",
    offer: "쿠폰 150장 + 현금 20만원",
    offers: [{ kind: "할인 쿠폰", detail: "150장" }, { kind: "현금 후원", detail: "20만원" }, { kind: "시음 · 샘플링" }],
    score: 94,
    tags: ["대학생 선호", "반경 1.2km"],
    popularity: 32,
    intro: "공릉동 캠퍼스 앞에서 시작한 스페셜티 카페예요. 대학생 행사에 음료 쿠폰과 운영비를 함께 지원해 왔어요.",
    facts: [
      { label: "위치", value: "공릉역 2번 출구 · 캠퍼스에서 1.2km" },
      { label: "제공 서비스", value: "음료 쿠폰 · 현금 · 시음 부스" },
      { label: "선호 행사", value: "공연 · 축제 · 스터디" },
      { label: "평균 응답", value: "1일 이내" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@afternoon.coffee" },
    ],
    portfolio: [
      { title: "삼육대 뮤즈 가을 버스킹 데이 (2026.10)", detail: "쿠폰 150장 + 현금 20만원 · 추정 ROAS 243%" },
      { title: "서울여대 러너스 봄 캠퍼스 페스티벌 (2026.05)", detail: "완주 기념 음료 80잔 · 매장 방문 61명" },
    ],
  },
  {
    id: "moment-studio",
    name: "모먼트 스튜디오",
    // 데모 매장 위치(대략). 캠퍼스와의 거리 계산용.
    location: { address: "서울 노원구 노원역 인근", lat: 37.6551, lng: 127.0613 },
    category: "사진 · 콘텐츠",
    industry: "photo",
    offer: "행사 스냅 촬영 전체",
    score: 88,
    tags: ["공연 특화", "재협찬 높음"],
    popularity: 19,
    intro: "공연과 행사 스냅을 전문으로 하는 사진 스튜디오예요. 촬영본은 행사 다음 날까지 보내 드려요.",
    facts: [
      { label: "위치", value: "노원역 · 캠퍼스에서 2.4km" },
      { label: "제공 서비스", value: "행사 스냅 · 프로필 촬영" },
      { label: "선호 행사", value: "공연 · 졸업 행사" },
      { label: "평균 응답", value: "2일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@moment.studio" },
      { platform: "블로그", handle: "모먼트 촬영 후기" },
    ],
    portfolio: [
      { title: "광운대 무브먼트 여름 쇼케이스 (2026.08)", detail: "스냅 600컷 · 다음 날 전달" },
      { title: "과기대 졸업 전시 (2026.02)", detail: "졸업생 프로필 촬영 45명" },
    ],
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
    intro: "20대를 위한 에너지 드링크 브랜드예요. 시험 기간과 체육 행사에 현물 협찬을 자주 해요.",
    facts: [
      { label: "위치", value: "온라인 · 전국 배송" },
      { label: "제공 서비스", value: "에너지 드링크 · 시험 기간 키트" },
      { label: "선호 행사", value: "체육대회 · 시험 응원" },
      { label: "평균 응답", value: "3일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@freshon_kr" },
      { platform: "유튜브", handle: "프레시온 TV" },
    ],
    portfolio: [
      { title: "5개 대학 시험 응원 (2026.06)", detail: "에너지 드링크 1,200개 배부" },
      { title: "대학 연합 체육대회 (2026.05)", detail: "부스 운영 · 샘플 800개" },
    ],
  },
  {
    id: "glowlab",
    name: "글로우랩",
    // 데모 매장 위치(대략). 캠퍼스와의 거리 계산용.
    location: { address: "서울 성동구 성수동 팝업 매장", lat: 37.5446, lng: 127.0557 },
    category: "뷰티 · 화장품",
    industry: "beauty",
    offer: "립밤 샘플 300개 + 부스 운영",
    score: 82,
    tags: ["샘플링", "SNS 이벤트"],
    popularity: 41,
    intro: "비건 립밤과 스킨케어를 만드는 뷰티 브랜드예요. 축제 부스에서 샘플링 이벤트를 함께 운영해요.",
    facts: [
      { label: "위치", value: "성수동 · 팝업 운영" },
      { label: "제공 서비스", value: "샘플링 · 부스 운영 · SNS 이벤트" },
      { label: "선호 행사", value: "축제 · 플리마켓" },
      { label: "평균 응답", value: "2일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@glowlab.official" },
      { platform: "틱톡", handle: "@glowlab" },
    ],
    portfolio: [
      { title: "덕성여대 봄 축제 (2026.05)", detail: "샘플 500개 · 부스 방문 900명" },
      { title: "성수 팝업 대학생 체험단 (2026.03)", detail: "체험단 40명 · 후기 120건" },
    ],
  },
  {
    id: "brewing-lab",
    name: "브루잉랩",
    // 데모 매장 위치(대략). 캠퍼스와의 거리 계산용.
    location: { address: "서울 노원구 석계역 인근", lat: 37.6148, lng: 127.0657 },
    category: "카페 · 디저트",
    industry: "cafe",
    offer: "음료 쿠폰 100장",
    score: 80,
    tags: ["캠퍼스 근처", "신메뉴 홍보"],
    popularity: 37,
    intro: "직접 로스팅한 원두와 디저트를 파는 캠퍼스 근처 카페예요. 신메뉴가 나오면 학생 행사와 함께 홍보해요.",
    facts: [
      { label: "위치", value: "석계역 · 캠퍼스에서 1.8km" },
      { label: "제공 서비스", value: "음료 쿠폰 · 디저트 세트" },
      { label: "선호 행사", value: "스터디 · 소모임" },
      { label: "평균 응답", value: "1일 이내" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@brewinglab" },
    ],
    portfolio: [
      { title: "광운대 코드랩 해커톤 (2025.12)", detail: "야식 디저트 140세트" },
      { title: "신메뉴 시음 이벤트 (2026.09)", detail: "학생 280명 참여" },
    ],
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
    intro: "러닝화와 러닝 용품을 파는 스포츠 브랜드예요. 달리기 대회와 체육대회에 기념품을 지원해요.",
    facts: [
      { label: "위치", value: "온라인 · 전국 배송" },
      { label: "제공 서비스", value: "러닝 양말 · 기념품 · 페이스메이커" },
      { label: "선호 행사", value: "러닝 · 체육대회" },
      { label: "평균 응답", value: "3일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@runup.sports" },
      { platform: "기타", handle: "스트라바 런업 크루" },
    ],
    portfolio: [
      { title: "서울여대 러너스 여름 나이트 런 (2026.07)", detail: "양말 80켤레 · 페이스메이커 2명" },
      { title: "대학 연합 마라톤 (2026.04)", detail: "완주 기념품 300개" },
    ],
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
    intro: "대학생을 위한 스터디 플래너와 학습 앱을 만들어요. 시험 기간 행사와 학술 동아리를 주로 지원해요.",
    facts: [
      { label: "위치", value: "온라인" },
      { label: "제공 서비스", value: "스터디 플래너 · 앱 이용권" },
      { label: "선호 행사", value: "시험 응원 · 학술제" },
      { label: "평균 응답", value: "2일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@studymate_app" },
      { platform: "블로그", handle: "스터디메이트 공부법" },
    ],
    portfolio: [
      { title: "기말고사 응원 키트 (2026.06)", detail: "플래너 600권 배부" },
      { title: "학술제 경품 (2025.11)", detail: "앱 이용권 120장" },
    ],
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
    intro: "축제 현장에서 바로 인화되는 포토부스를 운영해요. 행사 로고를 넣은 프레임도 만들어 드려요.",
    facts: [
      { label: "위치", value: "서울 전 지역 출장" },
      { label: "제공 서비스", value: "포토부스 운영 · 로고 프레임 제작" },
      { label: "선호 행사", value: "축제 · 공연" },
      { label: "평균 응답", value: "2일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@filmlog.booth" },
    ],
    portfolio: [
      { title: "덕성여대 봄 축제 (2026.05)", detail: "현장 인화 1,800장" },
      { title: "삼육대 뮤즈 겨울 정기 공연 (2025.12)", detail: "공연 로고 프레임 제작" },
    ],
  },
  {
    id: "greenday",
    name: "그린데이 샐러드",
    // 데모 매장 위치(대략). 캠퍼스와의 거리 계산용.
    location: { address: "서울 노원구 공릉역 인근", lat: 37.6262, lng: 127.0745 },
    category: "샐러드 · 건강식",
    industry: "wellness",
    offer: "샐러드 쿠폰 80장",
    score: 74,
    tags: ["건강식", "20대 여성"],
    popularity: 15,
    intro: "샐러드와 건강식 도시락을 파는 매장이에요. 운동 동아리와 웰니스 행사에 쿠폰을 지원해요.",
    facts: [
      { label: "위치", value: "공릉역 · 캠퍼스에서 1.5km" },
      { label: "제공 서비스", value: "식사 쿠폰 · 도시락 케이터링" },
      { label: "선호 행사", value: "운동 · 웰니스" },
      { label: "평균 응답", value: "2일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@greenday_salad" },
    ],
    portfolio: [
      { title: "서울여대 러너스 가을 5K (2025.11)", detail: "완주자 샐러드 쿠폰 70장" },
      { title: "헬스 동아리 바디프로필 챌린지 (2026.04)", detail: "도시락 120개" },
    ],
  },
  {
    id: "mood-salon",
    name: "무드살롱",
    // 데모 매장 위치(대략). 캠퍼스와의 거리 계산용.
    location: { address: "서울 노원구 태릉입구역 인근", lat: 37.6178, lng: 127.075 },
    category: "헤어 · 뷰티",
    industry: "beauty",
    offer: "공연 헤어 스타일링 20명",
    score: 71,
    tags: ["공연 메이크업", "현장 서비스"],
    popularity: 22,
    intro: "공연 전 헤어와 메이크업을 맡아 주는 살롱이에요. 무대에 서는 단체에 현장 스타일링을 지원해요.",
    facts: [
      { label: "위치", value: "태릉입구역 · 캠퍼스에서 2.1km" },
      { label: "제공 서비스", value: "현장 헤어 · 메이크업 스타일링" },
      { label: "선호 행사", value: "공연 · 패션쇼" },
      { label: "평균 응답", value: "3일" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@mood.salon" },
    ],
    portfolio: [
      { title: "광운대 무브먼트 여름 쇼케이스 (2026.08)", detail: "무대 스타일링 18명" },
      { title: "대학 연합 패션쇼 (2025.11)", detail: "모델 스타일링 24명" },
    ],
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
    intro: "행사 하이라이트 영상을 만드는 영상 제작팀이에요. 완성 영상은 브랜드와 단체 SNS에 함께 올려요.",
    facts: [
      { label: "위치", value: "서울 전 지역 출장" },
      { label: "제공 서비스", value: "하이라이트 영상 · 숏폼 편집" },
      { label: "선호 행사", value: "공연 · 대회" },
      { label: "평균 응답", value: "4일" },
    ],
    sns: [
      { platform: "유튜브", handle: "클립스튜디오" },
      { platform: "인스타그램", handle: "@clip.studio" },
    ],
    portfolio: [
      { title: "과기대 소리샘 가을 정기 공연 (2026.09)", detail: "하이라이트 영상 조회 1.5만 회" },
      { title: "광운대 코드랩 해커톤 스케치 (2025.12)", detail: "숏폼 4편" },
    ],
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
    intro: "온라인 어학 강의 플랫폼이에요. 학술 행사와 대회 경품으로 수강권을 지원해요.",
    facts: [
      { label: "위치", value: "온라인" },
      { label: "제공 서비스", value: "강의 수강권 · 모의 토익" },
      { label: "선호 행사", value: "학술제 · 대회" },
      { label: "평균 응답", value: "2일" },
    ],
    sns: [
      { platform: "유튜브", handle: "잉글리시업" },
      { platform: "인스타그램", handle: "@englishup_kr" },
    ],
    portfolio: [
      { title: "학술제 경품 (2025.11)", detail: "수강권 30장" },
      { title: "대학 연합 모의 토익 (2026.03)", detail: "응시 210명" },
    ],
  },
]

// 브랜드가 둘러볼 수 있는 학생 단체. score는 데모 브랜드에 대한 매칭 점수다.
export const seedGroups: Match[] = [
  {
    id: "syu-muse",
    name: "삼육대 뮤즈",
    category: "공연 · 동아리",
    industry: "performance",
    school: "삼육대학교",
    offer: "관객 120명 · 교내 SNS 3개 채널",
    score: 96,
    tags: ["공연 특화", "정기 공연"],
    eventName: "2026 뮤즈 종강 공연",
    eventDate: "2026-11-27",
    audience: 120,
    intro: "삼육대학교 대표 밴드·보컬 동아리예요. 학기마다 정기 공연과 버스킹을 열어요.",
    facts: [
      { label: "회원 수", value: "42명" },
      { label: "주요 활동", value: "정기 공연 · 버스킹" },
      { label: "행사 규모", value: "회당 관객 120~160명" },
      { label: "활동 기간", value: "2014년부터" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@syu_muse", followers: "3,100명" },
      { platform: "유튜브", handle: "삼육대 뮤즈", followers: "1,400명" },
    ],
    portfolio: [
      { title: "가을 버스킹 데이 (2026.10)", detail: "오후의 커피 협찬 · 관객 160명 · QR 참여 128명" },
      { title: "봄 정기 공연 (2026.05)", detail: "관객 140명 · 공연 영상 조회 3,200회" },
    ],
  },
  {
    id: "nowon-creators",
    name: "노원 크리에이터스",
    category: "콘텐츠 · 연합회",
    industry: "content",
    school: "노원구 5개 대학 연합",
    offer: "콘텐츠 8편 · 예상 도달 4,200명",
    score: 91,
    tags: ["콘텐츠 제작", "20대 타깃"],
    eventName: "캠퍼스 브이로그 챌린지",
    eventDate: "2026-11-08",
    audience: 4200,
    intro: "노원구 5개 대학 학생이 모인 영상·콘텐츠 연합 동아리예요. 캠퍼스 브이로그와 숏폼을 만들어요.",
    facts: [
      { label: "회원 수", value: "65명" },
      { label: "주요 활동", value: "브이로그 · 숏폼 제작" },
      { label: "행사 규모", value: "콘텐츠당 평균 조회 5,000회" },
      { label: "활동 기간", value: "2021년부터" },
    ],
    sns: [
      { platform: "유튜브", handle: "노원 크리에이터스", followers: "1.2만 명" },
      { platform: "인스타그램", handle: "@nowon.creators", followers: "6,800명" },
    ],
    portfolio: [
      { title: "기말고사 응원 이벤트 (2026.06)", detail: "오후의 커피 협찬 · 쿠폰 사용 88장" },
      { title: "캠퍼스 맛집 지도 (2026.03)", detail: "숏폼 6편 · 누적 조회 4.1만 회" },
    ],
  },
  {
    id: "swu-runners",
    name: "서울여대 러너스",
    category: "스포츠 · 동아리",
    industry: "sports",
    school: "서울여자대학교",
    offer: "참여자 80명 · 현장 부스 운영",
    score: 84,
    tags: ["웰니스", "현장 체험"],
    eventName: "가을 캠퍼스 런 5K",
    eventDate: "2026-11-15",
    audience: 80,
    intro: "서울여자대학교 러닝 동아리예요. 매주 캠퍼스 러닝을 하고 계절마다 5K 대회를 열어요.",
    facts: [
      { label: "회원 수", value: "38명" },
      { label: "주요 활동", value: "주간 러닝 · 5K 대회" },
      { label: "행사 규모", value: "대회당 참가자 60~80명" },
      { label: "활동 기간", value: "2019년부터" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@swu_runners", followers: "1,800명" },
      { platform: "기타", handle: "스트라바 러너스 클럽", followers: "210명" },
    ],
    portfolio: [
      { title: "봄 캠퍼스 페스티벌 (2026.05)", detail: "오후의 커피 협찬 · 매장 방문 61명" },
      { title: "여름 나이트 런 (2026.07)", detail: "참가자 72명 · 완주율 96%" },
    ],
  },
  {
    id: "kw-movement",
    name: "광운대 무브먼트",
    category: "공연 · 댄스",
    industry: "performance",
    school: "광운대학교",
    offer: "관객 300명 · 공연 영상 송출",
    score: 82,
    tags: ["댄스 공연", "SNS 영상"],
    eventName: "겨울 댄스 쇼케이스",
    eventDate: "2026-11-21",
    audience: 300,
    intro: "광운대학교 스트리트 댄스 동아리예요. 쇼케이스 영상은 SNS에서 꾸준히 반응이 좋아요.",
    facts: [
      { label: "회원 수", value: "50명" },
      { label: "주요 활동", value: "쇼케이스 · 대회 출전" },
      { label: "행사 규모", value: "공연당 관객 250~300명" },
      { label: "활동 기간", value: "2012년부터" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@kw_movement", followers: "5,400명" },
      { platform: "유튜브", handle: "무브먼트 KW", followers: "8,900명" },
    ],
    portfolio: [
      { title: "여름 쇼케이스 (2026.08)", detail: "관객 280명 · 영상 조회 2.3만 회" },
      { title: "전국 대학 댄스 대회 (2026.05)", detail: "단체 부문 2위" },
    ],
  },
  {
    id: "dswu-council",
    name: "덕성여대 총학생회",
    category: "학생회 · 행사",
    industry: "performance",
    school: "덕성여자대학교",
    offer: "재학생 1,000명 · 간식 나눔 부스",
    score: 81,
    tags: ["대규모", "학생회 공식"],
    eventName: "학생회 간식 나눔 행사",
    eventDate: "2026-11-18",
    audience: 1000,
    intro: "덕성여자대학교 총학생회예요. 축제와 간식 나눔 같은 전교생 행사를 운영해요.",
    facts: [
      { label: "회원 수", value: "재학생 약 6,000명 대표" },
      { label: "주요 활동", value: "축제 · 복지 행사" },
      { label: "행사 규모", value: "행사당 1,000명 안팎" },
      { label: "활동 기간", value: "매년 선출 · 2026 학생회" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@dswu_council", followers: "4,200명" },
      { platform: "기타", handle: "카카오톡 채널 학생회 소식", followers: "3,000명" },
    ],
    portfolio: [
      { title: "봄 축제 (2026.05)", detail: "방문 3,500명 · 브랜드 부스 6곳" },
      { title: "시험 기간 간식 나눔 (2026.04)", detail: "간식 900개 배부" },
    ],
  },
  {
    id: "seoultech-band",
    name: "과기대 소리샘",
    category: "공연 · 밴드",
    industry: "performance",
    school: "서울과학기술대학교",
    offer: "관객 200명 · 공연 포스터 로고",
    score: 79,
    tags: ["밴드 공연", "연말"],
    eventName: "연말 밴드 공연",
    eventDate: "2026-12-05",
    audience: 200,
    intro: "서울과학기술대학교의 오래된 밴드 동아리예요. 연말 공연은 매년 객석이 가득 차요.",
    facts: [
      { label: "회원 수", value: "35명" },
      { label: "주요 활동", value: "정기 공연 · 합동 공연" },
      { label: "행사 규모", value: "공연당 관객 180~200명" },
      { label: "활동 기간", value: "1986년부터" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@seoultech_sorisaem", followers: "2,300명" },
    ],
    portfolio: [
      { title: "가을 정기 공연 (2026.09)", detail: "관객 190명 · 좌석 매진" },
      { title: "연합 밴드 페스티벌 (2026.06)", detail: "5개 대학 합동 공연" },
    ],
  },
  {
    id: "syu-nanum",
    name: "삼육대 나눔누리",
    category: "봉사 · 동아리",
    industry: "wellness",
    school: "삼육대학교",
    offer: "봉사자 50명 · 지역 홍보",
    score: 76,
    tags: ["사회공헌", "지역 연계"],
    eventName: "연탄 나눔 봉사",
    eventDate: "2026-11-29",
    audience: 50,
    intro: "지역 어르신과 아이들을 돕는 봉사 동아리예요. 겨울마다 연탄 나눔을 해요.",
    facts: [
      { label: "회원 수", value: "28명" },
      { label: "주요 활동", value: "연탄 나눔 · 교육 봉사" },
      { label: "행사 규모", value: "행사당 봉사자 40~50명" },
      { label: "활동 기간", value: "2010년부터" },
    ],
    sns: [
      { platform: "인스타그램", handle: "@syu_nanum", followers: "900명" },
      { platform: "블로그", handle: "나눔누리 활동 일지", followers: "월 1,200회 방문" },
    ],
    portfolio: [
      { title: "겨울 연탄 나눔 (2025.12)", detail: "연탄 3,000장 · 80가구" },
      { title: "어린이 과학 교실 (2026.07)", detail: "초등학생 60명" },
    ],
  },
  {
    id: "kw-code",
    name: "광운대 코드랩",
    category: "학술 · 스터디",
    industry: "education",
    school: "광운대학교",
    offer: "참가자 150명 · 해커톤 후원 노출",
    score: 73,
    tags: ["IT 학술", "해커톤"],
    eventName: "교내 해커톤",
    eventDate: "2026-12-12",
    audience: 150,
    intro: "광운대학교 개발 학술 동아리예요. 매년 교내 해커톤을 열고 팀 프로젝트를 발표해요.",
    facts: [
      { label: "회원 수", value: "45명" },
      { label: "주요 활동", value: "해커톤 · 스터디" },
      { label: "행사 규모", value: "행사당 참가자 120~150명" },
      { label: "활동 기간", value: "2017년부터" },
    ],
    sns: [
      { platform: "웹사이트", handle: "github.com/kw-codelab", followers: "저장소 40개" },
      { platform: "블로그", handle: "코드랩 기술 블로그", followers: "월 2,000회 방문" },
    ],
    portfolio: [
      { title: "교내 해커톤 (2025.12)", detail: "참가 138명 · 32팀" },
      { title: "AI 스터디 발표회 (2026.06)", detail: "발표 12팀" },
    ],
  },
]

// 데모 계정이 주고받은 메시지(KST). 노원 크리에이터스와 모먼트 스튜디오는
// 계정이 없어 그쪽은 기록일 뿐이다.
export function seedConversations(): Conversation[] {
  const at = (time: string) => new Date(time).toISOString()
  return [
    {
      id: "chat-muse-coffee",
      groupId: "syu-muse",
      brandId: "afternoon-coffee",
      messages: [
        {
          id: "msg-muse-1",
          from: "group",
          text: "안녕하세요! 이번 종강 공연에 협찬을 제안드리고 싶어요. 쿠폰은 공연 당일 현장에서 나눠 드리면 될까요?",
          at: at("2026-10-19T13:10:00+09:00"),
        },
        {
          id: "msg-coffee-1",
          from: "brand",
          text: "반가워요! 현장 배부도 좋고 QR로 받는 디지털 쿠폰이면 매장 방문까지 집계돼서 더 좋아요. 예상 관객은 몇 명인가요?",
          at: at("2026-10-19T15:42:00+09:00"),
        },
        {
          id: "msg-muse-2",
          from: "group",
          text: "120명 정도 예상하고 있어요. 공연 포스터와 영상에 로고도 넣어 드릴 수 있어요!",
          at: at("2026-10-19T16:05:00+09:00"),
        },
      ],
      readAt: { group: at("2026-10-19T16:05:00+09:00"), brand: at("2026-10-19T15:42:00+09:00") },
    },
    {
      id: "chat-nowon-coffee",
      groupId: "nowon-creators",
      brandId: "afternoon-coffee",
      messages: [
        {
          id: "msg-nowon-1",
          from: "group",
          text: "브이로그에 매장 방문 장면을 넣어도 될까요? 촬영하기 좋은 시간대가 궁금해요.",
          at: at("2026-10-18T11:20:00+09:00"),
        },
        {
          id: "msg-coffee-2",
          from: "brand",
          text: "평일 오후 2~5시가 한산해서 촬영하기 좋아요. 미리 알려 주시면 자리를 마련해 둘게요.",
          at: at("2026-10-18T14:02:00+09:00"),
        },
      ],
      readAt: { group: at("2026-10-18T14:02:00+09:00"), brand: at("2026-10-18T14:02:00+09:00") },
    },
    {
      id: "chat-muse-moment",
      groupId: "syu-muse",
      brandId: "moment-studio",
      messages: [
        {
          id: "msg-muse-3",
          from: "group",
          text: "종강 공연 스냅 촬영 협찬이 가능한지 문의드려요. 공연은 2시간 정도예요.",
          at: at("2026-10-17T10:30:00+09:00"),
        },
      ],
      readAt: { group: at("2026-10-17T10:30:00+09:00") },
    },
  ]
}

// 지난 협찬의 후기로 상세 페이지에 보여 준다(KST). 계약서보다 앞선 것이라
// 제안이나 계정이 없다. 데모 버스킹 날의 설문 응답을 집계해 샘플 리포트가
// 청중을 보이게 한다(lib/premiumReport.ts).
export const seedSurvey = (): SurveyCounts => ({
  responses: 86,
  grade: { "1학년": 24, "2학년": 21, "3학년": 18, "4학년 이상": 14, "대학원생": 3, "졸업생 · 기타": 4 },
  field: { "인문 · 사회": 19, "경영 · 경제": 17, "자연 · 공학": 22, "의약 · 보건": 9, "예체능": 12, "교육": 5, "기타": 2 },
  visited: { "처음이에요": 51, "가 본 적 있어요": 29, "잘 모르겠어요": 6 },
})

export function seedReviews(): Review[] {
  const reviews: Omit<Review, "id" | "createdAt">[] = [
    {
      proposalId: "seed-busking",
      side: "group",
      aboutId: "afternoon-coffee",
      authorName: "삼육대 뮤즈",
      eventName: "가을 버스킹 데이",
      rating: 5,
      tags: ["약속을 잘 지켜요", "매장 응대가 친절해요"],
      comment: "버스킹 날 커피를 제때 보내 주셨고 쿠폰을 들고 간 관객도 친절하게 맞아 주셨어요.",
    },
    {
      proposalId: "seed-hackathon",
      side: "group",
      aboutId: "afternoon-coffee",
      authorName: "광운대 코드랩",
      eventName: "코드랩 가을 해커톤",
      rating: 4,
      tags: ["응답이 빨라요", "다시 함께하고 싶어요"],
      comment: "제안에 하루 만에 답해 주셔서 준비가 수월했어요.",
    },
    {
      proposalId: "seed-spring-snap",
      side: "brand",
      aboutId: "syu-muse",
      authorName: "모먼트 스튜디오",
      eventName: "봄 정기 공연 스냅",
      rating: 5,
      tags: ["홍보를 잘해요", "성과 공유가 꼼꼼해요"],
      comment: "공연 전후로 SNS에 꾸준히 올려 주셔서 스튜디오 예약 문의가 늘었어요.",
    },
  ]
  const days = ["2026-10-14T19:20:00+09:00", "2026-09-28T11:05:00+09:00", "2026-06-02T16:40:00+09:00"]
  return reviews.map((review, index) => ({
    ...review,
    id: `${review.proposalId}:${review.side}`,
    createdAt: new Date(days[index]).toISOString(),
  }))
}

// 데모 브랜드가 학생 단체에서 받은 제안(KST).
export function seedRequests(): SponsorRequest[] {
  const requests: Omit<SponsorRequest, "brandId">[] = [
    {
      id: "req-nowon",
      groupName: "노원 크리에이터스",
      school: "노원구 5개 대학 연합",
      industry: "content",
      eventName: "캠퍼스 브이로그 챌린지",
      eventDate: "2026-11-08",
      people: "예상 도달 4,200명",
      ask: "음료 쿠폰 200장",
      message: "브이로그 8편에 매장 방문 장면을 자연스럽게 담아 드릴게요.",
      status: "검토 중",
      createdAt: "2026-10-19T14:20:00+09:00",
    },
    {
      id: "req-movement",
      groupName: "광운대 무브먼트",
      school: "광운대학교",
      industry: "performance",
      eventName: "겨울 댄스 쇼케이스",
      eventDate: "2026-11-21",
      people: "관객 300명",
      ask: "현금 30만원 + 음료 100잔",
      message: "공연 중간에 브랜드 소개 영상을 띄우고 로비에 시음 부스를 마련할게요.",
      status: "검토 중",
      createdAt: "2026-10-18T10:05:00+09:00",
    },
    {
      id: "req-runners",
      groupName: "서울여대 러너스",
      school: "서울여자대학교",
      industry: "sports",
      eventName: "가을 캠퍼스 런 5K",
      eventDate: "2026-11-15",
      people: "참가자 80명",
      ask: "완주 기념 음료 80잔",
      message: "완주한 참가자 모두에게 오후의 커피 쿠폰을 나눠 드릴게요.",
      status: "수락",
      createdAt: "2026-10-12T16:40:00+09:00",
      respondedAt: "2026-10-13T09:30:00+09:00",
    },
    {
      id: "req-council",
      groupName: "덕성여대 총학생회",
      school: "덕성여자대학교",
      industry: "performance",
      eventName: "학생회 간식 나눔 행사",
      eventDate: "2026-11-18",
      people: "재학생 1,000명",
      ask: "쿠키 500개",
      message: "시험 기간 간식 나눔 행사에 함께해 주세요.",
      status: "거절",
      createdAt: "2026-10-09T11:00:00+09:00",
      respondedAt: "2026-10-10T15:20:00+09:00",
    },
  ]
  return requests.map((request) => ({
    ...request,
    brandId: "afternoon-coffee",
    createdAt: new Date(request.createdAt).toISOString(),
    ...(request.respondedAt ? { respondedAt: new Date(request.respondedAt).toISOString() } : {}),
  }))
}

// 브랜드가 데모 학생 단체에 보낸 제안(KST).
export function seedOffers(): SponsorOffer[] {
  const offers: Omit<SponsorOffer, "groupId">[] = [
    {
      id: "offer-glowlab",
      brandId: "glowlab",
      brandName: "글로우랩",
      industry: "beauty",
      campaignName: "겨울 립케어 캠퍼스 체험존",
      campaignDate: "2026-12-03",
      offer: "립밤 샘플 300개 + 부스 운영",
      message: "종강 공연 관객에게 립밤 샘플을 나눠 드리고 공연장 앞에 체험 부스를 열고 싶어요.",
      status: "검토 중",
      createdAt: "2026-10-21T14:10:00+09:00",
    },
    {
      id: "offer-freshon",
      brandId: "freshon",
      brandName: "프레시온",
      industry: "wellness",
      campaignName: "시험 기간 에너지 충전 부스",
      campaignDate: "2026-12-10",
      offer: "에너지 드링크 200개",
      message: "공연 리허설 기간에 단원들과 관객에게 에너지 드링크를 지원할게요.",
      status: "검토 중",
      createdAt: "2026-10-19T10:30:00+09:00",
    },
    {
      id: "offer-studymate",
      brandId: "studymate",
      brandName: "스터디메이트",
      industry: "education",
      campaignName: "신학기 플래너 나눔",
      campaignDate: "2026-10-15",
      offer: "스터디 플래너 150권",
      message: "가을 버스킹 데이 관객에게 플래너를 나눠 드리고 싶어요.",
      status: "거절",
      createdAt: "2026-10-02T09:00:00+09:00",
      respondedAt: "2026-10-03T18:40:00+09:00",
    },
  ]
  return offers.map((offer) => ({
    ...offer,
    groupId: "syu-muse",
    createdAt: new Date(offer.createdAt).toISOString(),
    ...(offer.respondedAt ? { respondedAt: new Date(offer.respondedAt).toISOString() } : {}),
  }))
}

// 데모 브랜드의 마친 협찬(버스킹 날의 집계와 매출은 /api/analytics의 실시간
// 측정을 따른다).
export const seedSponsorships = (): Sponsorship[] => [
  {
    id: "sp-busking",
    groupName: "삼육대 뮤즈",
    eventName: "가을 버스킹 데이",
    date: "2026-10-12",
    spend: 680000,
    coupons: 94,
    visits: 41,
    sales: 1652300,
    eventId: "event-busking-day",
    // 버스킹 날의 리포트와 같은 목표.
    targetRoas: 170,
  },
  {
    id: "sp-finals",
    groupName: "노원 크리에이터스",
    eventName: "기말고사 응원 이벤트",
    date: "2026-06-10",
    spend: 300000,
    coupons: 88,
    visits: 35,
    sales: 540000,
    targetRoas: 200,
  },
  {
    id: "sp-festival",
    groupName: "서울여대 러너스",
    eventName: "봄 캠퍼스 페스티벌",
    date: "2026-05-20",
    spend: 500000,
    coupons: 140,
    visits: 61,
    sales: 1050000,
    targetRoas: 200,
  },
]

// 버스킹 날 측정의 마지막 몇 건의 기록(KST).
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

// 버스킹 날의 측정(KST): 집계와 시간대별 스캔, 마지막 몇 건의 기록, 그리고
// 그 전에 정한 목표. 추정 매출은 41회 방문 × 40,300원으로 리포트의 ROAS
// 243%가 된다.
export function seedMeasurements(accountId: string): Measurement[] {
  return [
    {
      eventId: "event-busking-day",
      accountId,
      code: "20261012",
      metrics: { scans: 128, coupons: 94, visits: 41, ...emptyVenueCounts() },
      hourlyScans: [
        { date: "2026-10-12", hour: 17, scans: 12 },
        { date: "2026-10-12", hour: 18, scans: 26 },
        { date: "2026-10-12", hour: 19, scans: 38 },
        { date: "2026-10-12", hour: 20, scans: 29 },
        { date: "2026-10-12", hour: 21, scans: 15 },
        { date: "2026-10-12", hour: 22, scans: 8 },
      ],
      log: seedMetricLog(),
      goals: {
        expectedAudience: 350,
        averageSpend: 40300,
        // 스캔 128건으로 도달 1,240.
        snsReach: 1112,
        valueBreakdown: [
          { type: "현금", value: 200000 },
          { type: "제품", value: 330000 },
          { type: "서비스", value: 150000 },
        ],
        targets: {
          reach: 1100,
          scans: 105,
          coupons: 75,
          visits: 26,
          qrRate: 30,
          visitRate: 25,
          roas: 170,
        },
        coupon: { store: "오후의 커피 공릉점", title: "아메리카노 1+1" },
      },
      // 행사 전에 매장에 준 데모의 직원 PIN과 단체 자신의 행사장 PIN.
      survey: seedSurvey(),
      staffPin: "101234",
      groupPin: "101334",
      sponsors: [],
      passes: {},
    },
  ]
}

// 채용 게시판의 예시 게시물. 데모 계정마다 하나씩이며 만든 때부터 한 달
// 열려 있다(freshenExamplePosts가 유지한다).
export function seedPosts(demoAccountIds: Partial<Record<Role, string>>, now = new Date()): BoardPost[] {
  const deadline = addDays(todayInKorea(now), 30)
  const posts: BoardPost[] = []
  const brand = demoAccountIds.브랜드
  const group = demoAccountIds.학생단체
  if (brand) {
    posts.push({
      id: "post-coffee-tasting",
      accountId: brand,
      listingId: "afternoon-coffee",
      title: "11월 캠퍼스 시음회와 함께할 공연을 찾아요",
      body: "신메뉴 시음회를 학생 공연과 함께 열고 싶어요. 관객 100명 이상의 공연이나 축제라면 음료 쿠폰과 시음 부스를 지원해요. 공연 전후 로비에서 부스를 열 수 있으면 좋아요.",
      types: ["제품"],
      deadline,
      createdAt: now.toISOString(),
    })
  }
  if (group) {
    posts.push({
      id: "post-muse-concert",
      accountId: group,
      listingId: "syu-muse",
      title: "종강 공연을 함께할 협찬사를 찾아요",
      body: "밴드 다섯 팀이 서는 종강 공연이에요. 무대 현수막 로고와 공연 중 소개, 로비 부스를 드릴 수 있어요. 음료나 간식을 협찬해 주실 브랜드를 찾아요.",
      types: ["현금", "제품"],
      eventId: "event-muse-concert",
      deadline,
      createdAt: now.toISOString(),
    })
  }
  return posts
}

// 데모 브랜드의 샘플 리포트(sp-busking, lib/premiumReport.ts)를 데이터가
// 오래됐어도 온전하게 보이게 한다: 매장 자체의 방문자 수, 돌아온 쿠폰 수령자
// (시드된 방문을 쿠폰 참가자별로), 전자계약서의 작업과 증빙.
export function freshenDemoReport(database: Pick<Database, "sponsorships" | "measurements" | "agreements" | "demoAccountIds">) {
  const brandId = database.demoAccountIds?.브랜드
  const sponsorship = brandId ? database.sponsorships[brandId]?.find((item) => item.id === "sp-busking") : undefined
  if (!sponsorship) return
  sponsorship.lift ??= { before: 38, during: 47, updatedAt: "2026-10-21T10:00:00.000Z" }
  const busking = database.measurements.find((item) => item.eventId === "event-busking-day")
  if (busking) {
    const takers = busking.log.filter((entry) => entry.kind === "coupons").map((entry) => entry.participant)
    const visits = busking.log.filter((entry) => entry.kind === "visits")
    if (takers.length && !visits.some((entry) => takers.includes(entry.participant))) {
      visits.forEach((entry, index) => {
        entry.participant = takers[index % takers.length]
      })
    }
  }
  if (!database.agreements.some((item) => item.id === "busking")) {
    const at = "2026-10-05T10:00:00.000Z"
    database.agreements.push({
      id: "busking",
      kind: "request",
      items: [
        { id: "busking-banner", side: "group", label: "무대 현수막에 로고 넣기", doneAt: "2026-10-12T17:00:00.000Z", links: [], photos: [] },
        { id: "busking-mention", side: "group", label: "공연 중 쿠폰 안내 멘트 2회", doneAt: "2026-10-12T20:10:00.000Z", links: [], photos: [] },
        { id: "busking-sns", side: "group", label: "인스타그램 홍보 게시물 1회", doneAt: "2026-10-10T09:00:00.000Z", links: ["https://www.instagram.com/"], photos: [] },
        { id: "busking-qr", side: "group", label: "정문 부스에 QR 세우기", doneAt: "2026-10-12T16:30:00.000Z", links: [], photos: [] },
        { id: "busking-coupon", side: "brand", label: "아메리카노 1+1 쿠폰 준비", doneAt: "2026-10-11T12:00:00.000Z", links: [], photos: [] },
        { id: "busking-goods", side: "brand", label: "현장 시음 음료 200잔 전달", doneAt: "2026-10-12T15:00:00.000Z", links: [], photos: [] },
      ],
      confirmed: { group: at, brand: at },
      createdAt: at,
      updatedAt: at,
    })
  }
}

// 예시 게시물은 데이터가 오래돼도 한 달 앞까지 열려 있다.
export function freshenExamplePosts(database: Pick<Database, "posts" | "demoAccountIds">, now = new Date()) {
  const demo = new Set(Object.values(database.demoAccountIds ?? {}))
  const today = todayInKorea(now)
  for (const post of database.posts) {
    if (demo.has(post.accountId) && post.deadline < addDays(today, 7)) post.deadline = addDays(today, 30)
  }
}

// 데모 단체의 콘서트를 행사 페이지가 보여 주는 대로 둔다. 방문자가 단체가
// 거기에 무엇을 쓰는지 볼 수 있다(사진은 회원에게만 맡긴다).
export const museConcertPage = {
  venue: "삼육대학교 대강당",
  intro:
    "뮤즈가 한 학기를 마무리하는 종강 공연이에요. 밴드 다섯 팀이 두 시간 동안 무대에 서고 공연 전후 로비에서 부스를 열 수 있어요. 지난 공연에는 학생과 지역 주민 120명이 찾았어요.",
  packages: [
    { name: "메인 스폰서", gives: "무대 현수막 로고, 공연 중 소개 멘트, SNS 게시물 2회", asks: "현금 30만원" },
    { name: "로비 부스", gives: "공연 전후 로비 부스 운영, 관객 대상 시음 · 쿠폰 배포", asks: "제품 100개" },
  ],
}

// now는 만든 시각이다. 날짜를 밀 시드는 그만큼 앞선 시각으로 만든다(store.ts).
export async function createSeed(now = new Date()): Promise<Database> {
  const createdAt = now.toISOString()
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  const muse: Account = {
    id: "demo-muse",
    role: "학생단체",
    name: "삼육대 뮤즈",
    type: "공연 동아리",
    school: "삼육대학교",
    email: "muse@syu.ac.kr",
    contact: demoContacts.학생단체,
    groupId: "syu-muse",
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
    contact: demoContacts.브랜드,
    brandId: "afternoon-coffee",
    passwordHash,
    termsAgreedAt: createdAt,
    createdAt,
  }

  return {
    accounts: [muse, coffee],
    sessions: [],
    emailCodes: [],
    brands: structuredClone(seedBrands),
    groups: structuredClone(seedGroups),
    catalogVersion: 4,
    conversations: seedConversations(),
    inquiries: [],
    invites: [],
    agreements: [],
    reviews: seedReviews(),
    requests: seedRequests(),
    offers: seedOffers(),
    sponsorships: { [coffee.id]: seedSponsorships() },
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
          ...museConcertPage,
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
          budget: 800000,
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
    measurements: seedMeasurements(muse.id),
    reports: [],
    blocks: {},
    saved: {},
    posts: seedPosts({ 학생단체: muse.id, 브랜드: coffee.id }, now),
  }
}
