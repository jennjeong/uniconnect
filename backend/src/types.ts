export type Role = "학생단체" | "브랜드"

export type Industry =
  | "cafe"
  | "photo"
  | "wellness"
  | "performance"
  | "content"
  | "sports"
  | "beauty"
  | "education"

// An SNS account on a listing, like 인스타그램 @syu_muse with 3,100명.
export type SnsAccount = { platform: string; handle: string; followers?: string }

// 브랜드는 지난 협업을, 학생단체는 지난 행사와 협찬을 담는다.
export type PortfolioItem = { title: string; detail: string }

// 반대편이 둘러보는 브랜드나 학생단체의 리스팅이다. 계정은 내 정보에서 자기
// 리스팅을 고친다.
// 브랜드가 내놓는 것 하나다. 종류(brandOffers)와 그 양을 담는다.
export type BrandOffer = { kind: string; detail?: string }

export type Match = {
  id: string
  name: string
  category: string
  industry: Industry
  // 로고 이미지 URL이다. 없으면 프론트엔드가 업종 그래픽을 보여 준다.
  logo?: string
  offer: string
  // 브랜드의 제안이며, 프로필처럼 한 행씩이다. brandOffers의 종류 하나와 그
  // 양("150장")을 담고, 제안 한 줄은 이것으로 만든다.
  offers?: BrandOffer[]
  // 둘러보는 계정에 대한 매칭으로, 카탈로그를 내놓을 때 계산한다
  // (lib/matchScore.ts). 가장 큰 이유들과, 각 부분이 최선에 대한 몫(0에서 1)을
  // 담는다.
  score: number
  // 브랜드가 Pro이며(lib/plan.ts), browse()에서 계산한다.
  pro?: true
  // A running 상단 광고 (backend lib/ads.ts): first in the catalog, marked AD.
  ad?: true
  reasons?: string[]
  scoreParts?: { label: string; value: number }[]
  tags: string[]
  // 이번 학기 학생단체와의 협찬이다(브랜드 카탈로그만).
  popularity?: number
  // 브랜드 카탈로그만. 매장의 주소와, 지도 서비스가 위치를 잡은 뒤에는
  // (lib/geocode.ts) 좌표다.
  location?: { address: string; lat?: number; lng?: number }
  // 브랜드 카탈로그만. 학생단체의 초대로 합류한 뒤 이 브랜드가 되는 Kakao
  // Map의 매장이다(ShopInvite). Kakao는 장소의 ID는 보관하게 하지만, 검색이
  // 말하는 장소의 내용은 보관하지 못하게 한다.
  kakaoPlaceId?: string
  // 협찬 후기로 카탈로그를 내놓을 때 계산한다. 평균 별점(소수 한 자리)과
  // 개수다.
  rating?: number
  reviewCount?: number
  // 브랜드 카탈로그만. 그 계정의 사업자등록이 확인되었다는 표시로
  // (Account.business) 카탈로그를 내놓을 때 계산한다.
  businessVerified?: true
  // 둘러보는 계정(캠퍼스나 매장)에서 이 리스팅까지의 km로, 카탈로그를 내놓을 때
  // 계산한다(lib/geo.ts). 어느 한쪽 위치를 모르면 없다.
  distanceKm?: number
  // 카탈로그 지도를 위해 둘러보는 계정에서 동쪽과 북쪽으로 몇 미터인지 나타낸
  // 방향이며, distanceKm과 함께 내려간다.
  mapOffset?: { east: number; north: number }
  // Kakao 지도에 핀을 꽂을 위치다(표에 있는 캠퍼스, OpenStreetMap으로 잡은
  // 매장). mapOffset과 함께 내려간다.
  mapPoint?: { lat: number; lng: number }
  // 학생단체 카탈로그만. 학교, 다음 행사(그 페이지의 id), 예상 관객이다.
  school?: string
  eventId?: string
  eventName?: string
  eventDate?: string
  // 다음 행사의 종류(validation.ts eventKinds)로, 단체가 정했을 때만 있다.
  eventKind?: string
  audience?: number
  // 상세 페이지의 짧은 소개, 핵심 정보(쪽별 라벨은 lib/validation.ts), SNS
  // 계정, 포트폴리오다.
  intro?: string
  facts?: { label: string; value: string }[]
  sns?: SnsAccount[]
  portfolio?: PortfolioItem[]
  // 설정되어 있으면 주인이 당분간 목록에서 뺀 것이다(내 정보). 반대편의
  // 카탈로그, 매칭, 가까운 매장, 저장 목록에서 빠지고(lib/catalog.ts의
  // listedTo) 새 제안은 거절되지만, 진행 중인 대화, 제안, 계약은 계속된다.
  pausedAt?: string
}

export type EventStatus = "매칭 중" | "집행 예정" | "측정 완료"

// 학생단체가 행사 페이지에서 브랜드에 내놓는 협찬 패키지다. 이름, 브랜드가
// 받는 것, 요청하는 지원을 담는다.
export type SponsorPackage = { name: string; gives: string; asks: string }

export type EventItem = {
  id: string
  name: string
  // "YYYY-MM-DD" 형식의 날짜다. 여러 날에 걸치면 첫날이다.
  date: string
  // 여러 날에 걸친 행사의 마지막 날이다. 하루짜리는 없다.
  endDate?: string
  people: string
  types: string[]
  // What "기타" in types means, written by the organizer.
  typeNote?: string
  // 원 단위 예산이다. 단체는 행사의, 브랜드는 캠페인의 예산이다.
  budget?: number
  status: EventStatus
  createdAt: string
  // 날이 가깝다고 주인에게 메일을 보낸 시각이다(lib/reminders.ts).
  remindedAt?: string
  // 학생단체의 행사 페이지다(routes/events.ts). 장소, 행사 소개, 사진 최대
  // 넷(lib/photos.ts, eventPhotos 아래), 브랜드에 내놓는 패키지를 담는다.
  venue?: string
  intro?: string
  photos?: string[]
  packages?: SponsorPackage[]
  // 단체의 행사다. 종류(validation.ts eventKinds), 매일 시작하고 끝나는
  // 한국 시간("HH:MM"), 올 것으로 기대하는 사람(여성 비율 퍼센트, 학년, 쓴
  // 그대로의 전공 분야)을 담는다.
  kind?: string
  startTime?: string
  endTime?: string
  makeup?: { years?: string[]; majors?: string }
  // 홍보 · 배포 계획이다. 단체가 브랜드에 내놓는 것(validation.ts logoSpots,
  // handoutWays, promoPosts)과 고른 것을 실행하기로 동의한 시각을 담는다.
  // 수락된 제안의 계약서는 이것을 단체의 항목으로 삼아 시작한다.
  promo?: { spots: string[]; handouts: string[]; posts: string[]; agreedAt: string }
  // 사진과 함께 보관하는 PDF 형식의 단체의 행사 기획안이다. 보관된 이름,
  // 보낼 때의 이름, 바이트 수, 시각을 담는다.
  plan?: { file: string; name: string; size: number; addedAt: string }
}

// 계정을 운영하는 사람이다. 전화번호는 확정된 협찬의 계약서에서 양쪽에만
// 보인다.
export type AccountContact = { name: string; position: string; phone: string }

// 계정이 내 정보에서 끌 수 있는 알림 메일의 종류다(lib/validation.ts의
// mailKinds). 제안과 그 답, 확정된 협찬 소식, 메시지, 가까운 날, 합류한
// 파트너의 주간 요약(lib/digest.ts)이 있다.
export type MailKind = "proposals" | "sponsorships" | "messages" | "reminders" | "digest"

export type ProposalTemplate = { id: string; name: string; text: string }

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  // 가입할 때 묻는다. 이전 계정에는 없다.
  contact?: AccountContact
  // 계정 자신의 리스팅이다. 브랜드는 브랜드 카탈로그(학생단체가 보내는 제안도
  // 여기로 온다)에, 학생단체는 단체 카탈로그에 있다.
  brandId?: string
  groupId?: string
  // 이 계정의 Toss Payments 고객 키다. 무작위이며 첫 주문 때 만들고, 계정의
  // 공개 형태에는 보이지 않는다.
  customerKey?: string
  passwordHash: string
  termsAgreedAt: string
  createdAt: string
  // 신고 때문에 운영자가 정지한 시각이다. 로그인할 수 없고, 메일을 받지 못하고,
  // 리스팅이 누구에게도 보이지 않는다.
  suspendedAt?: string
  // 브랜드의 사업자등록으로, 국세청이 확인한 뒤의 것이다(lib/business.ts).
  // 번호만 두어 사업자 하나가 계정 하나만 확인하게 하며, 대표자 이름과 개업일은
  // 보관하지 않는다.
  business?: { number: string; verifiedAt: string }
  // 계정이 읽은 알림 벨 항목으로(앱의 lib/notifications.ts), 마지막으로 보낸 그대로다.
  // 아직 보이는 항목만 두어 목록이 벨만큼만 짧게 유지된다.
  readNotices?: string[]
  // 친구 초대다. 이 계정의 초대 링크 코드, 이 계정이 링크로 가입한 계정, 그
  // 계정이 그 일로 보상받은 시각을 담는다(lib/referrals.ts).
  // 협찬 결산 공개다. 학생단체가 받은 협찬의 공개 페이지(routes/ledger.ts)로,
  // 비밀 링크, 금액을 보여 줄지, 제안 id별 협찬마다의 메모를 담는다.
  ledger?: { token?: string; showValues: boolean; notes?: Record<string, string> }
  // 기수다. 학생단체의 팀을 각 팀이 넘겨받은 시기별로 둔다("제3대 하성",
  // 2026-03-01부터). 협찬 기록이 임기별로 읽히며 최대 20개다.
  terms?: { name: string; from: string }[]
  referralCode?: string
  referredBy?: string
  referralRewardedAt?: string
  // Proposal messages saved to send again (제안 문구 템플릿), at most
  // maxTemplates; {상대} and {행사} are filled in when one is used.
  templates?: ProposalTemplate[]
  // 계정이 앱을 마지막으로 쓴 언어로, 메일에 쓴다. 앱이 알려 주기 전까지는
  // 한국어다.
  language?: "ko" | "en"
  // 계정이 끈 알림 메일의 종류다. 코드와 계정 자체에 대한 알림은 항상 간다.
  mailOff?: MailKind[]
  // 주간 요약이 이 계정을 마지막으로 살핀 월요일(한국)이다.
  digestOn?: string
  // 캘린더 앱이 구독하는 비밀 링크다(routes/calendar.ts). 만든 그대로 두어
  // 내 정보가 다시 보여 줄 수 있고, 앱이 받는 계정 데이터에는 담기지 않는다.
  calendarFeed?: { token: string; createdAt: string }
  // 인증 앱을 쓰는 2단계 로그인이다(lib/totp.ts). 비밀 값, 켠 시각, 아직 쓰지
  // 않은 복구 코드의 해시, 마지막 코드의 단계를 담아 코드마다 한 번만 쓰이게
  // 한다. `pendingTwoFactor`는 설정을 위해 보여 주었지만 아직 코드로 확인하지
  // 않은 비밀 값이다.
  twoFactor?: { secret: string; enabledAt: string; recoveryHashes: string[]; usedStep?: number }
  pendingTwoFactor?: { secret: string; createdAt: number }
  // 비밀번호를 통과하고 코드를 기다리는 로그인이다. 브라우저가 쥐고 있는
  // 티켓의 해시, 유효 기한, 지금까지 틀린 코드 수를 담는다.
  loginTicket?: { hash: string; expiresAt: number; tries: number; userAgent?: string }
  // 자기 이메일과 비밀번호로 이 계정에 로그인하는 공동 관리자(routes/team.ts)와,
  // 다른 사람에게 보낸 초대다. 초대는 메일로 보낸 코드의 해시로 구분한다.
  members?: TeamMember[]
  memberInvites?: MemberInvite[]
  // 로그인에 쓰려고 내 정보에서 연결한 Kakao나 Naver 계정이며, 제공자의 회원
  // 번호로 구분한다(routes/social.ts).
  social?: Partial<Record<SocialProvider, { id: string; linkedAt: string }>>
  // 총학생회의 동아리가 연결할 때 쓰는 코드(routes/council.ts)와, 동아리에서는
  // 연결한 총학생회다. 어느 쪽이든 연결을 끊을 수 있다.
  councilCode?: { code: string; createdAt: string }
  councils?: { accountId: string; linkedAt: string }[]
}

export type SocialProvider = "kakao" | "naver"

export type TeamMember = {
  id: string
  name: string
  email: string
  passwordHash: string
  addedAt: string
  // 공동 관리자 자신의 2단계 로그인이다. 반드시 있어야 하며, 첫 로그인에서
  // 설정한다(routes/auth.ts).
  twoFactor?: Account["twoFactor"]
  pendingTwoFactor?: Account["pendingTwoFactor"]
  loginTicket?: Account["loginTicket"]
}

// 운영자를 기다리는 가입이다(lib/applications.ts).
export type Application = {
  id: string
  kind: "shop" | "member"
  name: string
  email: string
  // 신청이 보인 사진이나 PDF로, 결정될 때까지 lib/photos.ts로 보관한다.
  document: { file: string; name: string; size: number }
  requestedAt: string
  // 매장은 만들어질 계정과, 그 계정이 온 초대를 담는다.
  account?: Account
  invite?: string
  // 이미 있는 브랜드가 초대받은 가게를 잇는 신청이면 그 계정이다.
  linkAccountId?: string
  // 공동 관리자는 합류할 계정과, 만들어질 공동 관리자를 담는다.
  accountId?: string
  member?: TeamMember
}
export type MemberInvite = { id: string; name: string; email: string; codeHash: string; invitedAt: string; expiresAt: number }

export type PublicAccount = Omit<
  Account,
  "passwordHash" | "termsAgreedAt" | "calendarFeed" | "twoFactor" | "pendingTwoFactor" | "loginTicket" | "members" | "memberInvites" | "social" | "councilCode" | "councils"
> & {
  twoFactorOn?: true
  // 로그인에 쓰려고 연결한 제공자이며 회원 번호는 담지 않는다.
  socialLinks?: SocialProvider[]
  // 공동 관리자가 로그인한 경우에 설정한다(계정의 주인이 아니다).
  asMember?: { id: string; name: string; email: string }
}

export type Session = {
  // 브라우저가 쥔 토큰의 sha256이므로, 데이터 파일만으로는 누구도 로그인시킬
  // 수 없다.
  tokenHash: string
  accountId: string
  expiresAt: number
  // 기기 목록용으로 브라우저와 시스템(lib/devices.ts), 로그인한 시각과 마지막으로
  // 쓴 시각(최대 한 시간마다 갱신)을 담는다.
  device?: string
  createdAt?: number
  lastUsedAt?: number
  // 계정에 로그인한 공동 관리자다(Account.members). 주인의 로그인에는 없다.
  memberId?: string
}

export type EmailCode = {
  email: string
  role: Role
  code: string
  expiresAt: number
  attempts: number
  // 이 코드 묶음이 시작된 시각이다. 틀린 추측은 그 안에서 이어진다.
  firstSentAt?: number
  // 가입이 아니라 비밀번호 초기화나 계정을 새 로그인 이메일로 옮기기("change",
  // 요청한 계정과 함께)를 위한 코드다.
  purpose?: "reset" | "change"
  accountId?: string
  verificationToken?: string
  verifiedUntil?: number
}

// 확인 방식에 따라 현장 직원이 세는 것(lib/methods.ts)이다. 나눠 준 샘플이나
// 시식, 도장 찍은 부스 방문, SNS 게시글, 설문 응답, 현장 구매, 나눠 준 굿즈,
// 응모, 가입이나 앱 설치, 브랜드의 체험을 해 본 사람이다.
export type VenueCounts = {
  samples: number
  stamps: number
  posts: number
  surveys: number
  purchases: number
  giveaways: number
  raffles: number
  signups: number
  experiences: number
}

// 행사의 집계다. QR 스캔, 쿠폰, 매장 방문, 그다음 현장의 집계다.
export type Metrics = { scans: number; coupons: number; visits: number } & VenueCounts

export type MetricKind = keyof Metrics

// 협찬을 행사에서 확인하는 방식이다(협찬 확인 방식, lib/methods.ts). 체크인
// QR, 그 쿠폰, 매장 방문이 있고, 그다음 현장 직원이 세는 것(VenueCounts)이다.
// 각각 한쪽 또는 양쪽이 자기 현장 페이지에서 자기 PIN으로 확인하며, 매장
// 방문은 언제나 브랜드의 매장이 확인한다.
export type MethodKind =
  | "qr"
  | "coupon"
  | "visit"
  | "sampling"
  | "booth"
  | "sns"
  | "survey"
  | "purchase"
  | "giveaway"
  | "raffle"
  | "signup"
  | "experience"

export type MethodSide = ChatSide | "both"

export type MeasureMethod = { kind: MethodKind; side: MethodSide }

// 기록된 QR 스캔, 쿠폰, 매장 방문, 현장 확인 하나다.
export type MetricEntry = {
  id: string
  kind: MetricKind
  at: string
  participant: string
  detail: string
}

// "취소됨"은 수락된 뒤 양쪽이 계약서에서 취소한 것이다. "마감"은 저장하지
// 않으며, 답을 기다리는 제안은 행사가 끝나면 이렇게 보인다
// (lib/proposals.ts).
export type RequestStatus = "검토 중" | "수락" | "거절" | "취소됨" | "마감"

// 학생단체가 브랜드에 보낸 협찬 제안이다.
export type SponsorRequest = {
  id: string
  brandId: string
  // 보낸 학생 계정이다. 시드된 예시에는 없다.
  fromAccountId?: string
  // 제안이 다루는 그 계정의 행사로, 수락하면 행사를 확정한다.
  eventId?: string
  groupName: string
  school: string
  industry: Industry
  eventName: string
  // "YYYY-MM-DD" 형식이며, 단체에 예정된 행사가 없으면 ""다.
  eventDate: string
  people: string
  ask: string
  message: string
  // 게시판 글에서 왔다면 그 지원 대상인 브랜드의 글이다.
  postId?: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
  // When both sides called the sponsorship off (취소).
  canceledAt?: string
}

// 브랜드가 학생단체에 보낸 협찬 제안이다.
export type SponsorOffer = {
  id: string
  // 보낸 대상인 단체의 리스팅이다.
  groupId: string
  // 보낸 브랜드 계정이다. 시드된 예시에는 없다.
  fromAccountId?: string
  // 제안이 다루는 그 계정의 캠페인으로, 수락하면 캠페인을 확정한다.
  campaignId?: string
  // 브랜드의 리스팅이며 있을 때만 담는다.
  brandId?: string
  brandName: string
  industry: Industry
  campaignName: string
  // "YYYY-MM-DD" 형식이며, 브랜드에 예정된 캠페인이 없으면 ""다.
  campaignDate: string
  // 브랜드가 내놓는 것이다.
  offer: string
  message: string
  // 게시판 글에서 왔다면 그 지원 대상인 단체의 글이다.
  postId?: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
  // When both sides called the sponsorship off (취소).
  canceledAt?: string
}

// 브랜드의 끝난 협찬 하나로, 분석에 쓴다.
export type Sponsorship = {
  id: string
  groupName: string
  eventName: string
  date: string
  // 현금과 현물을 합해 쓴 원 단위 금액이다.
  spend: number
  coupons: number
  visits: number
  // 협찬이 가져온 추정 매장 매출이며 원 단위다.
  sales: number
  // 현장이 확인 방식으로 확인한 것이다.
  samples?: number
  stamps?: number
  posts?: number
  surveys?: number
  purchases?: number
  giveaways?: number
  raffles?: number
  signups?: number
  experiences?: number
  // 협찬한 학생 행사이며, 그 측정이 집계를 갱신한다.
  eventId?: string
  // 협찬 전에 정한 ROAS 목표이며 퍼센트다.
  targetRoas: number
  // 날이 가깝다고 브랜드에 메일을 보낸 시각이다(lib/reminders.ts).
  remindedAt?: string
  // 매장 자체의 일별 방문자로, 상세 리포트(lib/premiumReport.ts)가 비교한다.
  // 협찬 전 같은 요일의 방문자와, 쿠폰 기간 중의 방문자다.
  lift?: { before: number; during: number; updatedAt: string }
  // 상세 리포트의 읽기 전용 링크(/insights/shared/<token>)이며 공유 중일 때만 있다.
  shareToken?: string
}

// 학생단체가 행사를 측정하는 기준으로 행사 전에 정하는 것이다.
export type MeasurementGoals = {
  expectedAudience: number
  // 참여자가 협찬사 매장에서 쓰는 원 단위 금액으로, 추정 매출에 쓴다.
  averageSpend: number
  // 행사장 밖의 도달(SNS 같은 것)이며 QR 스캔에 더한다.
  snsReach: number
  // 종류별 협찬의 가치이며 원 단위다.
  valueBreakdown: { type: string; value: number }[]
  targets: Report["targets"]
  // 참여자가 체크인 페이지에서 받는 협찬사의 쿠폰이다.
  coupon: { store: string; title: string }
}

// 참여자가 체크인 페이지에서 번호로 받는 쿠폰이다. `coupon`은 번호를
// 발급하기 전의 패스에서는 true다.
export type PassCoupon = { coupon?: string | true; visit?: true; surveyed?: true }

// 체크인 페이지에서 참여자가 선택으로 하는 설문 응답으로, 행사의 집계로만
// 보관한다(패스나 누구의 정보와도 함께 두지 않는다).
export type SurveyCounts = {
  responses: number
  grade: Record<string, number>
  field: Record<string, number>
  visited: Record<string, number>
  // 2026-11부터 묻는다(lib/validation.ts surveyOptions). 이전 집계에는 없다.
  gender?: Record<string, number>
}

// 학생 행사를 협찬하는 브랜드 하나가 그 행사의 측정에 갖는 몫이다. 자기
// 쿠폰, 매장 직원이 방문을 확인하는 PIN, 집계, 준 가치를 가지므로 분석에는
// 자기 몫만 담긴다.
export type EventSponsor = {
  // 브랜드의 협찬이다(Sponsorship.id).
  id: string
  brandName: string
  coupon: { store: string; title: string }
  // 이 협찬사가 낸 원 단위 금액이다. 없으면 행사의 가치를 똑같이 나누고,
  // 협찬사가 하나면 언제나 가치 전체다.
  value?: number
  staffPin: string
  metrics: { coupons: number; visits: number } & VenueCounts
  // 이 협찬을 확인하는 방식으로, e-contract가 정한 대로와 양쪽이 마지막으로
  // 확정한 대로다. 집계에 쓰이는 것은 확정된 쪽이며, 그 전에는 QR, 쿠폰,
  // 매장 방문만 센다.
  methods?: MeasureMethod[]
  confirmedMethods?: MeasureMethod[]
}

// 행사 하나의 실시간 측정이다. 집계, 시간별 스캔, 최근 기록, 목표를 담는다.
// `code`는 행사의 체크인 주소에 들어 있다.
export type Measurement = {
  // 두 쪽이 처음 계약서를 확인했을 때의 예상 인원. QR 상한의 기준이다.
  agreedAudience?: number
  eventId: string
  accountId: string
  code: string
  metrics: Metrics
  // 한국 기준 날짜와 시간별 QR 스캔이다.
  hourlyScans: { date: string; hour: number; scans: number }[]
  // 가장 최근의 기록이며 오래된 것부터다.
  log: MetricEntry[]
  goals: MeasurementGoals
  // 행사에 협찬사가 없는 동안 매장 직원이 방문을 확인하려고 입력하는 네 자리
  // 숫자다. 그 뒤에는 협찬사마다 자기 것이 있다.
  staffPin: string
  // 학생단체 직원이 자기 현장 페이지(/check-in/<code>/group)에서 입력해 자기
  // 방식에 배정된 것을 확인하는 네 자리 숫자다.
  groupPin: string
  // 협찬사가 없는 동안 행사를 확인하는 방식이다(브랜드의 캠페인은 단체와의
  // e-contract에서 정한다). 정한 대로와 양쪽이 마지막으로 확정한 대로이며,
  // 그 뒤에는 협찬사마다 자기 것이 있다.
  methods?: MeasureMethod[]
  confirmedMethods?: MeasureMethod[]
  // `metrics`는 행사 전체를 센다. 브랜드가 협찬하면 참여자는 행사의 쿠폰 대신
  // 협찬사마다의 쿠폰을 받고, 협찬사 자신의 집계는 합계와 함께 늘어난다.
  sponsors: EventSponsor[]
  // 스캔마다 패스 하나이므로 참여자는 쿠폰마다 한 번, 방문마다 한 번씩 받는다.
  // 행사의 쿠폰은 패스 자체에, 협찬사의 쿠폰은 그 id 아래에 둔다. 매장 직원이
  // 입력하는 것은 번호다.
  // Postgres에서는 비어 있고 행으로 있다(lib/passRows.ts).
  passes: Record<string, PassCoupon & { sponsors?: Record<string, PassCoupon> }>
  // 처음 들어온 협찬사다. 행으로 있는 행사의 쿠폰을 이 협찬사의 것으로 옮기면 지운다.
  eventCouponsTo?: string
  // 선택 설문의 응답을 센 것이다(lib/validation.ts surveyOptions).
  survey?: SurveyCounts
  // 한국 날짜별 스캔, 쿠폰, 방문이다(lib/measurements.ts dailyCounts).
  daily?: Record<string, { scans: number; coupons: number; visits: number }>
  // 오늘(한국 날짜) 틀린 현장 PIN으로, 운영자 경보에 쓴다.
  pinMisses?: { day: string; count: number }
}

// 행사 하나의 성과 리포트로, 그 측정과 행사 전에 정한 목표에서 계산한다.
export type Report = {
  eventId: string
  // 행사의 체크인 주소에 들어 있다.
  code: string
  eventName: string
  eventDate: string
  // 여러 날에 걸친 행사의 마지막 날이다.
  eventEndDate?: string
  expectedAudience: number
  // 현금과 현물을 합한 협찬 가치 총액이며 원 단위다.
  sponsorValue: number
  reach: number
  roas: number
  targets: {
    reach: number
    scans: number
    coupons: number
    visits: number
    qrRate: number
    visitRate: number
    roas: number
  }
  hourlyScans: Measurement["hourlyScans"]
  valueBreakdown: { type: string; value: number }[]
  // 위의 수치가 나온 입력이다.
  averageSpend: number
  snsReach: number
  // 브랜드가 확인한 SNS 게시물의 도달과 아직 기다리는 도달.
  postedReach: number
  pendingReach: number
  coupon: MeasurementGoals["coupon"]
  // 행사를 가진 단체에게만 보인다.
  staffPin?: string
  // 학생단체의 현장 PIN으로, 행사를 가진 단체에게만 보인다.
  groupPin?: string
  // 협찬사가 생기기 전 행사를 확인하는 방식(양쪽이 확정한 대로)이다. 협찬사
  // 쪽은 아래에 있다.
  methods: MeasureMethod[]
  // 현장 직원이 지금까지 확인한 것으로, 행사 전체다.
  venue: VenueCounts
  // 브랜드가 협찬한 뒤에는 협찬사마다의 몫이 있는 행사의 협찬사다.
  // 학생들 자신의 리포트에는 행사의 종류, 올 것으로 기대한 사람, 선택
  // 설문의 집계를 담는다.
  eventKind?: string
  makeup?: { years?: string[]; majors?: string }
  survey?: { responses: number; grade: Record<string, number>; field: Record<string, number>; visited: Record<string, number>; gender?: Record<string, number> }
  sponsors?: SponsorReport[]
}

// 리포트에서 행사에 대한 협찬사 하나의 몫이다.
export type SponsorReport = {
  id: string
  brandName: string
  coupon: EventSponsor["coupon"]
  // 이 협찬사가 낸 원 단위 금액이다(단체가 정하지 않았으면 똑같이 나눈다).
  value: number
  coupons: number
  visits: number
  roas: number
  // 이 협찬을 확인하는 방식이다(양쪽이 확정한 대로).
  methods: MeasureMethod[]
  // 행사를 가진 단체에게만 보인다.
  staffPin?: string
} & VenueCounts

// 대화의 한쪽으로, 학생단체나 브랜드다.
export type ChatSide = "group" | "brand"

export type ChatMessage = {
  id: string
  from: ChatSide
  // 삭제되면 비어 있다.
  text: string
  at: string
  // 보낸 쪽이 수정하거나 삭제한 시각이며, 양쪽에 어느 쪽인지 보여 준다.
  editedAt?: string
  deletedAt?: string
  // 함께 보낸 사진이나 PDF로, 메시지를 삭제하면 사라진다.
  attachment?: ChatAttachment
  // A meeting proposed as the message (미팅 잡기), answered by the other side.
  meeting?: Meeting
}

// 대화에서 한쪽이 제안하는 미팅이다. 시작하는 날과 한국 시간, 길이, 장소(
// 장소나 화상 링크), 진행 상태를 담는다.
export type Meeting = {
  date: string
  time: string
  minutes: number
  place: string
  status: "proposed" | "accepted" | "declined" | "canceled"
  answeredAt?: string
}

// 대화에서 보낸 파일이다(routes/conversations.ts). 브라우저가 줄인 사진이나
// PDF이며, lib/photos.ts로 chatFiles(id) 아래에 보관한다. 보관한 이름과 보낼 때의
// 이름을 담는다.
export type ChatAttachment = { file: string; name: string; type: "image" | "pdf"; size: number }

// 학생단체와 브랜드 사이의 메시지이며 리스팅 id로 구분한다.
export type Conversation = {
  id: string
  groupId: string
  brandId: string
  messages: ChatMessage[]
  // 각 쪽이 대화를 마지막으로 읽은 시각이다.
  readAt: Partial<Record<ChatSide, string>>
}

// 계정이 FAQ 페이지에서 운영자에게 보낸 질문과, 운영자가 한 답이다
// (관리자 경로로 한다).
export type Inquiry = {
  id: string
  accountId: string
  category: string
  question: string
  createdAt: string
  answer?: string
  answeredAt?: string
  // 질문한 사람이 지금 달린 답을 본 시각이다. 새 답은 다시 읽지 않은 상태가 된다.
  answerReadAt?: string
}

// 수락된 제안의 한쪽이 약속한 것 하나와, 그것이 이행되었다는 증빙이다. 링크(예를
// 들어 SNS 게시글)와, 데이터 파일 옆 디스크에 보관한 사진(uploads/<agreement
// id>/<photo id>)이다.
export type AgreementItem = {
  id: string
  // 하는 쪽이다.
  side: ChatSide
  label: string
  doneAt?: string
  links: string[]
  photos: string[]
}

// 수락된 제안의 조건(임시 전자 계약서)이며 제안의 id를 쓴다. 각 쪽이 하는 일,
// 각 쪽이 지금 조건을 확정한 시각, 이행된 만큼의 증빙을 담는다. 어느 쪽이든
// 처음 열 때 만든다.
export type Agreement = {
  // 두 쪽이 확인하며 본 예상 인원 중 작은 값(lib/agreements.ts).
  seenAudience?: number
  id: string
  // 브랜드가 답한 학생단체의 제안이거나 브랜드의 제안이다.
  kind: "request" | "offer"
  items: AgreementItem[]
  // 항목을 바꾸면 둘 다 지운다.
  confirmed: Partial<Record<ChatSide, string>>
  // 현금과 현물을 합한 협찬의 가치(현물 환산)이며 원 단위다. 15% 수수료를 이것으로
  // 계산하고(lib/fees.ts), 바꾸면 양쪽의 확정도 지운다.
  value?: { cash: number; inKind: number }
  // 협찬을 취소하자는 한쪽의 요청과 그 이유, 그리고 상대편이 동의한 시각이다
  // (그 뒤로 제안은 취소가 된다).
  cancel?: { by: ChatSide; reason: string; requestedAt: string; canceledAt?: string }
  // 가는 중인 협찬 물품의 소포(협찬 물품 배송)와 각각 보낸 쪽이다. 페이지는
  // 각각을 택배사의 배송 조회에 연결한다.
  shipments?: Shipment[]
  // 브랜드가 확인할 학생단체의 SNS 게시물(lib/snsPosts.ts).
  snsPosts?: SnsPost[]
  createdAt: string
  updatedAt: string
}

// SNS 게시물 하나. 링크, 단체가 적은 도달, 캡처 3장까지, 브랜드의 판단을 담는다.
// 유튜브 링크는 읽은 조회수와 시각도 남긴다(조회수가 없으면 비공개거나 삭제).
export type SnsPost = {
  id: string
  url: string
  reach: number
  photos: string[]
  status: "pending" | "confirmed" | "rejected"
  // 브랜드가 다시 요청한 이유.
  reason?: string
  // gone: 지금은 읽을 수 없는 영상. views는 마지막으로 읽은 값이다.
  youtube?: { views?: number; gone?: boolean; at: string }
  addedAt: string
}

export type Shipment = { id: string; side: ChatSide; carrier: string; number: string; note?: string; addedAt: string }

// 협찬 행사 뒤에 한쪽이 상대편에게 쓰는 후기다. 별점, 목록의 태그
// (validation.ts reviewTags) 최대 셋, 짧은 한마디를 담고, 후기를 받은 리스팅의
// 상세 페이지에 보인다. 수락된 제안마다 쪽당 하나이며, 시드된 후기에는 제안도
// 작성 계정도 없다.
export type Review = {
  // `${proposalId}:${side}`다.
  id: string
  proposalId: string
  // 후기를 쓰는 쪽이다.
  side: ChatSide
  // 후기가 가리키는 리스팅이다.
  aboutId: string
  authorAccountId?: string
  authorName: string
  eventName: string
  rating: number
  tags: string[]
  comment: string
  createdAt: string
  updatedAt?: string
  // 신고 때문에 운영자가 내린 시각이다.
  hiddenAt?: string
  // 운영자가 리스팅에서 맨 앞에 보이게 한 것이다.
  pinnedAt?: string
  // 후기를 받은 쪽의 답으로, 후기마다 하나이며 계약서에서 쓰고 후기 밑에
  // 보인다. 운영자가 내리면 hiddenAt이 생긴다.
  reply?: { text: string; createdAt: string; updatedAt?: string; hiddenAt?: string }
}

// 신고에 대해 운영자가 한 일이다. 아무것도 안 함, 후기나 그 답글을 내림,
// 계정을 정지함이 있다.
export type ReportAction = "dismiss" | "hide-review" | "hide-reply" | "suspend"

// 회원이 다른 계정, 그 계정이 보낸 메시지 하나, 또는 후기를 운영자에게 하는
// 신고(/admin)와, 운영자가 한 처리다.
export type AbuseReport = {
  id: string
  reporterId: string
  // 신고 대상인 계정이다.
  accountId: string
  target:
    | { kind: "account" }
    | { kind: "message"; conversationId: string; messageId: string }
    | { kind: "review"; reviewId: string }
    | { kind: "reply"; reviewId: string }
  // reportReasons(lib/validation.ts) 중 하나와, 신고자가 쓴 말이다.
  reason: string
  detail: string
  // 신고된 글의 당시 모습이므로, 수정해도 같게 읽힌다.
  excerpt?: string
  createdAt: string
  resolution?: { action: ReportAction; at: string }
}

// 학생단체가 추천 매칭의 가까운 순에서 찾은 매장에 링크(/invite/<code>)로 보내는
// 초대다. Kakao는 장소의 ID와 Kakao Map 페이지만 보관하게 하므로, 매장에 대해
// 담는 것은 그것뿐이다.
export type ShopInvite = {
  code: string
  // 초대한 학생단체 계정이다.
  accountId: string
  placeId: string
  placeUrl: string
  createdAt: string
  // 브랜드 계정이 받으면 그 시각과 그 브랜드의 리스팅이다.
  acceptedAt?: string
  brandId?: string
}

// 계정이 플랫폼에 내는 돈이다(lib/billing.ts). 협찬이 확정될 때 브랜드가
// 내는 15% 수수료, 상세 리포트, Pro 한 달, 양쪽이 사는 상단 광고 한 달
// (lib/ads.ts)이 있다.
export type PaymentKind = "fee" | "report" | "pro" | "ad"

export type Payment = {
  // Toss Payments가 보는 주문 id이기도 하다.
  id: string
  // 결제한 계정이다. 결제 기록은 5년간 보관해야 하므로 계정이 떠난 뒤에는
  // 이름만 남기고, 기간이 지나면 지운다(lib/paymentRetention.ts).
  accountId: string
  accountName: string
  kind: PaymentKind
  // 수수료가 낸 계약, 리포트가 산 협찬이며, Pro는 비어 있다.
  targetId: string
  orderName: string
  // 부가세를 포함해 청구한 원 단위 금액이다.
  amount: number
  // 부가세 전의 가격이다. 부가세를 얹기 전의 결제에는 없으며, 그 결제의 금액이
  // 가격 전체였다.
  supply?: number
  status: "pending" | "paid" | "cancelled"
  // 결제 방법이다. Toss Payments를 통한 카드이거나 운영자가 확인한 계좌 이체다.
  method?: "card" | "transfer" | "grant"
  paymentKey?: string
  // Toss Payments에 승인을 요청한 카드 결제. 승인 전에 paymentKey를 저장해
  // 카드 청구 뒤 저장이 실패해도 기록할 수 있다(lib/cardRecovery.ts). 결제가
  // 끝나거나 Toss가 청구되지 않았다고 하면 지운다.
  confirmingAt?: string
  // Toss Payments에 환불을 요청한 카드 결제와 그 사유. 요청 전에 저장해 환불 뒤
  // 저장이 실패해도 기록할 수 있다(lib/cardRecovery.ts). 환불이 기록되거나 Toss가
  // 환불되지 않았다고 하면 지운다.
  refundingAt?: string
  refundReason?: string
  receiptUrl?: string
  requestedAt: string
  // 브랜드가 대신 계좌 이체로 결제하겠다고 했다.
  transferRequestedAt?: string
  paidAt?: string
  cancelledAt?: string
  cancelReason?: string
  // Pro나 광고의 경우, 결제한 한 달이 끝나는 날이다(한국 날짜).
  periodEnd?: string
  // 그 기간의 일수. 환불하면 뒤의 기간을 이만큼 앞당긴다.
  periodDays?: number
  // 리포트의 경우, 산 사람이 처음 연 시각이다(약관에 따라 그 뒤에는 환불 없음).
  openedAt?: string
}

// 친구 초대 보상 하나다. Growth 일수가 걸린 브랜드의 것은 운영자가 승인해야
// 지급된다. 일수가 없는 학생단체의 것은 세기만 하므로 바로 approved다.
export type ReferralReward = {
  id: string
  referrerId: string
  // 초대받은 계정이 탈퇴하면 비운다.
  joinedId?: string
  proposalId: string
  days: number
  status: "waiting" | "approved" | "rejected"
  createdAt: string
  decidedAt?: string
}

export type Database = {
  // 마지막으로 문서에 합친 집계 기록의 id다. 두 번 세지 않게 한다(lib/passRows.ts).
  foldedCounts?: string[]
  accounts: Account[]
  sessions: Session[]
  emailCodes: EmailCode[]
  // 학생단체가 둘러볼 수 있는 모든 브랜드와, 브랜드가 둘러볼 수 있는 모든
  // 단체다. 각 쪽의 추천 매칭은 반대편 카탈로그의 상위 셋이다.
  brands: Match[]
  groups: Match[]
  // 카탈로그가 SNS와 포트폴리오를 담게 되면 2다(store.ts가 오래된 파일을 올린다).
  catalogVersion?: number
  conversations: Conversation[]
  inquiries: Inquiry[]
  // 학생단체가 브랜드에 보낸 제안이며 브랜드가 답한다.
  requests: SponsorRequest[]
  applications?: Application[]
  // 브랜드가 학생단체에 보낸 제안이다.
  offers: SponsorOffer[]
  // 끝난 협찬이며 브랜드 계정 id로 구분한다.
  sponsorships: Record<string, Sponsorship[]>
  // 계정 id로 구분한다.
  events: Record<string, EventItem[]>
  proposals: Record<string, string[]>
  // 로그인하지 않은 방문자에게 행사를 보여 주는 계정이다.
  demoAccountIds: Record<Role, string>
  // 측정했거나 측정을 위해 연 행사마다 하나다.
  measurements: Measurement[]
  // Shops student groups invited from 가까운 순.
  invites: ShopInvite[]
  // 수락된 제안의 조건과 증빙이며 제안의 id로 구분한다.
  agreements: Agreement[]
  // 친구 초대 보상의 기록이다. 초대받은 계정이 지워져도 한 해 상한이 줄지 않도록
  // 계정과 따로 둔다(lib/referrals.ts).
  referralRewards?: ReferralReward[]
  // 운영자가 보는 회원의 신고다.
  reports: AbuseReport[]
  // 계정마다 차단한 계정이며 계정 id로 구분한다. 둘은 서로의 리스팅, 제안,
  // 대화를 더 이상 보지 못한다.
  blocks: Record<string, string[]>
  reviews: Review[]
  // The listings each account saved (찜), newest first, by account id.
  saved: Record<string, string[]>
  // 모집 게시판이다(routes/board.ts).
  posts: BoardPost[]
  // 브랜드가 냈거나 내라고 요청받은 돈이다(lib/billing.ts).
  payments?: Payment[]
  // 진행 중인 Kakao나 Naver 로그인이다(routes/social.ts). 시작한 흐름마다의
  // state와, 끝난 로그인을 페이지에 넘기는 일회용 코드이며, 둘 다 해시로 두고
  // 몇 분만 둔다.
  oauth?: {
    states: { hash: string; provider: SocialProvider; intent: "login" | "link"; accountId?: string; expiresAt: number }[]
    handoffs: { hash: string; accountId: string; userAgent?: string; expiresAt: number }[]
  }
  // 운영자가 콘솔에서 한 일이며 최신이 마지막이다(lib/adminTools.ts).
  adminLog?: AdminLogEntry[]
  // 콘솔에 들어오는 사람과 그 세션이다(routes/adminSession.ts).
  operators?: Operator[]
  operatorSessions?: OperatorSession[]
  // 회원에 대한 운영자 메모이며 계정 id로 구분한다.
  adminNotes?: Record<string, AdminNote>
  // 운영자가 사이트 전체에 보이는 공지다.
  announcements?: Announcement[]
  // 회원에 대한 운영자 자신의 태그이며 계정 id로 구분한다.
  adminTags?: Record<string, string[]>
  // 팀에서 누가 질문을 맡는지와 보류 중인지이며 질문 id로 구분한다. 회원에게는
  // 보이지 않는다.
  inquiryHandling?: Record<string, { assignee?: string; heldAt?: string }>
  // 운영자의 스위치와 목표다(lib/adminTools.ts).
  settings?: SiteSettings
  // 운영자가 추가한 도움말 센터 질문과, 숨긴 기본 질문이다.
  faq?: { added: FaqEntry[]; hidden: string[] }
  // 방문자가 카탈로그 검색에 입력한 것을 누가 입력했는지는 빼고 센 것이다.
  searchTerms?: Record<string, number>
  // 날짜 알림의 최근 실행이다(lib/reminders.ts).
  cronRuns?: { at: string; sent: number }[]
}

export type SiteSettings = {
  // 점검이다. 사이트는 화면 대신 안내를 보여 주고 쓰기를 돌려보내며, 새
  // 가입은 따로 멈출 수 있다.
  maintenance?: { on: boolean; message?: string; blockSignups?: boolean }
  // 콘솔이 견주어 재는 월별 목표다.
  kpi?: { signups?: number; proposals?: number; revenue?: number }
}

// 운영자가 쓴 도움말 센터 질문이다(한국어만).
export type FaqEntry = {
  id: string
  topic: "start" | "account" | "proposal" | "schedule" | "message" | "results"
  question: string
  answer: string
  featured?: boolean
  createdAt: string
}

// 운영자가 콘솔에서 한 일 하나다. 대상은 id로만 가리키고, 이름은 콘솔이
// 목록을 낼 때 찾아본다.
export type Operator = {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
  disabledAt?: string
  twoFactor?: Account["twoFactor"]
  pendingTwoFactor?: Account["pendingTwoFactor"]
  loginTicket?: Account["loginTicket"]
}

export type OperatorSession = { tokenHash: string; operatorId: string; expiresAt: number; createdAt: number }

export type AdminLogEntry = {
  id: string
  at: string
  // 누가 했는지다. 운영자 id이거나, 운영자 계정이 생기기 전의 공유 토큰("token")이다.
  actor?: string
  action: AdminAction
  target: {
    kind: "operator" | "backup" | "account" | "payment" | "inquiry" | "report" | "announcement" | "proposal" | "post" | "review" | "site"
    id: string
  }
  // 신고의 처리 결과 같은, 방법에 대한 짧은 말이다.
  detail?: string
}

export type AdminAction =
  | "operator-created"
  | "operator-disabled"
  | "operator-logged-in"
  | "backup-downloaded"
  | "account-logged-out"
  | "account-tagged"
  | "application-approved"
  | "application-rejected"
  | "referral-approved"
  | "referral-rejected"
  | "business-set"
  | "partners-granted"
  | "demo-reset"
  | "proposal-nudged"
  | "post-hidden"
  | "post-shown"
  | "post-closed"
  | "review-hidden"
  | "review-shown"
  | "review-pinned"
  | "review-unpinned"
  | "inquiry-handled"
  | "faq-changed"
  | "settings-changed"
  | "payment-paid"
  | "payment-cancelled"
  | "report-resolved"
  | "account-suspended"
  | "account-unsuspended"
  | "inquiry-answered"
  | "note-saved"
  | "announcement-posted"
  | "announcement-ended"

// 회원에 대한 운영자 메모로, 그 신고와 질문을 처리할 때 쓴다.
export type AdminNote = { text: string; at: string }

// 모두 또는 한쪽에게 사이트 맨 위에 보이는 공지로, 끝나거나 내릴 때까지
// 보인다.
export type Announcement = {
  id: string
  text: string
  tone: "info" | "warning"
  audience: "all" | Role
  // 보이기 시작하는 첫날("YYYY-MM-DD")이며, 없으면 바로 보인다.
  from?: string
  // 보이는 마지막 날("YYYY-MM-DD")이며, 없으면 기한이 없다.
  until?: string
  // 이 공지를 닫은 방문자 수다.
  dismissals?: number
  createdAt: string
  endedAt?: string
}

// 모집 게시판의 공개 글이다(routes/board.ts). 협찬할 행사를 찾는 브랜드나,
// 자기 행사의 협찬사를 찾는 학생단체가 올린다. 반대편은 제안(postId를 담은
// POST /api/proposals)으로 지원하고, 올린 쪽은 받은편지함에서 답한다.
export type BoardPost = {
  id: string
  accountId: string
  // 글이 그 이름으로 보이는 글쓴이의 리스팅이다.
  listingId: string
  title: string
  body: string
  // 브랜드가 내놓거나 단체가 원하는 협찬의 종류다(sponsorTypes).
  types: string[]
  // 단체의 글은 자기 행사 하나에 대한 것이다.
  eventId?: string
  // 지원할 수 있는 마지막 날("YYYY-MM-DD")이다.
  deadline: string
  // 올린 쪽이 마감 전에 닫은 시각이다.
  closedAt?: string
  // 운영자가 게시판에서 내렸으며, 올린 쪽에게는 계속 보인다.
  hiddenAt?: string
  createdAt: string
  updatedAt?: string
}
