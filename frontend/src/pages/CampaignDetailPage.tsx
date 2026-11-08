import { DateLine } from "../components/DateLine"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { t, tc } from "../i18n"
import { formatPeriod } from "../lib/date"
import { formatWon } from "../lib/kpis"
import type { EventItem } from "../types"

// 브랜드 자신의 캠페인(/event/<id>. 학생단체의 행사는
// pages/EventDetailPage.tsx). 일정, 목표, 예산, 제공하는 것과 다음 단계(단체
// 찾기, 측정되면 결과)를 보여 준다.
export function CampaignDetailPage({
  campaign,
  onBack,
  onEdit,
  onCopy,
  onFindGroups,
  onOpenResults,
}: {
  campaign: EventItem
  onBack: () => void
  onEdit: (campaign: EventItem) => void
  onCopy: (campaign: EventItem) => void
  onFindGroups: () => void
  onOpenResults: () => void
}) {
  const measured = campaign.status === "측정 완료"
  return (
    <section className="page-view event-page">
      <PageIntro
        onBack={onBack}
        eyebrow={tc("eyebrow", "캠페인")}
        title={campaign.name}
        description={formatPeriod(campaign.date, campaign.endDate)}
        actions={
          <>
            <button className="primary-button" onClick={measured ? onOpenResults : onFindGroups} type="button">
              {measured ? t("성과 분석 보기") : t("단체 찾기")}
            </button>
            <button className="cancel-button" onClick={() => onEdit(campaign)} type="button">
              <Icon name="edit" size={15} /> {t("캠페인 수정")}
            </button>
            <button className="cancel-button" onClick={() => onCopy(campaign)} type="button">
              <Icon name="copy" size={15} /> {t("복제해서 새로 등록")}
            </button>
          </>
        }
      />

      <ul className="event-facts">
        <li>
          <span className={`status-chip status-${campaign.status.replace(" ", "")}`}>{t(campaign.status)}</span>
        </li>
        <li>
          <Icon name="calendar" size={16} />
          <DateLine date={campaign.date} />
        </li>
        {campaign.people && (
          <li>
            <Icon name="users" size={16} />
            {t("목표 도달 {count}명", { count: campaign.people.replace(/명$/, "") })}
          </li>
        )}
        {campaign.budget !== undefined && (
          <li>
            <Icon name="won" size={16} />
            {t("예산 {budget}", { budget: formatWon(campaign.budget) })}
          </li>
        )}
      </ul>

      <div className="event-body">
        <div className="event-main">
          <section aria-labelledby="campaign-offer-title" className="event-section">
            <h2 id="campaign-offer-title">{t("제공할 협찬 형태")}</h2>
            <ul className="event-facts">
              <li className="event-types">
                {campaign.types.map((type) => (
                  <span key={type}>{type === "기타" && campaign.typeNote ? campaign.typeNote : t(type)}</span>
                ))}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </section>
  )
}
