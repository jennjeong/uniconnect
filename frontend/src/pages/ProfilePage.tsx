import { AnimatedNumber } from "../components/AnimatedNumber"
import { Icon } from "../components/Icon"
import { profileLabels } from "../data/profile"
import { formatFullDate, toIsoDate } from "../lib/date"
import { initialOf } from "../lib/format"
import type { Account, Match, NavLabel } from "../types"

export type ActivityItem = {
  label: string
  value: string
  // Page with the items behind the count.
  target: NavLabel
}

// The account's own page: who it is, the introduction the other side sees,
// what it has done so far, and logout.
export function ProfilePage({
  account,
  listing,
  activity,
  onBack,
  onEdit,
  onNavigate,
  onLogout,
}: {
  account: Account
  // The listing brands (or student groups) see; null until written.
  listing: Match | null
  // Counts such as events registered and proposals sent.
  activity: ActivityItem[]
  onBack: () => void
  onEdit: () => void
  onNavigate: (label: NavLabel) => void
  onLogout: () => void
}) {
  const students = account.role === "학생단체"
  const viewers = students ? "브랜드" : "학생단체"
  const labels = profileLabels[account.role]
  const details = [
    { label: "회원 유형", value: `${account.role} · ${account.type}` },
    ...(account.school ? [{ label: "학교", value: account.school }] : []),
    { label: "이메일", value: account.email },
    { label: "가입일", value: formatFullDate(toIsoDate(new Date(account.createdAt))) },
  ]

  return (
    <section className="page-view profile-view">
      <div className="create-head">
        <button aria-label="뒤로" className="back-button" onClick={onBack} type="button">
          <Icon name="chevron" size={18} />
        </button>
        <div>
          <span className="section-kicker dark">MY PAGE</span>
          <p className="section-title">내 정보</p>
        </div>
      </div>

      <div className="profile-hero">
        <div className="avatar large">{initialOf(account.name)}</div>
        <div>
          <span className="profile-role">
            {account.role === "학생단체" ? "협찬 받기 · 학생단체" : "협찬 하기 · 브랜드"}
          </span>
          <strong>{account.name}</strong>
          <small>{account.school ? `${account.school} · ${account.type}` : account.type}</small>
        </div>
      </div>

      <div className="profile-stats stagger">
        {activity.map((item) => (
          <button
            className="stat-card"
            key={item.label}
            onClick={() => onNavigate(item.target)}
            type="button"
          >
            <span className="stat-top">
              <span>{item.label}</span>
              <Icon name="chevron" size={16} />
            </span>
            <span className="stat-value">
              <strong>
                <AnimatedNumber value={item.value} />
              </strong>
            </span>
          </button>
        ))}
      </div>

      <div className="form-card profile-public">
        <div className="profile-public-head">
          <div>
            <h3 className="form-card-title">공개 소개</h3>
            <p className="form-card-caption">
              {viewers}가 {students ? "단체 찾기" : "추천 매칭"}에서 보는 정보예요.
            </p>
          </div>
          <button className="detail-button" onClick={onEdit} type="button">
            <Icon name="edit" size={15} /> {listing ? "편집하기" : "소개 등록하기"}
          </button>
        </div>
        {listing ? (
          <>
            <p className="profile-public-intro">{listing.intro}</p>
            <div className="detail-offer">
              <span>{labels.offer}</span>
              <strong>{listing.offer}</strong>
            </div>
            <ul className="profile-public-summary">
              <li>기본 정보 {listing.facts?.length ?? 0}개</li>
              <li>SNS {listing.sns?.length ?? 0}개</li>
              <li>
                {labels.portfolio} {listing.portfolio?.length ?? 0}개
              </li>
            </ul>
          </>
        ) : (
          <p className="day-empty">
            아직 소개가 없어요. 소개를 등록하면 {viewers}가 찾기에서 보고 문의할 수 있어요.
          </p>
        )}
      </div>

      <div className="form-card profile-details">
        <h3 className="form-card-title">계정 정보</h3>
        <dl>
          {details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <button className="cancel-button profile-logout" onClick={onLogout} type="button">
        로그아웃
      </button>
    </section>
  )
}
