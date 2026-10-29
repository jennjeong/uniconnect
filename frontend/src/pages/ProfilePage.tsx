import type { ReactNode } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { Icon, type IconName } from "../components/Icon"
import { Pill } from "../components/Pill"
import { PlanCard } from "../components/PlanCard"
import { RevealTitle } from "../components/RevealText"
import { mailKinds } from "../data/mail"
import { profileLabels } from "../data/profile"
import { socialNames } from "../data/social"
import { lang, setLang, t, type Lang } from "../i18n"
import { formatFullDate, toIsoDate } from "../lib/date"
import { initialOf } from "../lib/format"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, BlockedListing, BusinessStatus, MailKind, Match, NavLabel, SocialProvider } from "../types"

export type ActivityItem = {
  label: string
  value: string
  // Page with the items behind the count.
  target: NavLabel
}

// The languages the app is in, each named in itself.
const languages: { code: Lang; name: string }[] = [
  { code: "ko", name: "한국어" },
  { code: "en", name: "English" },
]

// A settings card: an icon, a title and what it holds, then its rows.
function SettingsCard({
  id,
  icon,
  title,
  caption,
  children,
}: {
  id: string
  icon: IconName
  title: string
  caption: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="settings-card" id={id}>
      <header className="settings-card-head">
        <span aria-hidden="true" className="settings-card-icon">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{caption}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

// One row of a card: what it is, its value, and the action beside it.
function SettingsRow({
  label,
  labelId,
  value,
  action,
}: {
  label: string
  labelId?: string
  value?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="settings-row">
      <dt id={labelId}>{label}</dt>
      <dd>{value}</dd>
      {action && <div className="settings-action">{action}</div>}
    </div>
  )
}

// A row's action: a short word on screen, the whole action for screen readers.
function RowButton({ label, children, onClick, tone }: { label: string; children: ReactNode; onClick?: () => void; tone?: "point" | "danger" }) {
  return (
    <button aria-label={label} className={tone ? `row-button ${tone}` : "row-button"} onClick={onClick} type="button">
      {children}
    </button>
  )
}

// The account's own page, as a settings page: a compact card on Stride's
// deep blue mesh with who it is, its three counts and the introduction's
// edit button, then cards for the introduction the other side sees, the
// account, logging in and security, notices and display, the people and
// groups it works with, and its data with leaving. Wide screens keep a list
// of the cards beside them to jump to.
export function ProfilePage({
  account,
  listing,
  activity,
  onBack,
  onEdit,
  onNavigate,
  onLogout,
  onChangePassword,
  onTwoFactor,
  onDevices,
  onPayments,
  onPlan,
  onTeam,
  socialProviders,
  onSocialLink,
  onCouncil,
  onCouncilLink,
  onSocialUnlink,
  onChangeContact,
  onChangeEmail,
  onDownloadData,
  onLeave,
  blocked,
  onUnblock,
  business,
  onVerifyBusiness,
  onPause,
  onMail,
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
  // Two-step login and the device list; absent for the shared demo accounts.
  onTwoFactor?: () => void
  onDevices?: () => void
  // A brand's payments to the platform; absent for groups and the demo accounts.
  onPayments?: () => void
  // A brand's plan card (components/PlanCard.tsx), with where its notices go.
  onPlan?: (message: string) => void
  // The people running the account with its owner; absent for the demo accounts.
  onTeam?: () => void
  // Kakao or Naver to link for logging in (the owner's; none for the demo accounts).
  socialProviders: SocialProvider[]
  onSocialLink: (provider: SocialProvider) => void
  // A council's clubs page, and a club's links to its councils; absent
  // where they don't apply (brands, the demo accounts).
  onCouncil?: () => void
  onCouncilLink?: () => void
  onSocialUnlink: (provider: SocialProvider) => void
  // The person running the account (modals/ContactModal.tsx).
  onChangeContact: () => void
  onChangeEmail: () => void
  onDownloadData: () => void
  onLeave: () => void
  // The accounts this one blocked, to unblock; absent for the demo accounts.
  blocked?: BlockedListing[]
  onUnblock?: (item: BlockedListing) => void
  // A brand's business check; absent for groups and the demo brand.
  business?: BusinessStatus
  onVerifyBusiness?: () => void
  // 목록에서 숨기기: takes the listing out of the other side's lists for now,
  // or shows it again; absent for the demo accounts.
  onPause?: (paused: boolean) => void
  // 받을 메일: the kinds of notice email to turn off; absent for the demo accounts.
  onMail?: (mailOff: MailKind[]) => void
}) {
  const students = account.role === "학생단체"
  const labels = profileLabels[account.role]
  const owner = !account.asMember
  const verified = business?.business
  const paused = listing?.pausedAt !== undefined
  const mailOff = account.mailOff ?? []
  const social = onTeam && owner ? socialProviders : []
  const together = Boolean(onTeam || onCouncil || onCouncilLink || blocked)

  const cards: { id: string; icon: IconName; label: string }[] = [
    { id: "profile-public", icon: "file", label: t("공개 소개") },
    { id: "profile-account", icon: "user", label: t("계정") },
    { id: "profile-security", icon: "lock", label: t("로그인과 보안") },
    { id: "profile-prefs", icon: "bell", label: t("알림과 표시") },
    ...(together ? [{ id: "profile-together", icon: "users" as IconName, label: t("함께하는 사람") }] : []),
    ...(onPlan ? [{ id: "profile-plan", icon: "won" as IconName, label: t("요금제") }] : []),
    { id: "profile-data", icon: "download", label: t("내 데이터") },
  ]

  return (
    <section className="page-view profile-view">
      <div className="detail-top">
        <button aria-label={t("뒤로")} className="back-pill" onClick={onBack} type="button">
          <Icon name="chevron" size={16} />
          <span>{t("뒤로")}</span>
        </button>
      </div>

      <header className="profile-hero">
        <MeshBackdrop seed={5.1} />
        <div className="profile-hero-inner">
          <div className="profile-hero-who">
            <div aria-hidden="true" className="avatar large">
              {initialOf(account.name)}
            </div>
            <div>
              <span className="eyebrow light">{students ? t("협찬 받기 · 학생단체") : t("협찬 하기 · 브랜드")}</span>
              <RevealTitle className="profile-hero-name">{account.name}</RevealTitle>
              <span className="profile-hero-meta">
                {[account.school, t(account.type), account.email].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          <Pill arrow="up-right" onClick={onEdit} variant="white">
            {listing ? t("소개 편집하기") : t("소개 등록하기")}
          </Pill>
        </div>
        <ul className="profile-hero-stats">
          {activity.map((item) => (
            <li key={item.label}>
              <button onClick={() => onNavigate(item.target)} type="button">
                <strong>
                  <AnimatedNumber value={item.value} />
                </strong>
                <small>{item.label}</small>
              </button>
            </li>
          ))}
        </ul>
      </header>

      <div className="settings-layout">
        <nav aria-label={t("내 정보 목차")} className="settings-nav">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => document.getElementById(card.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              type="button"
            >
              <Icon name={card.icon} size={16} />
              {card.label}
            </button>
          ))}
        </nav>

        <div className="settings-cards">
          <SettingsCard
            caption={students ? t("브랜드가 단체 찾기에서 보는 정보예요.") : t("학생단체가 추천 매칭에서 보는 정보예요.")}
            icon="file"
            id="profile-public"
            title={t("공개 소개")}
          >
            {listing ? (
              <div className="settings-public">
                <p className={listing.intro ? "settings-intro" : "settings-intro muted"}>
                  {listing.intro || t("소개 문장이 아직 없어요.")}
                </p>
                <dl className="settings-offer">
                  <dt>{labels.offer}</dt>
                  <dd>{listing.offer}</dd>
                </dl>
                <ul className="summary-chips">
                  <li>{t("기본 정보 {count}개", { count: listing.facts?.length ?? 0 })}</li>
                  <li>{t("SNS {count}개", { count: listing.sns?.length ?? 0 })}</li>
                  <li>{t("{label} {count}개", { label: labels.portfolio, count: listing.portfolio?.length ?? 0 })}</li>
                </ul>
              </div>
            ) : (
              <p className="settings-intro muted">
                {students
                  ? t("아직 소개가 없어요. 소개를 등록하면 브랜드가 찾기에서 보고 문의할 수 있어요.")
                  : t("아직 소개가 없어요. 소개를 등록하면 학생단체가 찾기에서 보고 문의할 수 있어요.")}
              </p>
            )}
            <dl className="settings-rows">
              {onPause && listing && (
                <SettingsRow
                  action={
                    <button
                      aria-checked={paused}
                      aria-labelledby="pause-label"
                      className="toggle-switch"
                      onClick={() => onPause(!paused)}
                      role="switch"
                      type="button"
                    />
                  }
                  label={t("목록에서 숨기기")}
                  labelId="pause-label"
                  value={
                    <small>
                      {paused
                        ? t("숨기는 중이에요. 상대 목록에 보이지 않고 새 제안을 받지 않아요.")
                        : t("협찬을 받지 않는 동안 상대 목록에서 잠시 빼 둘 수 있어요.")}
                    </small>
                  }
                />
              )}
            </dl>
            <div className="settings-card-foot">
              <Pill arrow="up-right" onClick={onEdit} variant="outline">
                {listing ? t("편집하기") : t("소개 등록하기")}
              </Pill>
            </div>
          </SettingsCard>

          <SettingsCard caption={t("가입 정보와 담당자예요. 담당자는 협찬이 확정된 상대에게만 보여요.")} icon="user" id="profile-account" title={t("계정")}>
            <dl className="settings-rows">
              <SettingsRow label={t("회원 유형")} value={`${t(account.role)} · ${t(account.type)}`} />
              {account.school && <SettingsRow label={t("학교")} value={account.school} />}
              <SettingsRow
                action={
                  owner && (
                    <RowButton label={t("로그인 이메일 바꾸기")} onClick={onChangeEmail}>
                      {t("변경")}
                    </RowButton>
                  )
                }
                label={t("이메일")}
                value={account.email}
              />
              <SettingsRow
                action={
                  <RowButton label={t("담당자 정보 수정")} onClick={onChangeContact}>
                    {t("수정")}
                  </RowButton>
                }
                label={t("담당자 정보")}
                value={
                  account.contact
                    ? `${account.contact.name} · ${t(account.contact.position)} · ${account.contact.phone}`
                    : t("아직 없어요")
                }
              />
              <SettingsRow label={t("가입일")} value={formatFullDate(toIsoDate(new Date(account.createdAt)))} />
              {business && (
                <SettingsRow
                  action={
                    !verified &&
                    business.ready && (
                      <RowButton label={t("사업자 확인하기")} onClick={onVerifyBusiness} tone="point">
                        {t("확인하기")}
                      </RowButton>
                    )
                  }
                  label={t("사업자 확인")}
                  value={
                    verified ? (
                      <span className="settings-ok">
                        <Icon name="check" size={14} />
                        {t("확인됨 · {number} · {date}", {
                          number: verified.number,
                          date: formatFullDate(toIsoDate(new Date(verified.verifiedAt))),
                        })}
                      </span>
                    ) : business.ready ? (
                      t("아직 확인하지 않았어요")
                    ) : (
                      t("아직 준비 중이에요")
                    )
                  }
                />
              )}
            </dl>
          </SettingsCard>

          <SettingsCard caption={t("비밀번호와 2단계 인증, 연결한 계정, 로그인한 기기를 관리해요.")} icon="lock" id="profile-security" title={t("로그인과 보안")}>
            {account.asMember && (
              <p className="profile-member-note">
                {t("{name}님은 공동 관리자로 로그인했어요. 탈퇴, 로그인 이메일 바꾸기, 2단계 인증은 대표만 할 수 있어요.", {
                  name: account.asMember.name,
                })}
              </p>
            )}
            <dl className="settings-rows">
              <SettingsRow
                action={
                  <RowButton label={t("비밀번호 변경")} onClick={onChangePassword}>
                    {t("변경")}
                  </RowButton>
                }
                label={t("비밀번호")}
                value={t("영문 · 숫자 · 특수문자를 섞은 8자 이상")}
              />
              {onTwoFactor && owner && (
                <SettingsRow
                  action={
                    <RowButton
                      label={account.twoFactorOn ? t("2단계 인증 · 켜짐") : t("2단계 인증 켜기")}
                      onClick={onTwoFactor}
                      tone={account.twoFactorOn ? undefined : "point"}
                    >
                      {account.twoFactorOn ? t("관리") : t("켜기")}
                    </RowButton>
                  }
                  label={t("2단계 인증")}
                  value={
                    account.twoFactorOn ? (
                      <span className="settings-ok">
                        <Icon name="check" size={14} />
                        {t("켜져 있어요")}
                      </span>
                    ) : (
                      t("꺼져 있어요. 켜면 인증 앱의 코드도 있어야 로그인돼요.")
                    )
                  }
                />
              )}
              {social.map((provider) => {
                const name = t(socialNames[provider])
                const linked = account.socialLinks?.includes(provider)
                return (
                  <SettingsRow
                    action={
                      linked ? (
                        <RowButton label={t("{provider} 연결 끊기", { provider: name })} onClick={() => onSocialUnlink(provider)}>
                          {t("끊기")}
                        </RowButton>
                      ) : (
                        <RowButton label={t("{provider} 계정 연결", { provider: name })} onClick={() => onSocialLink(provider)} tone="point">
                          {t("연결")}
                        </RowButton>
                      )
                    }
                    key={provider}
                    label={t("{provider} 로그인", { provider: name })}
                    value={
                      linked
                        ? t("연결돼 있어요. {provider}로 로그인할 수 있어요.", { provider: name })
                        : t("연결하면 {provider}로도 로그인할 수 있어요.", { provider: name })
                    }
                  />
                )
              })}
              {onDevices && (
                <SettingsRow
                  action={
                    <RowButton label={t("로그인한 기기")} onClick={onDevices}>
                      {t("보기")}
                    </RowButton>
                  }
                  label={t("로그인한 기기")}
                  value={t("지금 로그인한 기기를 보고, 다른 기기를 로그아웃시켜요.")}
                />
              )}
            </dl>
            <div className="settings-card-foot">
              <Pill onClick={onLogout} variant="outline">
                {t("로그아웃")}
              </Pill>
            </div>
          </SettingsCard>

          <SettingsCard caption={t("화면의 언어와 받을 메일을 골라요.")} icon="bell" id="profile-prefs" title={t("알림과 표시")}>
            <dl className="settings-rows">
              {/* Picking the other language reloads the page in it, remembered
                  for the next visit, as the footer's switch does. */}
              <SettingsRow
                action={
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
                }
                label={t("언어")}
                labelId="language-label"
                value={t("화면과 메일에 쓰는 언어예요.")}
              />
            </dl>
            {onMail && (
              <fieldset aria-labelledby="mail-label" className="mail-choices">
                <span className="settings-subhead" id="mail-label">
                  {t("받을 메일")}
                </span>
                {mailKinds.map((item) => (
                  <label key={item.kind}>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.caption}</small>
                    </span>
                    <input
                      checked={!mailOff.includes(item.kind)}
                      className="toggle-check"
                      onChange={(event) =>
                        onMail(event.target.checked ? mailOff.filter((kind) => kind !== item.kind) : [...mailOff, item.kind])
                      }
                      type="checkbox"
                    />
                  </label>
                ))}
                <small className="mail-note">{t("인증번호와 계정 안내 메일은 언제나 보내요. 메일은 지금 쓰는 언어로 가요.")}</small>
              </fieldset>
            )}
          </SettingsCard>

          {together && (
            <SettingsCard caption={t("계정을 함께 쓰는 사람과 연결한 단체, 차단한 상대예요.")} icon="users" id="profile-together" title={t("함께하는 사람")}>
              <dl className="settings-rows">
                {onTeam && (
                  <SettingsRow
                    action={
                      <RowButton label={t("함께 관리하는 사람")} onClick={onTeam}>
                        {t("관리")}
                      </RowButton>
                    }
                    label={t("함께 관리하는 사람")}
                    value={t("임원이 각자 이메일로 같은 계정에 들어와요.")}
                  />
                )}
                {onCouncil && (
                  <SettingsRow
                    action={
                      <RowButton label={t("소속 단체 보기")} onClick={onCouncil}>
                        {t("보기")}
                      </RowButton>
                    }
                    label={t("소속 단체")}
                    value={t("학생회에 연결한 동아리를 한곳에서 봐요.")}
                  />
                )}
                {onCouncilLink && (
                  <SettingsRow
                    action={
                      <RowButton label={t("학생회 연결")} onClick={onCouncilLink}>
                        {t("연결")}
                      </RowButton>
                    }
                    label={t("학생회")}
                    value={t("학생회 코드로 소속 학생회에 연결해요.")}
                  />
                )}
                {blocked && (
                  <SettingsRow
                    label={t("차단한 상대")}
                    value={
                      blocked.length === 0 ? (
                        t("없어요")
                      ) : (
                        <ul className="blocked-list">
                          {blocked.map((item) => (
                            <li key={item.listingId}>
                              <span>{item.name}</span>
                              <button className="subtle-link" onClick={() => onUnblock?.(item)} type="button">
                                {t("차단 풀기")}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    }
                  />
                )}
              </dl>
            </SettingsCard>
          )}

          {onPlan && (
            <SettingsCard caption={t("브랜드는 무료로 시작하고, 제안을 더 보내고 리포트와 포트폴리오 분석까지 보려면 캠퍼스 파트너스를 써요.")} icon="won" id="profile-plan" title={t("요금제")}>
              <PlanCard onNotice={onPlan} />
            </SettingsCard>
          )}

          <SettingsCard caption={t("계정이 만들고 받은 모든 것을 파일로 받거나, 계정을 지워요.")} icon="download" id="profile-data" title={t("내 데이터")}>
            <dl className="settings-rows">
              {onPayments && (
                <SettingsRow
                  action={
                    <RowButton label={t("결제 내역")} onClick={onPayments}>
                      {t("보기")}
                    </RowButton>
                  }
                  label={t("결제 내역")}
                  value={t("수수료, 상세 리포트, 캠퍼스 파트너스 결제와 영수증이에요.")}
                />
              )}
              <SettingsRow
                action={
                  <RowButton label={t("내 데이터 내려받기")} onClick={onDownloadData}>
                    {t("내려받기")}
                  </RowButton>
                }
                label={t("내 데이터 내려받기")}
                value={t("소개, 행사, 제안, 메시지를 JSON 파일로 받아요.")}
              />
              {owner && (
                <SettingsRow
                  action={
                    <RowButton label={t("회원 탈퇴")} onClick={onLeave} tone="danger">
                      {t("탈퇴하기")}
                    </RowButton>
                  }
                  label={t("회원 탈퇴")}
                  value={t("계정과 계정이 만든 것이 모두 지워지고 되돌릴 수 없어요.")}
                />
              )}
            </dl>
          </SettingsCard>
        </div>
      </div>
    </section>
  )
}
