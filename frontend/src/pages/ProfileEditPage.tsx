import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { factFields, profileLabels, snsPlatforms } from "../data/profile"
import { t } from "../i18n"
import { logoFromFile } from "../lib/image"
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
  const [intro, setIntro] = useState(listing?.intro ?? "")
  const [offer, setOffer] = useState(listing?.offer ?? "")
  const [tags, setTags] = useState((listing?.tags ?? []).join(", "))
  const [facts, setFacts] = useState<Record<string, string>>(() =>
    Object.fromEntries((listing?.facts ?? []).map((fact) => [fact.label, fact.value])),
  )
  const [sns, setSns] = useState<SnsAccount[]>(listing?.sns ?? [])
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(listing?.portfolio ?? [])
  // The logo as it will be saved: a data URL, or "" for none.
  const [logo, setLogo] = useState(listing?.logo ?? "")
  // A brand's store, for how far it is from each school.
  const [address, setAddress] = useState(listing?.location?.address ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const updateSns = (index: number, change: Partial<SnsAccount>) =>
    setSns((rows) => rows.map((row, at) => (at === index ? { ...row, ...change } : row)))
  const updatePortfolio = (index: number, change: Partial<PortfolioItem>) =>
    setPortfolio((rows) => rows.map((row, at) => (at === index ? { ...row, ...change } : row)))

  const save = async () => {
    if (intro.trim().length < 10) {
      setError(t("소개는 10자 이상 적어 주세요."))
      return
    }
    if (!offer.trim()) {
      setError(t("{label}을 적어 주세요.", { label: labels.offer }))
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
      ...(logo !== (listing?.logo ?? "") ? { logo: logo || null } : {}),
      ...(role === "브랜드" ? { address: address.trim() } : {}),
    })
    setBusy(false)
    if (problem) setError(problem)
  }

  return (
    <section className="page-view create-view profile-edit">
      <PageIntro
        onBack={onCancel}
        eyebrow="Edit Profile"
        title={t("소개 편집")}
        description={
          role === "학생단체"
            ? t("브랜드가 찾기와 상세 정보에서 보는 내용이에요. 자세할수록 알맞은 상대를 만나기 쉬워요.")
            : t("학생단체가 찾기와 상세 정보에서 보는 내용이에요. 자세할수록 알맞은 상대를 만나기 쉬워요.")
        }
      />

      <div className="form-card">
        <h3 className="form-card-title">{t("로고")}</h3>
        <div className="logo-field">
          <BrandMark large match={{ industry: listing?.industry ?? (role === "학생단체" ? "performance" : "cafe"), logo }} />
          <div className="logo-field-actions">
            <label className="detail-button logo-pick">
              {logo ? t("다른 이미지로 바꾸기") : t("로고 올리기")}
              <input
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  logoFromFile(file)
                    .then((url) => {
                      setLogo(url)
                      setError("")
                    })
                    .catch((caught: Error) => setError(caught.message))
                }}
              />
            </label>
            {logo && (
              <button className="cancel-button" onClick={() => setLogo("")} type="button">
                {t("지우기")}
              </button>
            )}
            <small className="field-hint">{t("정사각형으로 줄여 저장돼요. 없으면 업종 그림이 보여요.")}</small>
          </div>
        </div>
      </div>

      <div className="form-card">
        <h3 className="form-card-title">{t("소개")}</h3>
        <label className="field">
          <span>
            {t("한 줄 소개")} <em className="field-count">{intro.length}/300</em>
          </span>
          <textarea
            maxLength={300}
            onChange={(event) => setIntro(event.target.value)}
            placeholder={
              role === "학생단체"
                ? t("예) 삼육대학교 대표 밴드 동아리예요. 학기마다 정기 공연을 열어요.")
                : t("예) 캠퍼스 앞 스페셜티 카페예요. 학생 행사에 음료 쿠폰을 지원해요.")
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
            placeholder={role === "학생단체" ? t("예) 관객 120명 · 교내 SNS 3개 채널") : t("예) 쿠폰 150장 + 현금 20만원")}
            value={offer}
          />
        </label>
        <label className="field">
          <span>{t("태그")}</span>
          <input
            onChange={(event) => setTags(event.target.value)}
            placeholder={t("쉼표로 구분해 4개까지, 예) 공연 특화, 정기 공연")}
            value={tags}
          />
        </label>
      </div>

      <div className="form-card">
        <h3 className="form-card-title">{t("기본 정보")}</h3>
        <div className="edit-facts">
          {factFields[role].map((field) => (
            <label className="field" key={field.label}>
              <span>{t(field.label)}</span>
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
        {role === "브랜드" && (
          <label className="field">
            <span>{t("매장 주소")}</span>
            <input
              maxLength={100}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={t("예) 서울 노원구 공릉로 232")}
              value={address}
            />
            <small className="field-hint">
              {listing?.location && listing.location.lat === undefined && listing.location.address === address.trim()
                ? t("아직 이 주소를 지도에서 찾지 못해 거리가 보이지 않아요. 도로명 주소로 적고 다시 저장해 주세요.")
                : t("학생단체에게 학교에서 매장까지의 거리를 보여 드려요. 온라인 브랜드는 비워 두세요.")}
            </small>
          </label>
        )}
      </div>

      <div className="form-card">
        <h3 className="form-card-title">SNS</h3>
        <p className="form-card-caption">{t("홍보에 쓸 수 있는 채널과 팔로워 수를 알려 주세요.")}</p>
        <div className="edit-rows">
          {sns.map((row, index) => (
            <div className="edit-row sns" key={index}>
              <select
                aria-label={t("SNS 종류")}
                onChange={(event) => updateSns(index, { platform: event.target.value })}
                value={row.platform}
              >
                {snsPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {t(platform)}
                  </option>
                ))}
              </select>
              <input
                aria-label={t("계정 또는 주소")}
                maxLength={60}
                onChange={(event) => updateSns(index, { handle: event.target.value })}
                placeholder={t("@계정 또는 주소")}
                value={row.handle}
              />
              <input
                aria-label={t("팔로워")}
                className="followers"
                maxLength={20}
                onChange={(event) => updateSns(index, { followers: event.target.value })}
                placeholder={t("팔로워 예) 3,100명")}
                value={row.followers ?? ""}
              />
              <button
                aria-label={t("이 SNS 지우기")}
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
            <Icon name="plus" size={15} /> {t("SNS 추가")}
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
                aria-label={t("제목")}
                maxLength={40}
                onChange={(event) => updatePortfolio(index, { title: event.target.value })}
                placeholder={t("제목")}
                value={row.title}
              />
              <input
                aria-label={t("내용")}
                className="detail"
                maxLength={100}
                onChange={(event) => updatePortfolio(index, { detail: event.target.value })}
                placeholder={t("규모, 성과 등")}
                value={row.detail}
              />
              <button
                aria-label={t("이 항목 지우기")}
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
            <Icon name="plus" size={15} /> {t("항목 추가")}
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
          {t("취소")}
        </button>
        <button className="primary-button" disabled={busy} onClick={save} type="button">
          {t("저장하기")}
        </button>
      </div>
    </section>
  )
}
