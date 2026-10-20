import { BrandMark } from "../components/BrandMark"
import { DateLine } from "../components/DateLine"
import { Icon } from "../components/Icon"
import { ProposalControl } from "../components/ProposalControl"
import { ScoreRing } from "../components/ScoreRing"
import { profileLabels } from "../data/profile"
import type { Match, RequestStatus } from "../types"

// One brand (for student groups) or student group (for brands): who they
// are, what they offer, their SNS and portfolio, and ways to get in touch.
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
      ? [{ label: "이번 학기 협찬", value: `${match.popularity}회` }]
      : []),
  ]
  const sns = match.sns ?? []
  const portfolio = match.portfolio ?? []

  return (
    <section className="page-view detail-view">
      <div className="create-head">
        <button aria-label="뒤로" className="back-button" onClick={onBack} type="button">
          <Icon name="chevron" size={18} />
        </button>
        <div>
          <span className="section-kicker dark">{group ? "GROUP PROFILE" : "BRAND PROFILE"}</span>
          <p className="section-title">{group ? "단체 정보" : "브랜드 정보"}</p>
        </div>
      </div>

      <div className="detail-hero">
        <BrandMark match={match} large />
        <div className="detail-hero-copy">
          <span>{group && match.school ? `${match.school} · ${match.category}` : match.category}</span>
          <strong>{match.name}</strong>
          <div className="tag-row">
            {match.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <ScoreRing score={match.score} />
      </div>

      <div className="detail-grid stagger">
        <div className="form-card detail-intro">
          <h3 className="form-card-title">{group ? "단체 소개" : "브랜드 소개"}</h3>
          {match.intro && <p>{match.intro}</p>}
          <div className="detail-offer">
            <span>{labels.offer}</span>
            <strong>{match.offer}</strong>
          </div>
        </div>

        {group && match.eventName && match.eventDate && (
          <div className="form-card detail-event">
            <h3 className="form-card-title">다음 행사</h3>
            <strong>{match.eventName}</strong>
            <DateLine date={match.eventDate} />
            {match.audience !== undefined && (
              <span className="detail-audience">
                <Icon name="users" size={15} />
                예상 인원 {match.audience.toLocaleString("ko-KR")}명
              </span>
            )}
          </div>
        )}

        {(facts.length > 0 || sns.length > 0) && (
          <div className="form-card detail-facts">
            <h3 className="form-card-title">{group ? "단체 정보" : "브랜드 정보"}</h3>
            <dl>
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {sns.length > 0 && (
              <>
                <h4 className="detail-subtitle">SNS</h4>
                <ul className="detail-sns">
                  {sns.map((account) => (
                    <li key={`${account.platform}-${account.handle}`}>
                      <span className="detail-icon">
                        <Icon name="at" size={15} />
                      </span>
                      <span>
                        <small>{account.platform}</small>
                        <strong>{account.handle}</strong>
                      </span>
                      {account.followers && <em>{account.followers}</em>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {portfolio.length > 0 && (
          <div className="form-card detail-portfolio">
            <h3 className="form-card-title">{labels.portfolio}</h3>
            <ul>
              {portfolio.map((item) => (
                <li key={item.title}>
                  <span className="detail-icon">
                    <Icon name="briefcase" size={15} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="detail-actions">
        <button className="cancel-button" onClick={onChat} type="button">
          <Icon name="chat" size={16} /> 문의하기
        </button>
        <ProposalControl
          done={done}
          status={status}
          label={group ? "협찬 제안하기" : "협찬 제안 보내기"}
          className="primary-button"
          onPropose={onPropose}
          onCancel={onCancel}
        />
      </div>
    </section>
  )
}
