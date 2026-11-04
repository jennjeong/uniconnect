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

// 프로필로 보는 브랜드(학생단체용) 또는 학생단체(브랜드용) 하나: getlayers.ai의
// Antipode 그라디언트 표지(협찬의 두 쪽처럼 만나는 두 빛 덩어리)가 있는 카드에
// 표지 가장자리를 넘는 마크, 누구인지, 어디인지, 연락 방법. 이어서 탭 두 개.
// 매칭 정보는 매칭과 가장 많은 것을 말해 주는 다른 수치를 색을 입힌 카드로 보여
// 주고, 매칭의 각 부분을 막대로, 이어서 소개, SNS, 기본 정보, 포트폴리오를 보여
// 준다. 파트너 후기는 후기를 보여 준다(ReviewsSection). 넓은 화면에서는 탭이
// 스크롤되어도 카드가 그 옆에 남는다.
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
  // 제안을 이미 보냈는지와, 있다면 그 답.
  done: boolean
  status?: RequestStatus
  onBack: () => void
  // 이 브랜드나 단체와의 대화를 연다.
  onChat: () => void
  onPropose: () => void
  onCancel: () => void
  // 찜: 계정이 저장했는지 여부와, 저장하거나 저장을 푸는 하트.
  saved: boolean
  onToggleSave: () => void
  // 회원(공용 데모 계정 제외)은 리스팅의 계정을 신고하거나 차단하고 그 후기를
  // 신고할 수 있다.
  onReport?: () => void
  onBlock?: () => void
  onReportReview?: (review: Review) => void
  onReportReply?: (review: Review) => void
  // 단체의 다음 행사 페이지.
  onOpenEvent?: (eventId: string) => void
  // 매치 빔을 위한, 둘러보는 계정의 이름과 마크.
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

  // 매칭 옆에 단체의 예상 방문객이나 브랜드의 이번 학기 협찬을, 없으면 얼마나
  // 먼지를 보여 준다.
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
