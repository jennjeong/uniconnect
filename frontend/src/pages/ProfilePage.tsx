import { useEffect, useState, type ReactNode } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { api } from "../api"
import { Icon, type IconName } from "../components/Icon"
import { Pill } from "../components/Pill"
import { AdCard } from "../components/AdCard"
import { LocalCard } from "../components/LocalCard"
import { PlanCard } from "../components/PlanCard"
import { RevealTitle } from "../components/RevealText"
import { ShareButton } from "../components/ShareButton"
import { mailKinds } from "../data/mail"
import { profileLabels } from "../data/profile"
import { socialNames } from "../data/social"
import { lang, setLang, t, type Lang } from "../i18n"
import { formatFullDate, toIsoDate } from "../lib/date"
import { initialOf } from "../lib/format"
import { referralLink } from "../lib/referral"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, BlockedListing, BusinessStatus, MailKind, Match, NavLabel, SocialProvider, GroupVerification } from "../types"

export type ActivityItem = {
  label: string
  value: string
  // 개수 뒤의 항목이 담긴 페이지.
  target: NavLabel
}

// 앱이 지원하는 언어. 각각 그 언어로 쓴다.
const languages: { code: Lang; name: string }[] = [
  { code: "ko", name: "한국어" },
  { code: "en", name: "English" },
]

// 설정 카드: 아이콘, 제목과 담긴 내용, 그리고 행.
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

// 카드의 행 하나: 무엇인지, 값, 그 옆의 동작.
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

// 행의 동작: 화면에는 짧은 말, 스크린 리더에는 전체 동작.
function RowButton({ label, children, onClick, tone }: { label: string; children: ReactNode; onClick?: () => void; tone?: "point" | "danger" }) {
  return (
    <button aria-label={label} className={tone ? `row-button ${tone}` : "row-button"} onClick={onClick} type="button">
      {children}
    </button>
  )
}

// 설정 페이지로서의 계정 자신의 페이지: 스트라이드의 짙은 파란색 메시 위의 작은
// 카드에 누구인지, 세 개수, 소개 수정 버튼을 두고, 이어서 상대편에게 보이는
// 소개, 계정, 로그인과 보안, 알림과 화면, 함께하는 사람과 단체, 데이터와 탈퇴의
// 카드가 나온다. 넓은 화면에서는 카드로 건너뛰는 목록이 옆에 남는다.
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
  onAd,
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
  groupCheck,
  onVerifyGroup,
  onPause,
  onMail,
  canInvite = false,
}: {
  account: Account
  // 브랜드(또는 학생단체)에게 보이는 리스팅. 작성 전에는 null.
  listing: Match | null
  // 등록한 행사와 보낸 제안 같은 개수.
  activity: ActivityItem[]
  onBack: () => void
  onEdit: () => void
  onNavigate: (label: NavLabel) => void
  onLogout: () => void
  onChangePassword: () => void
  // 2단계 인증과 기기 목록. 공용 데모 계정에는 없다.
  onTwoFactor?: () => void
  onDevices?: () => void
  // 계정이 플랫폼에 낸 결제(단체는 광고, 브랜드는 전부).
  onPayments?: () => void
  // 알림이 가는 곳과 함께 보이는 브랜드의 요금제 카드(components/PlanCard.tsx).
  onPlan?: (message: string) => void
  // Where the 상단 광고 card's notices go (components/AdCard.tsx).
  onAd: (message: string) => void
  // 소유자와 함께 계정을 운영하는 사람들. 데모 계정에는 없다.
  onTeam?: () => void
  // 로그인용으로 연결할 카카오나 네이버(소유자의 것. 데모 계정에는 없다).
  socialProviders: SocialProvider[]
  onSocialLink: (provider: SocialProvider) => void
  // 학생회의 동아리 페이지와, 동아리가 학생회에 거는 링크. 해당하지
  // 않으면(브랜드, 데모 계정) 없다.
  onCouncil?: () => void
  onCouncilLink?: () => void
  onSocialUnlink: (provider: SocialProvider) => void
  // 계정을 운영하는 사람(modals/ContactModal.tsx).
  onChangeContact: () => void
  onChangeEmail: () => void
  onDownloadData: () => void
  onLeave: () => void
  // 이 계정이 차단한 계정. 차단을 푸는 데 쓴다. 데모 계정에는 없다.
  blocked?: BlockedListing[]
  onUnblock?: (item: BlockedListing) => void
  // 브랜드의 사업자 확인. 단체와 데모 브랜드에는 없다.
  business?: BusinessStatus
  onVerifyBusiness?: () => void
  // 학생단체의 서류 확인(#334). 브랜드와 데모 단체에는 없다. 서류는 대표만 낸다.
  groupCheck?: GroupVerification
  onVerifyGroup?: () => void
  // 목록에서 숨기기: 리스팅을 당분간 상대편의 목록에서 빼거나 다시 보이게 한다.
  // 데모 계정에는 없다.
  onPause?: (paused: boolean) => void
  // 받을 메일: 끌 알림 이메일의 종류. 데모 계정에는 없다.
  onMail?: (mailOff: MailKind[]) => void
  // 친구 초대: 계정의 초대 링크와 그 진행 결과. 회원 전용.
  canInvite?: boolean
}) {
  const students = account.role === "학생단체"
  const labels = profileLabels[account.role]
  const owner = !account.asMember
  const verified = business?.business
  const paused = listing?.pausedAt !== undefined
  const mailOff = account.mailOff ?? []
  const social = onTeam && owner ? socialProviders : []
  const together = Boolean(onTeam || onCouncil || onCouncilLink || blocked)
  const [invite, setInvite] = useState<{ code: string; joined: number; rewarded: number; waiting: number; rewardDays: number } | null>(null)
  useEffect(() => {
    if (!canInvite) return
    let cancelled = false
    api.referral().then(
      (result) => {
        if (!cancelled) setInvite(result)
      },
      // 없으면 카드가 그냥 보이지 않는다.
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [canInvite])

  const cards: { id: string; icon: IconName; label: string }[] = [
    { id: "profile-public", icon: "file", label: t("공개 소개") },
    { id: "profile-account", icon: "user", label: t("계정") },
    { id: "profile-security", icon: "lock", label: t("로그인과 보안") },
    { id: "profile-prefs", icon: "bell", label: t("알림과 표시") },
    ...(together ? [{ id: "profile-together", icon: "users" as IconName, label: t("함께하는 사람") }] : []),
    ...(invite ? [{ id: "profile-invite", icon: "share" as IconName, label: t("친구 초대") }] : []),
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
                <AdCard onNotice={onAd} role={account.role} />
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
              {groupCheck && (
                <SettingsRow
                  action={
                    owner &&
                    groupCheck.status !== "waiting" &&
                    groupCheck.renewable && (
                      <RowButton
                        label={groupCheck.status === "verified" ? t("단체 확인 다시 신청하기") : t("단체 확인 신청하기")}
                        onClick={onVerifyGroup}
                        tone="point"
                      >
                        {groupCheck.status === "verified" ? t("다시 신청") : t("신청하기")}
                      </RowButton>
                    )
                  }
                  label={t("단체 확인")}
                  value={
                    groupCheck.status === "verified" && groupCheck.until ? (
                      <span className="settings-ok">
                        <Icon name="check" size={14} />
                        {t("확인됨 · {date}까지", { date: formatFullDate(toIsoDate(new Date(groupCheck.until))) })}
                      </span>
                    ) : groupCheck.status === "waiting" ? (
                      t("운영자가 서류를 보고 있어요")
                    ) : owner ? (
                      t("아직 확인하지 않았어요")
                    ) : (
                      t("대표가 신청할 수 있어요")
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
                  value={t("지금 로그인한 기기를 보고 다른 기기를 로그아웃시켜요.")}
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
              {/* 다른 언어를 고르면 그 언어로 페이지를 다시 불러오고 다음
                 방문을 위해 기억한다. 푸터의 스위치와 같다. */}
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

          {invite && (
            <SettingsCard
              caption={
                invite.rewardDays
                  ? t("내 링크로 가입한 곳의 첫 협찬이 성사되면 운영자가 확인한 뒤 Growth {days}일을 더해 드려요.", { days: invite.rewardDays })
                  : t("내 링크로 다른 단체와 가게를 초대해 보세요. 가입하면 여기에 세어져요.")
              }
              icon="share"
              id="profile-invite"
              title={t("친구 초대")}
            >
              <dl className="settings-rows">
                <SettingsRow
                  action={<ShareButton className="row-button" text={t("uniconnect에서 캠퍼스 협찬을 함께해요.")} title="uniconnect" url={referralLink(invite.code)} />}
                  label={t("내 초대 링크")}
                  value={<code className="invite-link">{referralLink(invite.code)}</code>}
                />
                <SettingsRow
                  label={t("초대한 결과")}
                  value={t("가입 {joined}곳 · 보상 {rewarded}곳 · 확인 중 {waiting}곳", { joined: invite.joined, rewarded: invite.rewarded, waiting: invite.waiting })}
                />
              </dl>
            </SettingsCard>
          )}

          {onPlan && (
            <SettingsCard caption={t("무료로 시작하고 더 많은 제안과 분석은 Growth로 써요.")} icon="won" id="profile-plan" title={t("요금제")}>
              <PlanCard onNotice={onPlan} />
              <LocalCard onNotice={onPlan} />
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
                  value={t("수수료, 상세 리포트, Growth 결제와 영수증이에요.")}
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
