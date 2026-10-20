export type Role = "학생단체" | "브랜드"

export type Industry =
  | "cafe"
  | "photo"
  | "wellness"
  | "performance"
  | "content"
  | "sports"

export type Match = {
  id: string
  name: string
  category: string
  industry: Industry
  // Logo image URL; the frontend shows an industry graphic when it is missing.
  logo?: string
  offer: string
  score: number
  tags: string[]
}

export type EventStatus = "매칭 중" | "집행 예정" | "측정 완료"

export type EventItem = {
  id: string
  name: string
  date: string
  people: string
  types: string[]
  status: EventStatus
  createdAt: string
}

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  passwordHash: string
  termsAgreedAt: string
  createdAt: string
}

export type PublicAccount = Omit<Account, "passwordHash" | "termsAgreedAt">

export type Session = {
  token: string
  accountId: string
  expiresAt: number
}

export type EmailCode = {
  email: string
  role: Role
  code: string
  expiresAt: number
  attempts: number
  verificationToken?: string
  verifiedUntil?: number
}

export type Metrics = {
  scans: number
  coupons: number
  visits: number
}

export type Database = {
  accounts: Account[]
  sessions: Session[]
  emailCodes: EmailCode[]
  // Recommended partners for each side: brands for student groups and vice versa.
  matches: Record<Role, Match[]>
  // Keyed by account id.
  events: Record<string, EventItem[]>
  proposals: Record<string, string[]>
  // Accounts whose events are shown to visitors who are not logged in.
  demoAccountIds: Record<Role, string>
  metrics: Metrics
}
