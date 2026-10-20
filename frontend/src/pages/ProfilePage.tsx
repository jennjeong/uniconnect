import { AnimatedNumber } from "../components/AnimatedNumber"
import { Icon } from "../components/Icon"
import { formatFullDate, toIsoDate } from "../lib/date"
import { initialOf } from "../lib/format"
import type { Account, NavLabel } from "../types"

export type ActivityItem = {
  label: string
  value: string
  // Page with the items behind the count.
  target: NavLabel
}

// The account's own page: who it is, what it has done so far, and logout.
export function ProfilePage({
  account,
  activity,
  onBack,
  onNavigate,
  onLogout,
}: {
  account: Account
  // Counts such as events registered and proposals sent.
  activity: ActivityItem[]
  onBack: () => void
  onNavigate: (label: NavLabel) => void
  onLogout: () => void
}) {
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
