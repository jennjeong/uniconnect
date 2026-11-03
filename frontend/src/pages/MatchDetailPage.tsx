import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { DateLine } from "../components/DateLine"
import { GroupDeal } from "../components/GroupDeal"
import { Icon } from "../components/Icon"
import { MatchBeam } from "../components/MatchBeam"
import { ShareButton } from "../components/ShareButton"
import { Pill } from "../components/Pill"
import { ProfileBars, ProfileFigures, type ProfileFigure } from "../components/ProfileStats"
import { ProposalControl } from "../components/ProposalControl"
import { RevealTitle } from "../components/RevealText"
import { ReviewsSection } from "../components/ReviewsSection"
import { SaveHeart } from "../components/SaveHeart"
import { TabBar } from "../components/TabBar"
import { profileLabels } from "../data/profile"
import { locale, t } from "../i18n"
import { formatDistance, shownTags } from "../lib/distance"
import { LayersGradient } from "../scenes/LayersGradient"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import { ANTIPODE } from "../scenes/shaders"
import type { Match, RequestStatus, Review } from "../types"

type Tab = "match" | "reviews"

// One brand (for student groups) or student group (for brands) as a
// profile: a card with a cover on getlayers.ai's Antipode gradient (two
// masses of light meeting — the two sides of a sponsorship), its mark over
// the cover's edge, who they are, where, and the ways to get in touch; then
// two tabs. 매칭 정보 has the match and the other figure that says most on a
// tinted card, each part of the match as a bar, then the introduction, SNS,
// facts and portfolio; 파트너 후기 has the reviews (ReviewsSection). On wide
// screens the card stays beside the tabs as they scroll.
export function MatchDetailPage({
  match,
  kind,
  done,
  status,
  onBack,
  onChat,
  onPropose,
  onCancel,
  saved,
  onToggleSave,
  onReport,
  onBlock,
  onReportReview,
  onReportReply,
  onOpenEvent,
  viewer,
}: {
  match: Match
  kind: "brand" | "group"
  // Whether a proposal was already sent, and the answer if there is one.
  done: boolean
  status?: RequestStatus
  onBack: () => void
  // Opens the conversation with this brand or group.
  onChat: () => void
  onPropose: () => void
  onCancel: () => void
  // 찜: whether the account saved it, and the heart that saves or unsaves it.
  saved: boolean
  onToggleSave: () => void
  // Members (not the shared demo accounts) can report or block the account
  // behind the listing, and report its reviews.
  onReport?: () => void
  onBlock?: () => void
  onReportReview?: (review: Review) => void
  onReportReply?: (review: Review) => void
  // A group's next event page.
  onOpenEvent?: (eventId: string) => void
  // The account browsing, for the match beam: its name and mark.
  viewer: { name: string; mark: Pick<Match, "industry" | "logo"> }
}) {
  const [tab, setTab] = useState<Tab>("match")
  const [burst, setBurst] = useState(0)
  const group = kind === "group"
  const labels = profileLabels[group ? "학생단체" : "브랜드"]
  const facts = [
    ...(match.facts ?? []),
    ...(match.popularity !== undefined
      ? [{ label: "이번 학기 협찬", value: t("{count}회", { count: match.popularity }) }]
      : []),
  ]
  const sns = match.sns ?? []
  const portfolio = match.portfolio ?? []
  const tags = shownTags(match)
  const distance = match.distanceKm !== undefined ? formatDistance(match.distanceKm) : undefined
  const place = [group ? match.school : match.location?.address, distance].filter(Boolean).join(" · ")
  const proposal = (
    <ProposalControl
      done={done}
      status={status}
      label={group ? t("협찬 제안하기") : t("협찬 제안 보내기")}
      className="primary-button"
      onPropose={onPropose}
      onCancel={onCancel}
    />
  )

  // Beside the match: a group's expected audience or a brand's
  // sponsorships this semester, else how far it is.
  const nearby: ProfileFigure | undefined = distance
    ? { value: distance, label: t("거리"), note: group ? t("매장에서 학교까지") : t("학교에서 매장까지") }
    : undefined
  const beside: ProfileFigure | undefined = group
    ? match.audience !== undefined
      ? { value: t("{count}명", { count: match.audience.toLocaleString(locale) }), label: t("예상 인원"), note: match.eventName }
      : nearby
    : match.popularity !== undefined
      ? { value: t("{count}회", { count: match.popularity }), label: t("이번 학기 협찬"), note: t("학생단체와 함께한 협찬") }
      : nearby
  const figures: ProfileFigure[] = [
    {
      value: `${match.score}%`,
      label: t("일치율"),
      note: match.reasons?.length ? match.reasons.map((reason) => t(reason)).join(" · ") : undefined,
    },
    ...(beside ? [beside] : []),
  ]

  return (
    <section className="page-view detail-view">
      <div className="detail-top">
        <button aria-label={t("뒤로")} className="back-pill" onClick={onBack} type="button">
          <Icon name="chevron" size={16} />
          <span>{t("뒤로")}</span>
        </button>
        <ShareButton className="back-pill share-pill" title={match.name} />
      </div>

      <div className="profile-layout">
        <aside className="profile-card">
          <div className="profile-cover">
            <LayersGradient shader={ANTIPODE} />
            <span className="eyebrow light">{group ? "Group Profile" : "Brand Profile"}</span>
          </div>
          <div className="profile-avatar">
            <BrandMark match={match} large />
          </div>
          <div className="profile-body">
            <span className="profile-meta">
              {group && match.school ? `${match.school} · ${t(match.category)}` : t(match.category)}
            </span>
            <RevealTitle className="profile-name">{match.name}</RevealTitle>
            {match.businessVerified && (
              <span className="tag-verified profile-verified">
                <Icon name="check" size={13} />
                {t("사업자 확인")}
              </span>
            )}
            <p className="profile-offer">
              <small>{labels.offer}</small>
              {match.offer}
            </p>
            {place && (
              <p className="profile-place">
                <Icon name="pin" size={16} />
                {place}
              </p>
            )}
            {group && match.eventName && match.eventDate && (
              <div className="profile-event">
                <small>{t("다음 행사")}</small>
                <strong>{match.eventName}</strong>
                <DateLine date={match.eventDate} />
                {match.eventId && onOpenEvent && (
                  <button className="text-link" onClick={() => onOpenEvent(match.eventId!)} type="button">
                    {t("행사 상세 보기")}
                  </button>
                )}
              </div>
            )}
            {tags.length > 0 && (
              <div className="work-tags">
                {tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            <div className="profile-actions">
              {proposal}
              <button className="cancel-button" onClick={onChat} type="button">
                <Icon name="chat" size={16} /> {t("문의하기")}
              </button>
              <button
                aria-pressed={saved}
                className="cancel-button save-button"
                onClick={() => {
                  if (!saved) setBurst(burst + 1)
                  onToggleSave()
                }}
                type="button"
              >
                <SaveHeart burst={burst} saved={saved} size={16} /> {t("찜하기")}
              </button>
            </div>
            {(onReport || onBlock) && (
              <div className="profile-safety">
                {onReport && (
                  <button className="subtle-link" onClick={onReport} type="button">
                    {t("신고하기")}
                  </button>
                )}
                {onBlock && (
                  <button className="subtle-link" onClick={onBlock} type="button">
                    {t("차단하기")}
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className="profile-main">
          <TabBar
            items={[
              { value: "match", label: t("매칭 정보") },
              {
                value: "reviews",
                label: (
                  <>
                    {t("파트너 후기")} {match.reviewCount ? <em>{match.reviewCount}</em> : null}
                  </>
                ),
              },
            ]}
            label={t("{name} 정보 보기", { name: match.name })}
            onChange={(value: Tab) => setTab(value)}
            value={tab}
          />

          {tab === "match" ? (
            <div className="profile-panel">
              <MatchBeam from={viewer} score={match.score} to={{ name: match.name, mark: match }} />
              {group && <GroupDeal match={match} onOpenEvent={onOpenEvent} />}
              <ProfileFigures figures={figures} />
              {match.scoreParts && match.scoreParts.length > 0 && (
                <ProfileBars rows={match.scoreParts.map((part) => ({ label: t(part.label), share: part.value }))} />
              )}

              <h3 className="profile-heading">{group ? t("단체 소개") : t("브랜드 소개")}</h3>
              <p className="profile-intro">{match.intro || t("아직 소개를 쓰지 않았어요.")}</p>
              {sns.length > 0 && (
                <ul aria-label="SNS" className="sns-chips">
                  {sns.map((account) => (
                    <li key={`${account.platform}-${account.handle}`}>
                      <span className="sns-dot">
                        <Icon name="at" size={14} />
                      </span>
                      <span>
                        <small>{t(account.platform)}</small>
                        <strong>{account.handle}</strong>
                      </span>
                      {account.followers && <em>{account.followers}</em>}
                    </li>
                  ))}
                </ul>
              )}

              {facts.length > 0 && (
                <>
                  <h3 className="profile-heading">{t("한눈에 보는 정보")}</h3>
                  <dl className="profile-facts">
                    {facts.map((fact) => (
                      <div key={fact.label}>
                        <dt>{t(fact.label)}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              {portfolio.length > 0 && (
                <>
                  <h3 className="profile-heading">{group ? t("지난 활동") : t("함께한 협찬")}</h3>
                  <ul className="profile-portfolio">
                    {portfolio.map((item) => (
                      <li key={item.title}>
                        <i aria-hidden="true">
                          <Icon name="briefcase" size={16} />
                        </i>
                        <span>
                          <strong>{item.title}</strong>
                          {item.detail && <small>{item.detail}</small>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <ReviewsSection
              id={match.id}
              name={match.name}
              onReport={onReportReview}
              onReportReply={onReportReply}
              role={group ? "학생단체" : "브랜드"}
            />
          )}
        </div>
      </div>

      <section className="cta-panel" data-reveal>
        <MeshBackdrop seed={1.3} />
        <RevealTitle as="h2" className="cta-title">
          {group
            ? t("{name}의 다음 행사에 함께해 볼까요?", { name: match.name })
            : t("{name}에 협찬을 제안해 볼까요?", { name: match.name })}
        </RevealTitle>
        <div className="detail-actions">
          <Pill arrow="up-right" onClick={onChat} variant="white">
            {t("문의하기")}
          </Pill>
          {proposal}
        </div>
      </section>
    </section>
  )
}
