import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { Account, InvitePageData, Match, NavLabel } from "../types"

// 가게가 uniconnect에서 하는 일. 초대를 읽는 사장님을 위한 것이다.
const benefits = [
  { icon: "inbox", text: "근처 학생단체의 협찬 제안을 받고, 수락하거나 거절해요." },
  { icon: "scan", text: "행사 날 참여자가 받은 쿠폰을 매장에서 확인하고 손님을 맞아요." },
  { icon: "chart", text: "쿠폰, 방문, 예상 매출을 성과 분석에서 확인해요." },
] as const

// 학생단체의 초대가 여는 페이지(/invite/<code>). 가게 주인에게 누가 초대했고
// 가게가 무엇을 얻는지 보여 준 다음, 브랜드로 가입(또는 로그인)하고 한 번 눌러
// 가게를 연결하게 한다. 단체와 그 밖의 사람은 진행 상태를 본다.
export function InvitePage({
  code,
  account,
  onSignup,
  onLogin,
  onAccepted,
  onHome,
  onNavigate,
  onEditProfile,
  onError,
}: {
  code: string
  account: Account | null
  onSignup: () => void
  onLogin: () => void
  onAccepted: (listing: Match, group: string) => void
  onHome: () => void
  onNavigate: (label: NavLabel) => void
  onEditProfile: () => void
  onError: (error: unknown) => void
}) {
  const [data, setData] = useState<InvitePageData>()
  const [failed, setFailed] = useState("")
  const [busy, setBusy] = useState(false)

  // 누가 로그인하면 다시 읽는다. 가게가 "본인으로" 가입했는지는 보는 사람에
  // 달렸기 때문이다.
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
            <Pill onClick={onHome} variant="outline">
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
        description={t("학교 앞 가게와 협찬하고 싶어 해요. 가게로 가입하면 바로 제안을 받아요.")}
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
