import type { CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { Icon } from "../components/Icon"
import { Pill } from "../components/Pill"
import { RevealTitle, RevealWords } from "../components/RevealText"
import { profileLabels } from "../data/profile"
import { lang, setLang, t, type Lang } from "../i18n"
import { formatFullDate, toIsoDate } from "../lib/date"
import { initialOf } from "../lib/format"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, Match, NavLabel } from "../types"

export type ActivityItem = {
  label: string
  value: string
  // Page with the items behind the count.
  target: NavLabel
}

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// Blue, silver and slate, as in Stride's stats bento.
const tileLooks = ["blue", "silver", "slate"]

// The languages the app is in, each named in itself.
const languages: { code: Lang; name: string }[] = [
  { code: "ko", name: "한국어" },
  { code: "en", name: "English" },
]

// The account's own page: a banner on Stride's deep blue mesh with who it
// is, what it has done so far as three tiles, the introduction the other
// side sees, the account's details and its language as rows, logout and,
// quietly under it, leaving.
export function ProfilePage({
  account,
  listing,
  activity,
  onBack,
  onEdit,
  onNavigate,
  onLogout,
  onChangePassword,
  onLeave,
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
  onChangePassword: () => void
  onLeave: () => void
}) {
  const students = account.role === "학생단체"
  const labels = profileLabels[account.role]
  const details = [
    { label: t("회원 유형"), value: `${t(account.role)} · ${t(account.type)}` },
    ...(account.school ? [{ label: t("학교"), value: account.school }] : []),
    { label: t("이메일"), value: account.email },
    { label: t("가입일"), value: formatFullDate(toIsoDate(new Date(account.createdAt))) },
  ]

  return (
    <section className="page-view profile-view">
      <div className="detail-top">
        <button aria-label={t("뒤로")} className="back-pill" onClick={onBack} type="button">
          <Icon name="chevron" size={16} />
          <span>{t("뒤로")}</span>
        </button>
      </div>

      <header className="banner-hero profile-banner">
        <MeshBackdrop seed={5.1} />
        <div className="banner-content">
          <div className="banner-top">
            <span className="eyebrow light">My Page</span>
            <span className="banner-role">
              {students ? t("협찬 받기 · 학생단체") : t("협찬 하기 · 브랜드")}
            </span>
          </div>
          <div className="banner-identity">
            <div aria-hidden="true" className="avatar large">
              {initialOf(account.name)}
            </div>
            <div>
              <span className="banner-meta">
                {account.school ? `${account.school} · ${t(account.type)}` : t(account.type)}
              </span>
              <RevealTitle className="banner-title">{account.name}</RevealTitle>
            </div>
          </div>
          <div className="banner-bottom">
            <span className="banner-note">{t("내 정보 · 공개 소개 · 활동")}</span>
            <div className="banner-actions">
              <Pill arrow="up-right" onClick={onEdit} variant="white">
                {listing ? t("소개 편집하기") : t("소개 등록하기")}
              </Pill>
            </div>
          </div>
        </div>
      </header>

      <ul className="activity-tiles">
        {activity.map((item, index) => (
          <li data-reveal key={item.label} style={delay(index * 0.12)}>
            <button className={`activity-tile ${tileLooks[index] ?? "silver"}`} onClick={() => onNavigate(item.target)} type="button">
              <strong>
                <AnimatedNumber value={item.value} />
              </strong>
              <small>{item.label}</small>
            </button>
          </li>
        ))}
      </ul>

      <section className="about-block">
        <div className="about-side">
          <span className="eyebrow">{t("공개 소개")}</span>
          <Icon name="link" size={220} />
          <p className="about-note" data-reveal>
            <Icon name="users" size={20} />
            <span>
              {students
                ? t("브랜드가 단체 찾기에서 보는 정보예요.")
                : t("학생단체가 추천 매칭에서 보는 정보예요.")}
            </span>
          </p>
        </div>
        <div className="about-copy">
          {listing ? (
            <>
              {listing.intro ? (
                <RevealWords className="about-statement">{listing.intro}</RevealWords>
              ) : (
                <p className="about-statement muted">{t("소개 문장이 아직 없어요.")}</p>
              )}
              <div className="about-offer" data-reveal style={delay(0.15)}>
                <span>{labels.offer}</span>
                <strong>{listing.offer}</strong>
              </div>
            </>
          ) : (
            <p className="about-statement muted">
              {students
                ? t("아직 소개가 없어요. 소개를 등록하면 브랜드가 찾기에서 보고 문의할 수 있어요.")
                : t("아직 소개가 없어요. 소개를 등록하면 학생단체가 찾기에서 보고 문의할 수 있어요.")}
            </p>
          )}
          <div className="about-foot" data-reveal style={delay(0.2)}>
            {listing ? (
              <ul className="summary-chips">
                <li>{t("기본 정보 {count}개", { count: listing.facts?.length ?? 0 })}</li>
                <li>{t("SNS {count}개", { count: listing.sns?.length ?? 0 })}</li>
                <li>
                  {t("{label} {count}개", { label: labels.portfolio, count: listing.portfolio?.length ?? 0 })}
                </li>
              </ul>
            ) : (
              <span>{t("소개 · 협찬 내용 · SNS · {portfolio}", { portfolio: labels.portfolio })}</span>
            )}
            <Pill arrow="up-right" onClick={onEdit} variant="outline">
              {listing ? t("편집하기") : t("소개 등록하기")}
            </Pill>
          </div>
        </div>
      </section>

      <section className="service-section">
        <span className="eyebrow" data-reveal>
          Account
        </span>
        <RevealTitle as="h2" className="section-display">
          {t("계정 정보")}
        </RevealTitle>
        <dl className="service-list">
          {details.map((detail, index) => (
            <div className="service-row" data-reveal key={detail.label} style={delay(index * 0.08)}>
              <span className="service-index">{pad(index + 1)}</span>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
          {/* Picking the other language reloads the page in it, remembered
              for the next visit, as the footer's switch does. */}
          <div className="service-row" data-reveal style={delay(details.length * 0.08)}>
            <span className="service-index">{pad(details.length + 1)}</span>
            <dt id="language-label">{t("언어")}</dt>
            <dd>
              <span aria-labelledby="language-label" className="lang-choice" role="group">
                {languages.map((item) => (
                  <button
                    aria-pressed={lang === item.code}
                    className={lang === item.code ? "active" : undefined}
                    key={item.code}
                    lang={item.code}
                    onClick={() => {
                      if (lang !== item.code) setLang(item.code)
                    }}
                    type="button"
                  >
                    {item.name}
                  </button>
                ))}
              </span>
            </dd>
          </div>
        </dl>
        <div className="profile-logout">
          <div className="profile-account-actions">
            <Pill onClick={onLogout} variant="outline">
              {t("로그아웃")}
            </Pill>
            <Pill onClick={onChangePassword} variant="silver">
              {t("비밀번호 변경")}
            </Pill>
          </div>
          <button className="leave-link" onClick={onLeave} type="button">
            {t("회원 탈퇴")}
          </button>
        </div>
      </section>
    </section>
  )
}
