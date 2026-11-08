import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { brandOffers, factFields, profileLabels, snsPlatforms } from "../data/profile"
import { t, tc } from "../i18n"
import { logoFromFile } from "../lib/image"
import { embedPostcode } from "../lib/postcode"
import { Modal } from "../components/Modal"
import { Presence } from "../components/Presence"
import { api, errorMessage } from "../api"
import type { BrandOffer, HistoryItem, Match, PortfolioItem, ProfileDraft, Role, SnsAccount } from "../types"

const maxSns = 4
const maxOffers = brandOffers.length
const maxPortfolio = 5

// 상대편에게 보이는 리스팅을 고친다: 소개, 제공 내용, 태그, 기본 정보, SNS
// 계정, 포트폴리오. 브랜드는 목록에서 제공 내용을 고르고 주소 검색으로 가게
// 주소를 찾는다. 태그와 기본 정보는 브랜드가 하는 일에서 오며(backend
// lib/brandProfile.ts) 읽히는 대로 여기에 보이고, 팔로워 수는 보이지 않는다.
export function ProfileEditPage({
  role,
  listing,
  onCancel,
  onSave,
}: {
  role: Role
  // 현재 리스팅. 첫 소개라면 null.
  listing: Match | null
  onCancel: () => void
  onSave: (draft: ProfileDraft) => Promise<string | null>
}) {
  const labels = profileLabels[role]
  const brand = role === "브랜드"
  const [intro, setIntro] = useState(listing?.intro ?? "")
  const [offer, setOffer] = useState(listing?.offer ?? "")
  // 브랜드의 제공 내용을 SNS처럼 행으로: 종류와 그 내용.
  const [offers, setOffers] = useState<BrandOffer[]>(listing?.offers ?? [])
  const updateOffer = (index: number, change: Partial<BrandOffer>) =>
    setOffers((rows) => rows.map((row, at) => (at === index ? { ...row, ...change } : row)))
  // 불러오기: 포트폴리오에 더할 지난 협찬이나 행사.
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [tags, setTags] = useState((listing?.tags ?? []).join(", "))
  const [facts, setFacts] = useState<Record<string, string>>(() =>
    Object.fromEntries((listing?.facts ?? []).map((fact) => [fact.label, fact.value])),
  )
  const [sns, setSns] = useState<SnsAccount[]>(listing?.sns ?? [])
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(listing?.portfolio ?? [])
  // 저장될 로고: data URL, 없으면 "".
  const [logo, setLogo] = useState(listing?.logo ?? "")
  // 학교와의 거리를 위한 브랜드의 가게.
  const [address, setAddress] = useState(listing?.location?.address ?? "")
  // 열려 있는 동안의 주소 검색.
  const [searching, setSearching] = useState(false)
  const searchBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!searching || !searchBox.current) return
    embedPostcode(searchBox.current, (picked) => {
      setAddress(picked)
      setSearching(false)
    }).catch(() => {
      setSearching(false)
      setError(t("주소 검색을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."))
    })
  }, [searching])
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
    if (brand ? !offers.some((row) => row.kind) : !offer.trim()) {
      setError(brand ? t("제공하는 협찬을 하나 이상 골라 주세요.") : t("{label}을 적어 주세요.", { label: labels.offer }))
      return
    }
    setError("")
    setBusy(true)
    const problem = await onSave({
      intro: intro.trim(),
      ...(brand
        ? {
            offer: "",
            offers: offers.map((row) => ({ kind: row.kind, ...(row.detail?.trim() ? { detail: row.detail.trim() } : {}) })),
            tags: [],
            facts: [],
            address: address.trim(),
          }
        : {
            offer: offer.trim(),
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            facts: factFields[role].map((field) => ({ label: field.label, value: facts[field.label] ?? "" })),
          }),
      sns: brand ? sns.map(({ followers, ...row }) => row) : sns,
      portfolio,
      ...(logo !== (listing?.logo ?? "") ? { logo: logo || null } : {}),
    })
    setBusy(false)
    if (problem) setError(problem)
  }

  return (
    <section className="page-view create-view profile-edit">
      <PageIntro
        onBack={onCancel}
        eyebrow={tc("eyebrow", "소개 편집")}
        title={t("소개 편집")}
        description={
          role === "학생단체"
            ? t("브랜드가 보는 우리 단체 소개예요. 자세할수록 잘 맞는 브랜드를 만나요.")
            : t("학생단체가 보는 우리 브랜드 소개예요. 자세할수록 잘 맞는 단체를 만나요.")
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
        {brand ? (
          <div aria-labelledby="offer-rows" className="field" role="group">
            <span id="offer-rows">{labels.offer}</span>
            <div className="edit-rows">
              {offers.map((row, index) => (
                <div className="edit-row offer" key={index}>
                  <select
                    aria-label={t("협찬 종류")}
                    onChange={(event) => updateOffer(index, { kind: event.target.value })}
                    value={row.kind}
                  >
                    {brandOffers
                      .filter((item) => item === row.kind || !offers.some((other) => other.kind === item))
                      .map((item) => (
                        <option key={item} value={item}>
                          {t(item)}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label={t("협찬 내용")}
                    maxLength={30}
                    onChange={(event) => updateOffer(index, { detail: event.target.value })}
                    placeholder={t("내용 예) 150장, 20만원")}
                    value={row.detail ?? ""}
                  />
                  <button
                    aria-label={t("이 협찬 지우기")}
                    className="delete-button"
                    onClick={() => setOffers((rows) => rows.filter((_, at) => at !== index))}
                    type="button"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
              ))}
            </div>
            {offers.length < maxOffers && (
              <button
                className="add-row-button"
                onClick={() =>
                  setOffers((rows) => [...rows, { kind: brandOffers.find((item) => !rows.some((row) => row.kind === item)) ?? brandOffers[0] }])
                }
                type="button"
              >
                <Icon name="plus" size={15} /> {t("협찬 추가")}
              </button>
            )}
          </div>
        ) : (
          <>
            <label className="field">
              <span>{labels.offer}</span>
              <input
                maxLength={60}
                onChange={(event) => setOffer(event.target.value)}
                placeholder={t("예) 관객 120명 · 교내 SNS 3개 채널")}
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
          </>
        )}
      </div>

      <div className="form-card">
        <h3 className="form-card-title">{brand ? t("매장") : t("기본 정보")}</h3>
        {!brand && (
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
        )}
        {brand && (
          <div className="field">
            <span id="store-address">{t("매장 주소")}</span>
            <div className="address-row">
              <input aria-labelledby="store-address" placeholder={t("주소 검색으로 매장을 찾아 주세요")} readOnly value={address} />
              <button className="detail-button" onClick={() => setSearching(!searching)} type="button">
                {searching ? t("닫기") : t("주소 검색")}
              </button>
              {address && !searching && (
                <button className="cancel-button" onClick={() => setAddress("")} type="button">
                  {t("지우기")}
                </button>
              )}
            </div>
            {searching && <div className="address-search" ref={searchBox} />}
            <small className="field-hint">
              {listing?.location && listing.location.lat === undefined && listing.location.address === address.trim()
                ? t("아직 이 주소를 지도에서 찾지 못해 거리가 보이지 않아요. 다시 검색해 저장해 주세요.")
                : t("학생단체에게 학교에서 매장까지의 거리를 보여 드려요. 온라인 브랜드는 비워 두세요.")}
            </small>
          </div>
        )}
      </div>

      {brand && (
        <div className="form-card locked-card" aria-labelledby="auto-facts-title" role="group">
          <h3 className="form-card-title" id="auto-facts-title">
            <Icon name="lock" size={16} />
            {t("저절로 채워지는 정보")}
            <em className="locked-badge">{t("직접 고칠 수 없어요")}</em>
          </h3>
          <p className="form-card-caption">
            {t("위치, 제공 서비스, 선호 행사, 평균 응답과 태그는 매장 주소와 고른 협찬, 협찬하고 답한 기록으로 저절로 채워져요.")}
          </p>
          <dl className="auto-facts">
            {factFields[role].map((field) => {
              const value = listing?.facts?.find((fact) => fact.label === field.label)?.value
              return (
                <div key={field.label}>
                  <dt>{t(field.label)}</dt>
                  <dd className={value ? undefined : "empty"}>{value ?? t("활동이 쌓이면 보여요")}</dd>
                </div>
              )
            })}
            <div>
              <dt>{t("태그")}</dt>
              <dd className={listing?.tags.length ? undefined : "empty"}>
                {listing?.tags.length ? listing.tags.join(" · ") : t("활동이 쌓이면 보여요")}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="form-card">
        <h3 className="form-card-title">SNS</h3>
        <p className="form-card-caption">
          {brand ? t("홍보에 쓸 수 있는 채널을 알려 주세요.") : t("홍보에 쓸 수 있는 채널과 팔로워 수를 알려 주세요.")}
        </p>
        <div className="edit-rows">
          {sns.map((row, index) => (
            <div className={brand ? "edit-row sns no-followers" : "edit-row sns"} key={index}>
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
              {!brand && (
                <input
                  aria-label={t("팔로워")}
                  className="followers"
                  maxLength={20}
                  onChange={(event) => updateSns(index, { followers: event.target.value })}
                  placeholder={t("팔로워 예) 3,100명")}
                  value={row.followers ?? ""}
                />
              )}
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
        <div className="edit-rows-actions">
          {portfolio.length < maxPortfolio && (
            <button
              className="add-row-button"
              onClick={() => setPortfolio((rows) => [...rows, { title: "", detail: "" }])}
              type="button"
            >
              <Icon name="plus" size={15} /> {t("항목 추가")}
            </button>
          )}
          <button
            className="add-row-button import"
            onClick={() => {
              setPicked([])
              api.portfolioHistory().then(
                ({ items }) => setHistory(items),
                (failure: unknown) => setError(errorMessage(failure)),
              )
            }}
            type="button"
          >
            <Icon name="download" size={15} /> {brand ? t("지난 협찬 불러오기") : t("지난 행사 불러오기")}
          </button>
        </div>
      </div>

      {/* body 끝에 두어 푸터까지 모든 것을 덮는다. */}
      {createPortal(
        <Presence show={history !== null}>
          <Modal
            kicker="Portfolio"
            name="portfolio-history"
            onClose={() => setHistory(null)}
            title={brand ? t("지난 협찬 불러오기") : t("지난 행사 불러오기")}
          >
            {history?.length ? (
              <>
                <p className="form-card-caption">
                  {t("고른 것을 포트폴리오에 더해요. 더한 뒤에도 고칠 수 있어요. ({count}개까지 더 넣을 수 있어요)", {
                    count: maxPortfolio - portfolio.length,
                  })}
                </p>
                <div className="check-list history-list">
                  {history.map((item) => {
                    const added = portfolio.some((row) => row.title === item.title)
                    const checked = added || picked.includes(item.id)
                    const full = !checked && portfolio.length + picked.length >= maxPortfolio
                    return (
                      <label className={checked ? "check-row checked" : "check-row"} key={item.id}>
                        <input
                          checked={checked}
                          disabled={added || full}
                          onChange={() =>
                            setPicked((current) =>
                              current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                            )
                          }
                          type="checkbox"
                        />
                        <span aria-hidden="true" className="check-box">
                          <Icon name="check" size={14} />
                        </span>
                        <span className="check-copy">
                          <strong>{item.title}</strong>
                          <small>{added ? t("이미 포트폴리오에 있어요") : item.detail || t("기록된 숫자가 없어요")}</small>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="history-actions">
                  <button className="cancel-button" onClick={() => setHistory(null)} type="button">
                    {t("취소")}
                  </button>
                  <button
                    className="primary-button"
                    disabled={picked.length === 0}
                    onClick={() => {
                      const chosen = history.filter((item) => picked.includes(item.id))
                      setPortfolio((rows) => [
                        ...rows.filter((row) => row.title.trim() || row.detail.trim()),
                        ...chosen.map((item) => ({ title: item.title, detail: item.detail })),
                      ].slice(0, maxPortfolio))
                      setHistory(null)
                    }}
                    type="button"
                  >
                    {t("{count}개 더하기", { count: picked.length })}
                  </button>
                </div>
              </>
            ) : (
              <p className="day-empty">
                {brand ? t("아직 끝난 협찬이 없어요. 행사가 끝나면 여기서 불러올 수 있어요.") : t("아직 끝난 행사가 없어요. 행사가 끝나면 여기서 불러올 수 있어요.")}
              </p>
            )}
          </Modal>
        </Presence>,
        document.body,
      )}

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
