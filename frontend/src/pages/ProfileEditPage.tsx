import { useState } from "react"

import { Icon } from "../components/Icon"
import { factFields, profileLabels, snsPlatforms } from "../data/profile"
import type { Match, PortfolioItem, ProfileDraft, Role, SnsAccount } from "../types"

const maxSns = 4
const maxPortfolio = 5

// Edits the listing the other side sees: introduction, offer, tags, basic
// facts, SNS accounts and portfolio.
export function ProfileEditPage({
  role,
  listing,
  onCancel,
  onSave,
}: {
  role: Role
  // The current listing, or null for the first introduction.
  listing: Match | null
  onCancel: () => void
  onSave: (draft: ProfileDraft) => Promise<string | null>
}) {
  const labels = profileLabels[role]
  const viewers = role === "학생단체" ? "브랜드" : "학생단체"
  const [intro, setIntro] = useState(listing?.intro ?? "")
  const [offer, setOffer] = useState(listing?.offer ?? "")
  const [tags, setTags] = useState((listing?.tags ?? []).join(", "))
  const [facts, setFacts] = useState<Record<string, string>>(() =>
    Object.fromEntries((listing?.facts ?? []).map((fact) => [fact.label, fact.value])),
  )
  const [sns, setSns] = useState<SnsAccount[]>(listing?.sns ?? [])
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(listing?.portfolio ?? [])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const updateSns = (index: number, change: Partial<SnsAccount>) =>
    setSns((rows) => rows.map((row, at) => (at === index ? { ...row, ...change } : row)))
  const updatePortfolio = (index: number, change: Partial<PortfolioItem>) =>
    setPortfolio((rows) => rows.map((row, at) => (at === index ? { ...row, ...change } : row)))

  const save = async () => {
    if (intro.trim().length < 10) {
      setError("소개는 10자 이상 적어 주세요.")
      return
    }
    if (!offer.trim()) {
      setError(`${labels.offer}을 적어 주세요.`)
      return
    }
    setError("")
    setBusy(true)
    const problem = await onSave({
      intro: intro.trim(),
      offer: offer.trim(),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      facts: factFields[role].map((field) => ({ label: field.label, value: facts[field.label] ?? "" })),
      sns,
      portfolio,
    })
    setBusy(false)
    if (problem) setError(problem)
  }

  return (
    <section className="page-view create-view profile-edit">
      <div className="create-head">
        <button aria-label="뒤로" className="back-button" onClick={onCancel} type="button">
          <Icon name="chevron" size={18} />
        </button>
        <div>
          <span className="section-kicker dark">EDIT PROFILE</span>
          <p className="section-title">소개 편집</p>
        </div>
      </div>
      <p className="create-intro">
        {viewers}가 찾기와 상세 정보에서 보는 내용이에요. 자세할수록 알맞은 상대를 만나기 쉬워요.
      </p>

      <div className="form-card">
        <h3 className="form-card-title">소개</h3>
        <label className="field">
          <span>
            한 줄 소개 <em className="field-count">{intro.length}/300</em>
          </span>
          <textarea
            maxLength={300}
            onChange={(event) => setIntro(event.target.value)}
            placeholder={
              role === "학생단체"
                ? "예) 삼육대학교 대표 밴드 동아리예요. 학기마다 정기 공연을 열어요."
                : "예) 캠퍼스 앞 스페셜티 카페예요. 학생 행사에 음료 쿠폰을 지원해요."
            }
            rows={3}
            value={intro}
          />
        </label>
        <label className="field">
          <span>{labels.offer}</span>
          <input
            maxLength={60}
            onChange={(event) => setOffer(event.target.value)}
            placeholder={role === "학생단체" ? "예) 관객 120명 · 교내 SNS 3개 채널" : "예) 쿠폰 150장 + 현금 20만원"}
            value={offer}
          />
        </label>
        <label className="field">
          <span>태그</span>
          <input
            onChange={(event) => setTags(event.target.value)}
            placeholder="쉼표로 구분해 4개까지, 예) 공연 특화, 정기 공연"
            value={tags}
          />
        </label>
      </div>

      <div className="form-card">
        <h3 className="form-card-title">기본 정보</h3>
        <div className="edit-facts">
          {factFields[role].map((field) => (
            <label className="field" key={field.label}>
              <span>{field.label}</span>
              <input
                maxLength={40}
                onChange={(event) =>
                  setFacts((current) => ({ ...current, [field.label]: event.target.value }))
                }
                placeholder={field.placeholder}
                value={facts[field.label] ?? ""}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="form-card">
        <h3 className="form-card-title">SNS</h3>
        <p className="form-card-caption">홍보에 쓸 수 있는 채널과 팔로워 수를 알려 주세요.</p>
        <div className="edit-rows">
          {sns.map((row, index) => (
            <div className="edit-row sns" key={index}>
              <select
                aria-label="SNS 종류"
                onChange={(event) => updateSns(index, { platform: event.target.value })}
                value={row.platform}
              >
                {snsPlatforms.map((platform) => (
                  <option key={platform}>{platform}</option>
                ))}
              </select>
              <input
                aria-label="계정 또는 주소"
                maxLength={60}
                onChange={(event) => updateSns(index, { handle: event.target.value })}
                placeholder="@계정 또는 주소"
                value={row.handle}
              />
              <input
                aria-label="팔로워"
                className="followers"
                maxLength={20}
                onChange={(event) => updateSns(index, { followers: event.target.value })}
                placeholder="팔로워 예) 3,100명"
                value={row.followers ?? ""}
              />
              <button
                aria-label="이 SNS 지우기"
                className="delete-button"
                onClick={() => setSns((rows) => rows.filter((_, at) => at !== index))}
                type="button"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
        {sns.length < maxSns && (
          <button
            className="add-row-button"
            onClick={() => setSns((rows) => [...rows, { platform: snsPlatforms[0], handle: "" }])}
            type="button"
          >
            <Icon name="plus" size={15} /> SNS 추가
          </button>
        )}
      </div>

      <div className="form-card">
        <h3 className="form-card-title">{labels.portfolio}</h3>
        <p className="form-card-caption">{labels.portfolioHint}</p>
        <div className="edit-rows">
          {portfolio.map((row, index) => (
            <div className="edit-row portfolio" key={index}>
              <input
                aria-label="제목"
                maxLength={40}
                onChange={(event) => updatePortfolio(index, { title: event.target.value })}
                placeholder="제목"
                value={row.title}
              />
              <input
                aria-label="내용"
                className="detail"
                maxLength={100}
                onChange={(event) => updatePortfolio(index, { detail: event.target.value })}
                placeholder="규모, 성과 등"
                value={row.detail}
              />
              <button
                aria-label="이 항목 지우기"
                className="delete-button"
                onClick={() => setPortfolio((rows) => rows.filter((_, at) => at !== index))}
                type="button"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
        {portfolio.length < maxPortfolio && (
          <button
            className="add-row-button"
            onClick={() => setPortfolio((rows) => [...rows, { title: "", detail: "" }])}
            type="button"
          >
            <Icon name="plus" size={15} /> 항목 추가
          </button>
        )}
      </div>

      {error && (
        <p className="form-error create-error" role="alert">
          {error}
        </p>
      )}
      <div className="create-actions">
        <button className="cancel-button" onClick={onCancel} type="button">
          취소
        </button>
        <button className="primary-button" disabled={busy} onClick={save} type="button">
          저장하기
        </button>
      </div>
    </section>
  )
}
