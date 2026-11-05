// 백엔드 API가 돌려주는 데이터의 모양 (backend/src/types.ts).
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

export type SnsAccount = { platform: string; handle: string; followers?: string }

// 브랜드는 지난 협업, 학생단체는 지난 행사와 협찬.
export type PortfolioItem = { title: string; detail: string }

// 소개 편집의 불러오기가 포트폴리오 한 줄로 내놓는 지난 협찬이나 행사.
export type HistoryItem = { id: string; date: string; title: string; detail: string }

// 브랜드가 제공하는 것 하나: 종류(brandOffers)와 그 양.
export type BrandOffer = { kind: string; detail?: string }

export type Match = {
  id: string
  name: string
  category: string
  industry: Industry
  logo?: string
  offer: string
  // 브랜드의 제공 목록. 프로필에 나오는 대로 한 줄씩이며, brandOffers의 종류와
  // 그 분량("150장")으로 이루어진다. 제공 문구는 이것으로 만든다.
  offers?: BrandOffer[]
  // 둘러보는 계정에 맞춘 매칭. 가장 크게 작용한 이유와, 각 항목이 최고점 대비
  // 차지하는 비율(0~1)을 담는다.
  score: number
  reasons?: string[]
  scoreParts?: { label: string; value: number }[]
  tags: string[]
  // 이번 학기에 학생단체와 맺은 협찬 (브랜드 카탈로그 전용).
  popularity?: number
  // 브랜드 카탈로그 전용: 매장 주소와, 지도 서비스가 위치를 찾은 뒤의 좌표.
  location?: { address: string; lat?: number; lng?: number }
  // 브랜드 카탈로그 전용: 학생단체의 초대로 가입한 경우, 이 브랜드에 해당하는
  // Kakao Map의 매장.
  kakaoPlaceId?: string
  // 협찬 후기: 평균 별점과 후기 수 (후기가 있을 때만).
  rating?: number
  reviewCount?: number
  // 브랜드 카탈로그 전용: 사업자 등록이 확인됐다.
  businessVerified?: true
  // Pro 요금제를 쓰는 브랜드 (backend lib/plan.ts).
  pro?: true
  // 진행 중인 상단 광고 (backend lib/ads.ts): 카탈로그 맨 위에 AD 표시와 함께
  // 나온다.
  ad?: true
  // 둘러보는 계정(캠퍼스 또는 매장)에서 떨어진 거리(km). 어느 한쪽 위치를
  // 모르면 없다.
  distanceKm?: number
  // 둘러보는 계정에서 본 방향을 동쪽·북쪽 미터로 나타낸 값. 카탈로그 지도에
  // 쓰며 distanceKm과 함께 내려준다.
  mapOffset?: { east: number; north: number }
  // Kakao 지도 핀에 쓰는 위치 (캠퍼스는 표에서, 매장은 OpenStreetMap으로
  // 찾는다). mapOffset과 함께 내려준다.
  mapPoint?: { lat: number; lng: number }
  // 학생단체 카탈로그 전용: 학교, 다음 행사(행사 페이지용 id), 예상 참여 인원.
  school?: string
  eventId?: string
  eventName?: string
  eventDate?: string
  // 단체가 정했다면 다음 행사의 종류.
  eventKind?: string
  audience?: number
  // 상세 페이지: 짧은 소개, 주요 정보, SNS, 포트폴리오.
  intro?: string
  facts?: { label: string; value: string }[]
  sns?: SnsAccount[]
  portfolio?: PortfolioItem[]
  // 본인 리스팅에만 있다: 당분간 목록에서 뺀 상태 (내 정보).
  pausedAt?: string
}

// 계정이 내 정보에서 직접 쓰는 리스팅 항목.
// `logo`: 설정할 data URL, 지우려면 null, 그대로 두려면 생략.
// 캠퍼스 근처의 실제 매장. Kakao Local에서 실시간으로 가져온다 (GET
// /api/places).
export type NearbyPlace = {
  id: string
  name: string
  category: string
  address: string
  phone?: string
  distanceM: number
  // Kakao Map의 매장 페이지. 방문자에게 보이는 가상 매장에는 없다.
  url?: string
  // 화면의 지도에만 쓰는 위치와, 이 매장이 검색된 종류(data/places.ts).
  lat: number
  lng: number
  kind: string
  // 초대한 학생단체.
  invited?: true
  // 초대를 받아 가입한 브랜드.
  brandId?: string
}

// map은 서버에 지도 키가 없으면 false이고, campus는 지도에 없는 학교면
// null이다. center는 매장과 함께 내려주는 캠퍼스의 좌표다. 방문자에게는 Kakao
// 대신 데모 단체의 캠퍼스 주변 가상 매장(example)을 보여준다.
export type NearbyPlaces = {
  map: boolean
  example?: true
  campus: string | null
  center?: { lat: number; lng: number }
  places: NearbyPlace[]
}

// 협찬의 두 당사자 (backend ChatSide).
export type ChatSide = "group" | "brand"

// 수락된 제안에서 한쪽이 약속한 것 하나와 그 증빙: 링크와 사진 (로그인 토큰으로
// 가져온다, api.agreementPhoto).
export type AgreementItem = {
  id: string
  side: ChatSide
  label: string
  doneAt?: string
  links: string[]
  photos: string[]
}

// 한쪽이 보는 협찬의 합의서(임시 전자 계약서): 양쪽 당사자(계정이 있으면
// member), 행사, 브랜드가 주는 것, 항목, 그리고 각 쪽이 현재 항목을 확정한
// 시각.
// 한쪽이 보낸 협찬 물품 택배 한 건. 합의서에 적어 둔다.
export type Shipment = { id: string; side: ChatSide; carrier: string; number: string; note?: string; addedAt: string }

// 브랜드가 확인할 학생단체의 SNS 게시물. 유튜브 링크는 읽은 조회수를 함께
// 담는다(비공개거나 삭제된 영상은 없음).
export type SnsPost = {
  id: string
  url: string
  reach: number
  photos: string[]
  status: "pending" | "confirmed" | "rejected"
  reason?: string
  // gone: 지금은 읽을 수 없는 영상. views는 마지막으로 읽은 값이다.
  youtube?: { views?: number; gone?: boolean; at: string }
  addedAt: string
}

export type Agreement = {
  id: string
  kind: "request" | "offer"
  shipments?: Shipment[]
  snsPosts?: SnsPost[]
  side: ChatSide
  // 각 당사자와 계정을 운영하는 담당자 (두 당사자에게만 보인다).
  group: { name: string; member: boolean; contact?: AccountContact }
  brand: { name: string; member: boolean; contact?: AccountContact }
  eventName: string
  eventDate: string
  // 행사는 그 행사를 가진 쪽이 있는 동안만 있다 (요청이면 단체의 행사, 제안이면
  // 브랜드의 캠페인). 목표도 같다. 목표는 행사가 시작되기 전까지 합의서에서
  // 정하고 양쪽이 읽는다.
  event?: { id: string; owner: ChatSide; started: boolean }
  goals?: { expectedAudience: number; targets: Report["targets"] }
  gives: string
  items: AgreementItem[]
  confirmed: Partial<Record<ChatSide, string>>
  createdAt: string
  updatedAt: string
  // 협찬을 행사에서 확인하는 방식 (data/methods.ts): 여기서 정한 방식, 양쪽이
  // 마지막으로 확정한 방식(있으면 이쪽이 집계된다), 현장에서 센 값, 그리고
  // 행사에 측정이 생긴 뒤 이쪽이 확인하는 방식이 있을 때 이쪽의 현장 페이지와
  // PIN.
  measure?: {
    code: string
    methods: MeasureMethod[]
    confirmedMethods?: MeasureMethod[]
    counts: Metrics
    // PIN은 행사 전날부터 보인다. 그전에는 그 날짜만 알려준다.
    // 여러 단체가 함께 쓰는 캠페인의 단체 PIN을 이 브랜드가 바꿀 수 있다.
    canRotateGroupPin?: boolean
    venue?: { page: VenuePage; pin?: string; pinsFrom?: string; misses?: number; canRotate?: boolean }
  }
  // 후기는 행사 당일부터 열린다. canWrite는 데모 계정이거나 상대에게 후기를
  // 보여 줄 리스팅이 없으면 false다. canReply는 이쪽이 자신에 대한 상대의
  // 후기에 답할 수 있다는 뜻이다.
  review: { open: boolean; canWrite: boolean; canReply: boolean; mine?: Review; theirs?: Review }
  // 협찬을 취소하자는 한쪽의 요청과 사유, 그리고 상대가 동의한 시각(그 뒤
  // 합의서는 기록일 뿐이다). 이쪽이 지금 요청할 수 있는지도 담는다: 행사 뒤나
  // 데모 계정은 요청할 수 없다.
  cancel?: { by: ChatSide; reason: string; requestedAt: string; canceledAt?: string }
  cancelable: boolean
  // 협찬의 가치. 현금과 현물이며, 적은 뒤에만 있다.
  value?: { cash: number; inKind: number }
  // 브랜드가 확정하려고 내는 플랫폼 수수료 (backend lib/fees.ts): 면제이면(데모
  // 계정, 수수료 도입 전 협찬) 없고, 아니면 가치에서 정한 비율과 낸 금액, 아직
  // 낼 금액이다.
  fee: { rate: number; exempt: boolean; amount: number; paid: number; due: number; needsValue: boolean }
}

// 브랜드가 플랫폼에 내는 돈 (backend lib/billing.ts).
export type PaymentKind = "fee" | "report" | "pro" | "ad"

export type Payment = {
  id: string
  accountName: string
  kind: PaymentKind
  targetId: string
  orderName: string
  // 부가세를 포함해 청구한 금액. supply는 부가세 전 가격이다 (부가세를 얹기
  // 전의 결제에는 없다).
  amount: number
  supply?: number
  status: "pending" | "paid" | "cancelled"
  method?: "card" | "transfer" | "grant"
  receiptUrl?: string
  requestedAt: string
  transferRequestedAt?: string
  paidAt?: string
  cancelledAt?: string
  cancelReason?: string
  periodEnd?: string
  openedAt?: string
}

// 가격, 카드 결제 사용 여부, 계정의 결제 내역.
export type BillingInfo = {
  prices: { feeRate: number; report: number; pro: number; proDays: number; adBrand: number; adGroup: number; adDays: number; adRenewalDiscount: number; vatRate: number }
  card: { clientKey: string } | null
  // Toss 테스트 키: 돈은 오가지 않으며, 데모 계정도 시연을 위해 결제해 볼 수
  // 있다.
  testMode: boolean
  canPay: boolean
  payments: Payment[]
  // 브랜드의 요금제 (backend lib/pro.ts): Pro는 정해진 한국 날짜까지이고, 이번
  // 달 제안 수는 무료 요금제의 한도와 비교한다.
  plan: { pro: boolean; until: string | null; offersThisMonth: number; freeOffers: number; partnerRequestsLeft: number }
  // 상단 광고 (backend lib/ads.ts): 진행 중이면 끝나는 한국 날짜, 역할별 월
  // 가격, 앞으로 30일의 비용(진행 중이면 10% 할인).
  ad: { until: string | null; price: number; next: number; renewing: boolean; days: number }
  // 이 계정이 광고 대금을 낼 수 있는지 여부 (단체도 가능하고, 데모 계정은
  // 테스트 모드에서만 가능하다).
  canPayAd: boolean
}

// 결제할 주문과, 결제창에 필요한 값.
export type PaymentOrder = { order: Payment; customerKey: string; email: string }

// 운영자가 보는 결제 한 건.
export type AdminPayment = Payment & { accountId: string; card: boolean }

// 협찬 한쪽이 행사 뒤에 상대에 대해 쓴 후기.
export type Review = {
  // 제안을 드러내지 않고 이 후기를 가리키는 값. 신고할 때 쓴다.
  key: string
  authorName: string
  side: ChatSide
  eventName: string
  rating: number
  tags: string[]
  comment: string
  createdAt: string
  updatedAt?: string
  // 운영자가 내렸다. 작성자에게만 계속 보인다.
  hidden?: true
  // 후기를 받은 쪽의 답변. 후기 아래에 붙는다. 운영자가 내렸다면 내려졌다는
  // 사실만 남고 본문은 없다.
  reply?: { text?: string; createdAt: string; updatedAt?: string; hidden?: true }
}

// 리스팅의 후기 요약.
export type ReviewSummary = { count: number; average: number; tags: { tag: string; count: number }[] }

// 합의서 목록의 한 줄.
export type AgreementSummary = {
  id: string
  side: ChatSide
  partner: string
  eventName: string
  eventDate: string
  // 양쪽이 취소했다.
  canceled?: true
  confirmed: Partial<Record<ChatSide, string>>
  done: number
  total: number
  proof: number
}

// 학생단체가 매장에 보내는 초대 (/invite/<code>).
export type ShopInvite = {
  code: string
  placeId: string
  placeUrl: string
  createdAt: string
  acceptedAt?: string
  brandId?: string
}

// 초대 페이지: 누가 초대했는지(그쪽 리스팅, 아직 쓰지 않았다면 이름과 학교만)와
// 매장이 가입했는지. 보는 브랜드 본인("you")인지 다른 브랜드인지에 따라 다르게
// 나온다.
export type InvitePageData = {
  invite: { code: string; placeUrl: string; createdAt: string; joined: "you" | "other" | null }
  group?: Partial<Match> & { name: string; category: string }
}

export type ProfileDraft = Pick<Match, "intro" | "offer" | "offers" | "tags" | "facts" | "sns" | "portfolio"> & {
  logo?: string | null
  // 브랜드의 매장 주소. 비워 두면 지운다.
  address?: string
}

export type EventStatus = "매칭 중" | "집행 예정" | "측정 완료"

export type EventItem = {
  id: string
  name: string
  // "YYYY-MM-DD" 형식의 달력 날짜. 여러 날에 걸치면 첫날이다.
  date: string
  // 여러 날에 걸친 행사의 마지막 날. 하루짜리면 없다.
  endDate?: string
  people: string
  types: string[]
  // types의 "기타"가 뜻하는 것. 주최자가 적는다.
  typeNote?: string
  // 원 단위 예산: 단체는 행사, 브랜드는 캠페인의 예산이다.
  budget?: number
  status: EventStatus
  // 학생단체의 행사 페이지 (pages/EventDetailPage.tsx): 장소, 내용, 사진 이름,
  // 브랜드에 내놓는 패키지.
  venue?: string
  intro?: string
  photos?: string[]
  packages?: SponsorPackage[]
  // 행사 종류(data/eventDetails.ts), 매일 시작하고 끝나는 한국 시각("HH:MM"),
  // 예상 참여자.
  kind?: string
  startTime?: string
  endTime?: string
  makeup?: { years?: string[]; majors?: string }
  // 홍보 · 배포 계획과, 단체가 이를 실행하기로 동의한 시각.
  promo?: { spots: string[]; handouts: string[]; posts: string[]; agreedAt: string }
  // PDF로 만든 행사 기획안.
  plan?: { file: string; name: string; size: number; addedAt: string }
}

// 단체의 행사 페이지에 있는 협찬 패키지: 이름, 브랜드가 얻는 것, 단체가
// 요청하는 지원.
export type SponsorPackage = { name: string; gives: string; asks: string }

// API가 내려주는 모집 게시판 글 (backend routes/board.ts): 글, 작성자의 쪽과
// 리스팅, 단체의 행사, 아직 지원을 받는지, 보는 사람이 쓴 글인지. 보는 사람
// 자신의 지원서와, 작성자에게는 들어온 지원서도 담는다.
export type BoardPost = {
  id: string
  listingId: string
  title: string
  body: string
  types: string[]
  eventId?: string
  // 지원 마감일, "YYYY-MM-DD".
  deadline: string
  closedAt?: string
  createdAt: string
  updatedAt?: string
  role: Role
  poster: Pick<Match, "id" | "name" | "category" | "industry" | "logo" | "school">
  event?: { id: string; name: string; date: string; endDate?: string; people: string }
  open: boolean
  own: boolean
  applied?: RequestStatus
  applications?: { id: string; name: string; about: string; date: string; status: RequestStatus }[]
}

// 쓰거나 고친 글. 단체의 글은 자기 행사 가운데 하나를 가리킨다.
export type PostDraft = { title: string; body: string; types: string[]; deadline: string; eventId?: string }

// API가 내려주는 행사 페이지: 행사, 그 뒤의 단체, 보는 사람이 주인인지 여부.
export type EventPage = {
  event: EventItem
  group: Pick<Match, "id" | "name" | "school" | "category" | "industry" | "logo">
  own: boolean
}

// 계정을 운영하는 사람. 상대에게는 확정된 협찬의 합의서에서만 보인다.
export type AccountContact = { name: string; position: string; phone: string }

export type ProposalTemplate = { id: string; name: string; text: string }

export type Account = {
  id: string
  // 인증 앱을 쓰는 2단계 로그인이 켜져 있다.
  twoFactorOn?: true
  // 계정 주인이 아니라 공동 관리자가 로그인했을 때 설정된다.
  asMember?: { id: string; name: string; email: string }
  // 로그인에 쓰려고 연결한 Kakao나 Naver 계정.
  socialLinks?: SocialProvider[]
  role: Role
  name: string
  type: string
  school: string
  email: string
  // 가입할 때 묻는다. 그 전에 만든 계정에는 없다.
  contact?: AccountContact
  // 계정 자신의 리스팅: 브랜드는 브랜드 카탈로그, 학생단체는 단체 카탈로그에
  // 있다.
  brandId?: string
  groupId?: string
  createdAt: string
  // 계정이 읽은 알림 항목 (lib/notifications.ts).
  readNotices?: string[]
  // 기수: 단체의 팀을 맡은 날짜별로 나눈 것. 최근 순이다.
  terms?: { name: string; from: string }[]
  // 다시 보내려고 저장해 둔 제안 메시지. {상대}와 {행사}가 채워진다.
  templates?: ProposalTemplate[]
  // 이메일을 받는 언어와, 계정이 끈 알림 메일의 종류.
  language?: "ko" | "en"
  mailOff?: MailKind[]
}

// 알림 메일의 종류 (data/mail.ts).
export type MailKind = "proposals" | "sponsorships" | "messages" | "reminders" | "digest"

// 브랜드가 여기서 사업자를 확인할 수 있는지(서버에 키가 있는지)와, 이 브랜드의
// 확인된 사업자 등록.
export type BusinessStatus = { ready: boolean; business: { number: string; verifiedAt: string } | null }

export type Session = { token: string; account: Account }

// 2단계 로그인이 켜진 계정에서 맞게 입력된 비밀번호: 앱의 코드와 함께 돌려보낼
// 티켓이다 (components/CodeStep.tsx).
export type CodeTicket = {
  twoFactor: true
  ticket: string
  // 공동 관리자의 첫 로그인: 이 시크릿으로 2단계 로그인을 설정한다.
  setup?: { secret: string; url: string }
}

// 운영자의 승인을 기다리는 가입 (backend lib/applications.ts).
export type Pending = { pending: true }

export type AdminApplication = {
  id: string
  kind: "shop" | "member"
  name: string
  email: string
  document: { name: string; size: number }
  requestedAt: string
  brand?: string
  contact?: AccountContact
  team?: string
}

// 연결한 뒤 로그인에 쓸 수 있는 제공자 (routes/social.ts).
export type SocialProvider = "kakao" | "naver"

// 계정에 로그인한 기기 하나 (내 정보의 로그인한 기기).
export type DeviceSession = {
  id: string
  device: string
  createdAt?: string
  lastUsedAt?: string
  current: boolean
  // 소유자의 목록에 이름으로 나오는 공동 관리자의 로그인.
  member?: string
}

// 계정 하나를 운영하는 사람들 (내 정보의 함께 관리하는 사람): 소유자, 공동
// 관리자, 아직 열려 있는 초대. `you`는 "owner" 또는 멤버의 id다.
export type Team = {
  owner: { name: string; email: string }
  members: { id: string; name: string; email: string; addedAt: string }[]
  invites: { id: string; name: string; email: string; invitedAt: string; expiresAt: string }[]
  // 가입했고, 운영자가 서류를 확인하기를 기다리는 중이다.
  waiting: { id: string; name: string; email: string; requestedAt: string }[]
  you: string
}

// 현장 직원이 확인 방식별로 세는 것: 샘플이나 시식, 부스 스탬프, SNS 게시물,
// 설문 응답, 구매, 나눠 준 물품, 래플 응모, 가입이나 앱 설치, 체험한 사람.
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

// QR 스캔, 쿠폰, 매장 방문, 그리고 현장에서 센 값.
export type Metrics = { scans: number; coupons: number; visits: number } & VenueCounts

export type MetricKind = keyof Metrics

// 협찬을 행사에서 확인하는 방식(협찬 확인 방식)과, 각 방식을 현장에서 확인하는
// 쪽(어느 한쪽이거나 양쪽)이다 (backend lib/methods.ts).
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

// 한 몫의 집계 (스폰서 한 곳의 몫, 스폰서가 생기기 전에는 행사 전체의 몫).
export type ShareCounts = Omit<Metrics, "scans">

// 두 현장 페이지: 브랜드의 것(매장 직원용, /check-in/<code>/staff)과 학생단체의
// 것(/check-in/<code>/group).
export type VenuePage = "staff" | "group"

// PIN이 맞았을 때의 현장 페이지: 행사와, 각 몫별로 이쪽이 그곳에서 확인하는
// 방식 및 지금까지의 집계.
export type VenueShare = { id: string; brandName: string | null; store: string; kinds: MethodKind[]; counts: ShareCounts }

export type VenueSession = { eventName: string; eventDate: string; shares: VenueShare[] }

export type MetricEntry = {
  id: string
  kind: MetricKind
  at: string
  participant: string
  detail: string
}

// "취소됨": 수락된 뒤 합의서에서 양쪽이 취소했다.\n|"마감": 행사가 끝날 때까지
// 답을 기다리다 만 제안.
export type RequestStatus = "검토 중" | "수락" | "거절" | "취소됨" | "마감"

// 학생단체가 브랜드에 보낸 협찬 제안.
export type SponsorRequest = {
  id: string
  brandId: string
  // 제안이 다루는 단체의 행사. 그 행사 페이지로 연결된다.
  eventId?: string
  groupName: string
  school: string
  industry: Industry
  eventName: string
  // "YYYY-MM-DD". 단체에 잡힌 행사가 없으면 "".
  eventDate: string
  people: string
  ask: string
  message: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
  // 양쪽이 취소한 시각 (취소).
  canceledAt?: string
}

// 브랜드가 학생단체에 보낸 협찬 제안.
export type SponsorOffer = {
  id: string
  groupId: string
  brandId?: string
  brandName: string
  industry: Industry
  campaignName: string
  // "YYYY-MM-DD". 브랜드에 잡힌 캠페인이 없으면 "".
  campaignDate: string
  offer: string
  message: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
  // 양쪽이 취소한 시각 (취소).
  canceledAt?: string
}

// 계정이 보낸 제안(단체의 요청, 브랜드의 제안). 받은 제안 옆에 받은편지함이
// 나열하는 모습 그대로다.
export type SentProposal = {
  id: string
  // 상대의 리스팅. DELETE /api/proposals/:matchId로 제안을 거둔다.
  partnerId: string
  partnerName: string
  industry: Industry
  logo?: string
  school?: string
  // 제안이 다루는, 보낸 쪽 자신의 행사나 캠페인.
  eventName: string
  eventDate?: string
  // 단체가 요청한 것, 또는 브랜드가 제안한 것.
  offer: string
  // 함께 보낸 메모.
  message?: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
}

// 브랜드의 끝난 협찬 한 건. 분석에 쓴다.
export type Sponsorship = {
  id: string
  // 협찬한 학생 행사(측정된 경우). 상세 리포트는 /insights/<id>에 있으며, 읽을
  // 수 있음, 구매 필요, 아직 아님(행사 당일 전), 없음 중 하나다 (backend
  // lib/premiumReport.ts reportState).
  eventId?: string
  report?: "open" | "locked" | "soon" | "none"
  groupName: string
  eventName: string
  date: string
  spend: number
  coupons: number
  visits: number
  sales: number
  // 현장이 확인 방식별로 이 협찬에 대해 확인한 것.
  samples?: number
  stamps?: number
  posts?: number
  surveys?: number
  purchases?: number
  giveaways?: number
  raffles?: number
  signups?: number
  experiences?: number
  // ROAS 목표(퍼센트).
  targetRoas: number
}

export type ChatMessage = {
  id: string
  // 삭제되면 비어 있다.
  text: string
  at: string
  mine: boolean
  // 내가 보낸 메시지에만 있다: 상대가 읽었는지 여부.
  read?: boolean
  // 보낸 쪽이 고치거나 지운 시각. 양쪽 모두 어느 쪽인지 보인다.
  editedAt?: string
  deletedAt?: string
  // 메시지로 보낸 사진이나 PDF. 삭제되면 사라진다.
  attachment?: ChatAttachment
  // 메시지로 제안한 미팅과 그 진행 상태.
  meeting?: Meeting
}

// 대화에서 제안한 미팅: 날짜, 한국 시각의 시작 시간, 분 단위 길이, 장소(장소나
// 화상 링크).
export type Meeting = {
  date: string
  time: string
  minutes: number
  place: string
  status: "proposed" | "accepted" | "declined" | "canceled"
  answeredAt?: string
}

// 대화에서 보낸 파일: 저장된 이름, 보낼 때의 이름, 종류, 바이트 단위 크기.
export type ChatAttachment = { file: string; name: string; type: "image" | "pdf"; size: number }

// 브랜드(학생단체용) 또는 단체(브랜드용)와의 대화.\n|이 계정이 운영자에게 보낸
// 질문과, 답이 있으면 그 답변.
export type Inquiry = {
  id: string
  category: string
  question: string
  createdAt: string
  answer?: string
  answeredAt?: string
  // 질문한 사람이 지금 상태의 답변을 본 시각.
  answerReadAt?: string
}

// 운영자가 보는 질문. 누가 보냈는지도 담는다.
export type AdminInquiry = Inquiry & {
  // 질문한 사람. 회원을 열어 볼 때 쓴다.
  accountId: string
  from: { name: string; role: Role; email: string } | null
  // 팀에서 누가 맡았는지와 보류 중인지 여부.
  handling: { assignee?: string; heldAt?: string } | null
}

// 신고에 대해 운영자가 할 수 있는 조치.
export type ReportAction = "dismiss" | "hide-review" | "hide-reply" | "suspend"

// 운영자가 보는 회원 신고: 누가 무엇 때문에 누구를 신고했는지, 신고된 내용
// 원문, 그리고 처리한 내용.
export type AdminReport = {
  id: string
  target:
    | { kind: "account" }
    | { kind: "message"; conversationId: string; messageId: string }
    | { kind: "review"; reviewId: string }
    | { kind: "reply"; reviewId: string }
  reason: string
  detail: string
  excerpt?: string
  createdAt: string
  resolution?: { action: ReportAction; at: string }
  reporter: { id: string; name: string; role: Role; email: string } | null
  about: { id: string; name: string; role: Role; email: string } | null
}

// 운영자가 정지한 계정.
export type SuspendedAccount = { id: string; name: string; role: Role; email: string; suspendedAt: string }

// 서버가 실패한 요청이나 브라우저가 잡은 오류. 운영자가 읽는 그대로다 (backend
// lib/errorLog.ts).
export type ErrorEntry = {
  id: string
  at: string
  source: "server" | "browser"
  message: string
  where: string
  path: string
  stack?: string
}

// 이 계정이 차단한 계정. 리스팅으로 가리킨다.
export type BlockedListing = { listingId: string; name: string }

// 수치 하나를 두 가지로: 실제 회원만의 값과, 데모 데이터를 합친 값.
export type Figure = { real: number; total: number }

// 운영자용 플랫폼 수치 (GET /api/admin/stats).
export type PlatformStats = Record<
  | "students"
  | "brands"
  | "newThisWeek"
  | "events"
  | "upcomingEvents"
  | "proposals"
  | "accepted"
  | "declined"
  | "sponsorships"
  | "scans"
  | "coupons"
  | "visits"
  | "messages"
  | "questionsWaiting",
  Figure
>

export type Conversation = {
  id: string
  partner: {
    id: string
    name: string
    category: string
    industry: Industry
    school?: string
    // 메시지는 계정이 있는 상대에게만 닿는다.
    hasAccount: boolean
  }
  lastMessage: { text: string; at: string; mine: boolean; deleted?: boolean; attachment?: ChatAttachment["type"]; meeting?: true } | null
  unread: number
  messages?: ChatMessage[]
}

export type Report = {
  eventId: string
  // 행사 체크인 주소에 들어가는 값.
  code: string
  eventName: string
  eventDate: string
  // 여러 날에 걸친 행사의 마지막 날.
  eventEndDate?: string
  expectedAudience: number
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
  // 날짜(YYYY-MM-DD, 한국 기준)와 시간별 QR 스캔 수.
  hourlyScans: { date: string; hour: number; scans: number }[]
  valueBreakdown: { type: string; value: number }[]
  // 위 수치를 계산하는 데 쓴 입력값: 참여자가 스폰서 매장에서 쓴 금액(원)과,
  // 행사장 밖으로 닿은 범위.
  averageSpend: number
  snsReach: number
  // 브랜드가 확인한 SNS 게시물의 도달과 아직 기다리는 도달.
  postedReach: number
  pendingReach: number
  coupon: { store: string; title: string }
  // 방문을 확인하려고 매장 직원이 입력하는 4자리 숫자. 소유자에게만 보인다.
  staffPin?: string
  // 학생단체의 현장 PIN. 행사를 가진 단체에게만 보인다.
  groupPin?: string
  // PIN이 보이기 시작하는 날. 아직 보이지 않을 때만 있다.
  pinsFrom?: string
  // 오늘 틀린 PIN 시도 수. PIN이 보일 때만 있다.
  pinMisses?: number
  // 이 계정이 PIN을 바꿀 수 있다. 공용 데모 계정은 없다.
  canRotatePin?: boolean
  // 스폰서가 생기기 전의 행사 확인 방식(양쪽이 확정한 그대로. 각 스폰서의 것은
  // 아래에 있다)과, 현장이 행사 전체에 대해 확인한 것.
  methods: MeasureMethod[]
  venue: VenueCounts
  // 브랜드가 행사를 협찬하면 각 브랜드의 쿠폰, 집계, 가치가 따로 생긴다.
  // 이때부터 참여자는 행사의 쿠폰 대신 이 쿠폰을 받는다.\n|학생들 자신의
  // 리포트용: 행사 종류, 예상 참석자, 선택 설문의 집계.
  eventKind?: string
  makeup?: { years?: string[]; majors?: string }
  survey?: { responses: number; grade: Record<string, number>; field: Record<string, number>; visited: Record<string, number>; gender?: Record<string, number> }
  sponsors?: SponsorReport[]
}

export type SponsorReport = {
  // 브랜드의 협찬.
  id: string
  brandName: string
  coupon: { store: string; title: string }
  // 이 스폰서가 낸 금액(원). 단체가 각각 정하기 전에는 균등 분할이다.
  value: number
  coupons: number
  visits: number
  roas: number
  // 이 협찬을 확인하는 방식 (양쪽이 확정한 그대로).
  methods: MeasureMethod[]
  // 이 매장 직원의 PIN. 소유자에게만 보인다.
  staffPin?: string
} & VenueCounts

// 단체의 행사 하나와 그 실시간 집계 및 리포트.
export type EventMeasurement = {
  eventId: string
  metrics: Metrics
  report: Report
}

// 행사 QR을 스캔한 뒤 참여자가 보는 것.
export type CheckInInfo = {
  eventName: string
  eventDate: string
  groupName: string
  // 스폰서마다 하나, 스폰서가 생기기 전에는 행사 자체의 것("event").
  coupons: { id: string; store: string; title: string }[]
}

// 학생단체와 브랜드는 각자 메뉴가 있다 (data/navigation.ts).
export type NavLabel =
  | "대시보드"
  | "추천 매칭"
  | "받은 협찬"
  | "내 행사"
  | "성과"
  | "리포트"
  | "단체 찾기"
  | "받은 제안"
  | "행사 일정"
  | "성과 분석"

export type ModalName =
  | "portfolio-history"
  | "plan"
  | "compare"
  | "propose-many"
  | "report"
  | "qr"
  | "login"
  | "signup"
  | "reset"
  | "leave"
  | "measure-goals"
  | "password"
  | "contact"
  | "email"
  | "invite"
  | "metric-log"
  | "goal"
  | "ask"
  | "calendar"
  | "install"
  | "propose"
  | "post"
  | "safety"
  | "business"
  | "two-factor"
  | "devices"
  | "team"
  | "join"
  | "council-link"
  | "payment"
  | "payments"

// 학생회가 자신에게 연결한 동아리 하나에 대해 보는 것 (backend lib/council.ts):
// 다가오는 행사, 열린 제안, 지금까지의 협찬과 성과. 메시지, 연락처, 합의서는
// 절대 보이지 않는다.
export type CouncilClub = {
  id: string
  name: string
  type: string
  school: string
  listingId?: string
  industry?: Industry
  logo?: string
  linkedAt: string
  events: { id: string; name: string; date: string; endDate?: string; people?: string }[]
  eventCount: number
  openProposals: number
  sponsorships: number
  results: { scans: number; coupons: number; visits: number }
}

// 동아리가 연결한 학생회 (내 정보의 학생회 연결).
export type CouncilLink = { id: string; name: string; type: string; school: string; linkedAt: string }

// uniconnect에서 측정된 다른 행사들 가운데 한 수치: 그 중앙값, 행사 수, 이
// 행사가 그중 앞선 비율. 세 건 미만이면 없다.
export type Benchmark = { median: number; count: number; beats: number } | null

export type ScoreKey = "reach" | "scans" | "coupons" | "visits" | "qrRate" | "visitRate" | "roas"

// 상세 성과 리포트 (backend lib/premiumReport.ts): 협찬 하나의 상세 리포트.
// 쿠폰 날짜가 모두 지날 때까지는 실시간으로 계산한다.
export type PremiumReport = {
  number: string
  issuedAt: string
  final: boolean
  finalOn: string
  sponsorship: { id: string; brandName: string; groupName: string; eventName: string }
  event: {
    date: string
    endDate?: string
    venue?: string
    people?: string
    window: { start: string; end: string; visitsEnd: string }
  }
  spend: number
  averageSpend: number
  snsReach: number
  sales: number
  grade: "S" | "A" | "B" | "C" | "D"
  achievement: number
  scorecard: { key: ScoreKey; target: number; actual: number; achievement: number | null }[]
  funnel: { key: "audience" | "scans" | "coupons" | "visits"; count: number; rate: number | null; benchmark: Benchmark }[]
  costs: {
    perThousandReach: number | null
    perScan: number | null
    perCoupon: number | null
    perVisit: number | null
    perVisitBenchmark: Benchmark
    roasBenchmark: Benchmark
  }
  time: {
    hourly: { date: string; hour: number; scans: number }[]
    peak: { date: string; hour: number; scans: number } | null
    daily: { date: string; scans: number; coupons: number; visits: number }[]
    lag: { days: number[]; average: number | null; sample: number }
    recordsKept: number
  }
  effect: {
    before: number
    during: number
    days: number
    lift: number
    extraVisitors: number
    extraSales: number
    incrementalRoas: number
    attributedShare: number | null
  } | null
  fulfillment: { items: { side: ChatSide; label: string; done: boolean; proof: number }[]; done: number; proof: number }
  venue: VenueCounts
  methods: MethodKind[]
  reviews: { side: ChatSide; rating: number; tags: string[]; comment: string }[]
  advice: { code: string; values?: Record<string, number | string> }[]
  next: { id: string; name: string; school: string; category: string; score: number; event?: { name: string; date: string } }[]
  benchmarkCount: number
  groupName: string
  overview: {
    school: string
    category: string
    expectedAudience: number
    valueBreakdown: { type: string; value: number }[]
    coupon: { store: string; title: string }
    targets: Record<ScoreKey, number>
    agreedValue: { cash: number; inKind: number } | null
  }
  audience: {
    responses: number
    responseRate: number
    grade: Record<string, number>
    field: Record<string, number>
    visited: Record<string, number>
    firstTimeShare: number
  } | null
  visitsAnalysis: { redemption: number; sameDayShare: number | null; weekdays: number[]; newCustomers: number | null }
  roi: { breakEvenVisits: number | null; sensitivity: { factor: number; spendPerVisit: number; roas: number }[] }
  partner: { otherEvents: number; averageScanRate: number | null; rating: number | null; reviewCount: number }
  history: { count: number; averageRoas: number | null; averagePerVisit: number | null; rank: number | null }
}

// 페이지가 불러오는 리포트: 구매하기 전에는 가격이 붙은 미리보기다.
export type InsightAnswer =
  | {
      locked: true
      price: number
      open: boolean
      sponsorship: { id: string; groupName: string; eventName: string; date: string }
    }
  | { locked: false; report: PremiumReport; editable: boolean; shared: boolean; shareToken?: string }

// 캠퍼스 포트폴리오 (backend lib/portfolio.ts): Campus Partners 브랜드의 협찬을
// 모아 세 가지로 묶은 것.
export type PortfolioGroup = { key: string; count: number; spend: number; visits: number; coupons: number; sales: number; roas: number }

export type PortfolioRow = {
  id: string
  eventName: string
  groupName: string
  date: string
  school: string
  category: string
  spend: number
  coupons: number
  visits: number
  sales: number
  roas: number
}

export type Portfolio = {
  count: number
  totals: { spend: number; visits: number; coupons: number; sales: number; roas: number; costPerVisit: number | null; salesPerVisit: number | null }
  bySchool: PortfolioGroup[]
  byMonth: PortfolioGroup[]
  byCategory: PortfolioGroup[]
  best: PortfolioRow | null
  weakest: PortfolioRow | null
  rows: PortfolioRow[]
}

// 운영자 콘솔 (backend lib/console.ts).
export type AdminOverview = {
  stats: PlatformStats
  weekly: { week: string; signups: number; proposals: number; accepted: number }[]
  revenue: { total: number; thisMonth: number; byKind: Record<PaymentKind, number>; partners: number }
  attention: {
    applications: number
    inquiries: number
    reports: number
    transfers: number
    suspended: number
    // 일주일 넘게 기다리는 제안, 취소 요청이 들어온 합의서, 현장 알림
    // (lib/adminInsights.ts).
    stale: number
    cancels: number
    alerts: number
  }
}

export type AdminMember = {
  id: string
  name: string
  role: Role
  type: string
  email: string
  school: string
  createdAt: string
  lastSeen?: string
  suspendedAt?: string
  demo: boolean
  partnersUntil: string | null
  listed: boolean
  paused: boolean
  events: number
  sent: number
  sponsorships: number
  business: boolean
  // 운영자가 붙인 태그와, 다른 계정이 같은 전화번호나 사업자번호를 쓰는지 여부.
  tags: string[]
  duplicate: boolean
}

export type AdminProposalRow = {
  id: string
  kind: "request" | "offer"
  from: string
  to: string
  event: string
  date: string
  status: string
  createdAt: string
  example: boolean
  confirmed: boolean
}

export type AdminMemberDetail = AdminMember & {
  contact?: AccountContact
  eventList: { id: string; name: string; date: string; endDate?: string; people?: string }[]
  sentList: { id: string; partner: string; event: string; status: string; createdAt: string }[]
  receivedList: { id: string; partner: string; event: string; status: string; createdAt: string }[]
  payments: { id: string; orderName: string; amount: number; status: Payment["status"]; at: string }[]
  inquiries: number
  reportsAbout: number
  sessions: number
  // 회원에 대한 운영자의 메모.
  note: { text: string; at: string } | null
  businessNumber: string | null
  timeline: { at: string; kind: string; text: string }[]
  duplicates: { id: string; name: string; by: "phone" | "business" }[]
}

export type AgreementState = "draft" | "one" | "both" | "done" | "cancel"

export type AdminAgreementRow = {
  id: string
  from: string
  to: string
  event: string
  date: string
  state: AgreementState
  done: number
  items: number
  cancel: { by: ChatSide; reason: string; at: string } | null
  updatedAt: string
  example: boolean
}

export type AdminProposalDetail = {
  id: string
  kind: "request" | "offer"
  from: string
  to: string
  event: string
  date: string
  terms: string
  status: string
  createdAt: string
  respondedAt: string | null
  canceledAt: string | null
  fromPost: boolean
  agreement: AdminAgreementRow | null
  metrics: { scans: number; coupons: number; visits: number } | null
}

export type AdminStaleProposal = {
  id: string
  from: string
  to: string
  event: string
  createdAt: string
  waitingDays: number
  canNudge: boolean
}

export type AdminEventRow = {
  id: string
  name: string
  date: string
  endDate: string | null
  owner: string
  role: Role | null
  example: boolean
  sponsors: number
  scans: number
}

export type AdminLive = {
  events: (AdminEventRow & {
    coupons: number
    visits: number
    hourly: { hour: number; scans: number }[]
    lastAt: string | null
    pinMisses: number
  })[]
  alerts: { eventId: string; event: string; kind: "pin" | "visits-over-coupons" | "visit-burst"; detail: string }[]
}

export type AdminPostRow = {
  id: string
  title: string
  poster: string
  deadline: string
  createdAt: string
  closedAt: string | null
  hiddenAt: string | null
}

export type AdminReviewRow = {
  id: string
  author: string
  about: string
  event: string
  rating: number
  comment: string
  createdAt: string
  hiddenAt: string | null
  pinnedAt: string | null
}

export type AdminInvites = {
  sent: number
  joined: number
  rate: number | null
  byInviter: { name: string; sent: number; joined: number }[]
}

export type FaqTopicKey = "start" | "account" | "proposal" | "schedule" | "message" | "results"

// 운영자가 추가한 도움말 질문(한국어만)과, 한국어 문구로 가리킨 숨긴 기본 질문.
export type SiteFaq = {
  added: { id: string; topic: FaqTopicKey; question: string; answer: string; featured?: boolean; createdAt: string }[]
  hidden: string[]
}

// 회원만 센다. 데모 계정과 시드는 제외한다 (backend lib/stats.ts).
export type SiteCounts = { groups: number; brands: number; schools: number; sponsorships: number }

export type SiteState = {
  maintenance: { message: string } | null
  signupsClosed: boolean
  faq: SiteFaq
  counts?: SiteCounts
  // 운영자가 설정했다면 Kakao 지도의 JavaScript 키.
  maps?: { kakao: string }
}

export type AdminInsights = {
  funnel: { step: string; count: number }[]
  cohorts: { week: string; size: number; active: (number | null)[] }[]
  distribution: {
    schools: { label: string; count: number }[]
    industries: { label: string; count: number }[]
    types: { label: string; count: number }[]
    map: { groups: { name: string; lat: number; lng: number; count: number }[]; brands: { name: string; lat: number; lng: number }[] }
  }
  kpi: { key: "signups" | "proposals" | "revenue"; actual: number; target: number | null }[]
  searches: { term: string; count: number }[]
}

export type AdminSystem = {
  limits: { message: string; limit: number; minutes: number; counting: number; blocked: number }[]
  backups: { hour: string; bytes: number }[]
  cronRuns: { at: string; sent: number }[]
  maintenance: { on: boolean; message?: string; blockSignups?: boolean }
}

// 운영자가 콘솔에서 한 일과, 지금의 이름으로 적은 대상.
export type AdminLogRow = {
  id: string
  at: string
  action: string
  target: { kind: string; id: string }
  detail?: string
  label: string | null
}

// API가 어떤 서비스에 맞춰 설정됐는지, 예와 아니오로.
export type AdminHealth = {
  storage: "postgres" | "file"
  payments: "off" | "test" | "live"
  checks: { key: string; on: boolean }[]
  vercel: boolean
  region: string | null
  commit: string | null
  data: { accounts: number; sessions: number; payments: number; logEntries: number }
}

// 운영자가 사이트 맨 위에 띄우는 공지.
export type SiteNotice = { id: string; text: string; tone: "info" | "warning" }

export type AdminAnnouncement = SiteNotice & {
  audience: "all" | Role
  from?: string
  until?: string
  dismissals?: number
  createdAt: string
  endedAt?: string
  live: boolean
}

// 행사 둘러보기 (GET /api/events/explore): 계정에게 보이는 단체의 다가오는
// 행사와 브랜드에 제공하는 것.
export type ExploreEvent = {
  id: string
  name: string
  date: string
  endDate?: string
  kind?: string
  people: string
  venue?: string
  intro?: string
  packages: { name: string; gives: string }[]
  promo?: { spots: string[]; handouts: string[]; posts: string[] }
  group: { id: string; name: string; school?: string; category: string; type: string }
  own?: true
}

// 한 종류의 행사가 확정한 협찬을 건수로 센 것.
export type EventCase = { kind: string; sponsorships: number; averagePeople?: number; industries: string[]; asks: string[] }

// 학생단체의 장부에 오른 협찬 한 건 (routes/ledger.ts): 금액은 단체가 금액을
// 공개하는 경우에만 담는다.
export type LedgerEntry = {
  id: string
  eventName: string
  eventDate: string
  brandName: string
  gives: string
  value?: number
  note?: string
  scans?: number
}

export type PublicLedger = {
  group: { name: string; school: string }
  showValues: boolean
  entries: LedgerEntry[]
  totals: { sponsorships: number; brands: number; value?: number }
}

export type OwnLedger = { token: string | null; showValues: boolean; entries: LedgerEntry[] }
