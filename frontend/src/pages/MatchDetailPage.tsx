import type { CSSProperties } from "react"

import { BrandMark } from "../components/BrandMark"
import { DateLine } from "../components/DateLine"
import { Icon } from "../components/Icon"
import { Pill } from "../components/Pill"
import { ProposalControl } from "../components/ProposalControl"
import { RevealTitle, RevealWords } from "../components/RevealText"
import { ScoreRing } from "../components/ScoreRing"
import { profileLabels } from "../data/profile"
import { locale, t } from "../i18n"
import { LayersGradient } from "../scenes/LayersGradient"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import { ANTIPODE } from "../scenes/shaders"
import type { Match, RequestStatus } from "../types"

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// One brand (for student groups) or student group (for brands): a banner on
// getlayers.ai's Antipode gradient (two masses of light meeting — the two
// sides of a sponsorship) with who they are, their introduction as a
// statement, their facts, SNS and portfolio as rows, and ways to get in
// touch at the top and the bottom.
export function MatchDetailPage({
  match,
  kind,
  done,
  status,
  onBack,
  onChat,
  onPropose,
  onCancel,
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
}) {
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

  return (
    <section className="page-view detail-view">
      <div className="detail-top">
        <button aria-label={t("뒤로")} className="back-pill" onClick={onBack} type="button">
          <Icon name="chevron" size={16} />
          <span>{t("뒤로")}</span>
        </button>
      </div>

      <header className="banner-hero">
        <LayersGradient shader={ANTIPODE} />
        <div className="banner-content">
          <div className="banner-top">
            <span className="eyebrow light">{group ? "Group Profile" : "Brand Profile"}</span>
            <ScoreRing score={match.score} />
          </div>
          <div className="banner-identity">
            <BrandMark match={match} large />
            <div>
              <span className="banner-meta">
                {group && match.school ? `${match.school} · ${t(match.category)}` : t(match.category)}
              </span>
              <RevealTitle className="banner-title">{match.name}</RevealTitle>
              {match.reasons && match.reasons.length > 0 && (
                <p className="banner-reasons">
                  <span>{t("일치율 {score}%", { score: match.score })}</span>
                  {match.reasons.map((reason) => (
                    <span key={reason}>{t(reason)}</span>
                  ))}
                </p>
              )}
            </div>
          </div>
          <div className="banner-bottom">
            <div className="work-tags">
              {match.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="banner-actions">
              <button className="cancel-button" onClick={onChat} type="button">
                <Icon name="chat" size={16} /> {t("문의하기")}
              </button>
              {proposal}
            </div>
          </div>
        </div>
      </header>

      <section className="about-block">
        <div className="about-side">
          <span className="eyebrow">{group ? t("단체 소개") : t("브랜드 소개")}</span>
          <Icon name="link" size={220} />
          {group && match.eventName && match.eventDate ? (
            <div className="about-event" data-reveal>
              <small>{t("다음 행사")}</small>
              <strong>{match.eventName}</strong>
              <DateLine date={match.eventDate} />
              {match.audience !== undefined && (
                <span className="detail-audience">
                  <Icon name="users" size={15} />
                  {t("예상 인원 {count}명", { count: match.audience.toLocaleString(locale) })}
                </span>
              )}
            </div>
          ) : (
            <p className="about-note" data-reveal>
              <Icon name="spark" size={20} />
              <span>
                {group
                  ? t("캠퍼스 현장에서 브랜드를 직접 소개할 수 있는 학생단체예요.")
                  : t("학생들이 실제로 찾아가는 캠퍼스 가까운 브랜드예요.")}
              </span>
            </p>
          )}
        </div>
        <div className="about-copy">
          {match.intro ? (
            <RevealWords className="about-statement">{match.intro}</RevealWords>
          ) : (
            <p className="about-statement">{t("아직 소개를 쓰지 않았어요.")}</p>
          )}
          <div className="about-offer" data-reveal style={delay(0.15)}>
            <span>{labels.offer}</span>
            <strong>{match.offer}</strong>
          </div>
          {sns.length > 0 && (
            <div className="about-foot" data-reveal style={delay(0.2)}>
              <span>SNS</span>
              <ul className="sns-chips">
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
            </div>
          )}
        </div>
      </section>

      {facts.length > 0 && (
        <section className="service-section">
          <span className="eyebrow" data-reveal>
            {group ? t("단체 정보") : t("브랜드 정보")}
          </span>
          <RevealTitle as="h2" className="section-display">
            {t("한눈에 보는 정보")}
          </RevealTitle>
          <dl className="service-list">
            {facts.map((fact, index) => (
              <div className="service-row" data-reveal key={fact.label} style={delay(index * 0.08)}>
                <span className="service-index">{pad(index + 1)}</span>
                <dt>{t(fact.label)}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {portfolio.length > 0 && (
        <section className="service-section">
          <span className="eyebrow" data-reveal>
            {labels.portfolio}
          </span>
          <RevealTitle as="h2" className="section-display">
            {group ? t("지난 활동") : t("함께한 협찬")}
          </RevealTitle>
          <ul className="service-list">
            {portfolio.map((item, index) => (
              <li className="service-row" data-reveal key={item.title} style={delay(index * 0.08)}>
                <span className="service-index">{pad(index + 1)}</span>
                <strong>{item.title}</strong>
                {item.detail && <span className="service-detail">{item.detail}</span>}
                <i aria-hidden="true" className="service-badge">
                  <Icon name="briefcase" size={16} />
                </i>
              </li>
            ))}
          </ul>
        </section>
      )}

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
