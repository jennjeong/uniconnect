import { BrandMark } from "../components/BrandMark"
import { ProposalControl } from "../components/ProposalControl"
import { ScoreRing } from "../components/ScoreRing"
import type { Match, Role } from "../types"

export function MatchesPage({
  role,
  matches,
  proposals,
  onPropose,
  onCancelProposal,
}: {
  role: Role
  matches: Match[]
  proposals: string[]
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
}) {
  return (
    <section className="page-view">
      <div className="view-intro match-intro">
        <div>
          <span className="section-kicker">SMART MATCH</span>
          <p>
            {role === "학생단체"
              ? "내 행사에 맞는 브랜드를 찾았어요"
              : "캠페인에 맞는 학생단체를 찾았어요"}
          </p>
          <small>행사 정보, 타깃, 거리와 지난 성과를 함께 분석한 결과예요.</small>
        </div>
        <span className="result-count">{matches.length}개 추천</span>
      </div>
      <div className="full-match-grid">
        {matches.map((match) => (
          <article className="full-match-card" key={match.id}>
            <BrandMark match={match} large />
            <div className="full-match-copy">
              <span>{match.category}</span>
              <strong>{match.name}</strong>
              <p>{match.offer}</p>
              <div className="tag-row">
                {match.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <ScoreRing score={match.score} />
            <ProposalControl
              done={proposals.includes(match.id)}
              label="협찬 제안 보내기"
              className="primary-button"
              onPropose={() => onPropose(match)}
              onCancel={() => onCancelProposal(match)}
            />
          </article>
        ))}
      </div>
    </section>
  )
}
