import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { Account, InvitePageData, Match, NavLabel } from "../types"

// What a shop does on uniconnect, for its owner reading the invitation.
const benefits = [
  { icon: "inbox", text: "근처 학생단체의 협찬 제안을 받고, 수락하거나 거절해요." },
  { icon: "scan", text: "행사 날 참여자가 받은 쿠폰을 매장에서 확인하고 손님을 맞아요." },
  { icon: "chart", text: "쿠폰, 방문, 예상 매출을 성과 분석에서 확인해요." },
] as const

// The page a student group's invitation opens (/invite/<code>), for the
// shop's owner: who invited and what the shop gets, then joining as a brand
// (or logging in) and linking the shop with one press. The group and anyone
// else see how it stands.
export function InvitePage({
  code,
  account,
  onSignup,
  onLogin,
  onAccepted,
  onNavigate,
  onEditProfile,
  onError,
}: {
  code: string
  account: Account | null
  onSignup: () => void
  onLogin: () => void
  onAccepted: (listing: Match, group: string) => void
  onNavigate: (label: NavLabel) => void
  onEditProfile: () => void
  onError: (error: unknown) => void
}) {
  const [data, setData] = useState<InvitePageData>()
  const [failed, setFailed] = useState("")
  const [busy, setBusy] = useState(false)

  // Read again when someone logs in, as whether the shop joined "as you"
  // depends on who looks.
  const accountId = account?.id
  useEffect(() => {
    let cancelled = false
    setFailed("")
    api.invite(code).then(
      (result) => {
        if (!cancelled) setData(result)
      },
      (error) => {
        if (!cancelled) setFailed(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [code, accountId])

  const accept = async () => {
    setBusy(true)
    try {
      const result = await api.acceptInvite(code)
      setData(result)
      onAccepted(result.listing, result.group?.name ?? "")
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  if (failed || !data) {
    return (
      <section className="page-view invite-page">
        <PageIntro eyebrow="Invitation" title={t("uniconnect 초대장")} description={failed || t("초대장을 불러오고 있어요…")} />
        {failed && (
          <div className="invite-actions">
            <Pill onClick={() => onNavigate("대시보드")} variant="outline">
              {t("홈으로")}
            </Pill>
          </div>
        )}
      </section>
    )
  }

  const { invite, group } = data
  const name = group?.name ?? t("학생단체")
  const joined = invite.joined

  return (
    <section className="page-view invite-page">
      <PageIntro
        eyebrow="Invitation"
        title={t("{name}에서 초대했어요", { name })}
        description={t("학교 근처 가게와 협찬을 함께하고 싶어 해요. uniconnect에 가게로 가입하면 이 단체의 협찬 제안을 받을 수 있어요.")}
      />

      <div className="invite-layout">
        <article className="invite-group" data-reveal>
          <div className="invite-group-head">
            {group?.industry ? (
              <BrandMark match={{ industry: group.industry, logo: group.logo }} />
            ) : (
              <div aria-hidden="true" className="match-logo monogram">
                {Array.from(name.trim())[0]}
              </div>
            )}
            <div>
              <h2>{name}</h2>
              <p>{[group?.school, group?.category && t(group.category)].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          {group?.eventName && group.eventDate && (
            <p className="invite-event">
              <Icon name="calendar" size={16} />
              <span>
                {t("다가오는 행사")} <strong>{group.eventName}</strong> · {formatFullDate(group.eventDate)}
              </span>
            </p>
          )}
          {group?.intro && <p className="invite-intro">{group.intro}</p>}
          <a className="invite-place" href={invite.placeUrl} rel="noopener noreferrer" target="_blank">
            {t("초대받은 가게를 카카오맵에서 확인하기")}
            <Icon name="arrowUpRight" size={14} />
            <span className="sr-only">{t("(새 창)")}</span>
          </a>
        </article>

        <div className="invite-side">
          <ul className="invite-benefits">
            {benefits.map((item) => (
              <li key={item.icon}>
                <Icon name={item.icon} size={18} />
                <span>{t(item.text)}</span>
              </li>
            ))}
          </ul>

          <div aria-live="polite" className="invite-cta">
            {joined === "you" ? (
              <>
                <p className="invite-done">
                  <Icon name="check" size={18} />
                  {t("연결됐어요. 이제 {name}의 협찬 제안을 받을 수 있어요.", { name })}
                </p>
                <div className="invite-actions">
                  <Pill arrow="right" onClick={() => onNavigate("받은 제안")}>
                    {t("받은 제안 보기")}
                  </Pill>
                  <Pill onClick={onEditProfile} variant="outline">
                    {t("가게 소개 쓰기")}
                  </Pill>
                </div>
              </>
            ) : joined === "other" ? (
              <p className="invite-note">{t("이 가게는 이미 uniconnect에 가입했어요.")}</p>
            ) : !account ? (
              <>
                <div className="invite-actions">
                  <Pill arrow="right" onClick={onSignup}>
                    {t("가게로 가입하기")}
                  </Pill>
                  <Pill onClick={onLogin} variant="outline">
                    {t("이미 계정이 있어요")}
                  </Pill>
                </div>
                <p className="invite-note">
                  {t("가입은 회사나 가게 이메일로 해요. 네이버, 지메일 같은 개인 메일은 받지 않아요.")}
                </p>
              </>
            ) : account.role === "브랜드" ? (
              <div className="invite-actions">
                <Pill arrow="right" disabled={busy} onClick={() => void accept()}>
                  {t("우리 가게로 연결하기")}
                </Pill>
              </div>
            ) : (
              <p className="invite-note">
                {t("가게 사장님께 이 링크를 보내 주세요. 사장님이 가게로 가입하면 연결돼요.")}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
