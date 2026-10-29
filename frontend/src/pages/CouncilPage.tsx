import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { BrandMark } from "../components/BrandMark"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { PageIntro } from "../components/PageIntro"
import { t } from "../i18n"
import { formatDay, formatPeriod, toIsoDate } from "../lib/date"
import type { CouncilClub } from "../types"

// A student council's clubs (/council): its code to share, and each club
// that linked with it, read-only: its coming events, open proposals,
// sponsorships and results so far. Messages, contacts and agreements stay
// the club's. The council can take a club off, and make a new code that
// links no more clubs.
export function CouncilPage({ onBack, onNotice }: { onBack: () => void; onNotice: (message: string) => void }) {
  const [data, setData] = useState<{ code: string; clubs: CouncilClub[] } | null>(null)
  const [failed, setFailed] = useState("")
  const [removing, setRemoving] = useState<string>()

  useEffect(() => {
    api.councilClubs().then(setData, (error: unknown) => setFailed(errorMessage(error)))
  }, [])

  const run = async (change: () => Promise<void>) => {
    try {
      await change()
    } catch (error) {
      onNotice(errorMessage(error))
    }
  }

  if (!data) {
    return (
      <section className="page-view council-page">
        <PageIntro onBack={onBack} eyebrow="Council" title={t("소속 단체")} description={failed || t("불러오고 있어요…")} />
      </section>
    )
  }

  return (
    <section className="page-view council-page">
      <PageIntro
        onBack={onBack}
        eyebrow="Council"
        title={t("소속 단체")}
        description={t("소속 동아리가 학생회 코드로 연결하면 행사와 협찬 현황을 여기에서 함께 봐요. 메시지, 연락처, 계약서 내용은 보이지 않아요.")}
      />
      <div className="council-code">
        <span>
          <small>{t("학생회 코드")}</small>
          <strong>{data.code}</strong>
        </span>
        <button
          className="cancel-button"
          onClick={() =>
            void run(async () => {
              await navigator.clipboard.writeText(data.code)
              onNotice(t("코드를 복사했어요. 소속 동아리에 알려 주세요."))
            })
          }
          type="button"
        >
          {t("복사")}
        </button>
        <button
          className="cancel-button"
          onClick={() =>
            void run(async () => {
              const { code } = await api.newCouncilCode()
              setData({ ...data, code })
              onNotice(t("새 코드를 만들었어요. 지난 코드로는 더 연결할 수 없어요."))
            })
          }
          type="button"
        >
          {t("새 코드")}
        </button>
      </div>

      {data.clubs.length === 0 ? (
        <CatalogEmpty
          title={t("아직 연결한 단체가 없어요")}
          text={t("소속 동아리에 위 코드를 알려 주세요. 동아리가 내 정보의 학생회 연결에서 코드를 넣으면 여기에 보여요.")}
        />
      ) : (
        <ul className="council-clubs stagger">
          {data.clubs.map((club, index) => (
            <li key={club.id} style={{ "--i": index } as CSSProperties}>
              <article className="council-club">
                <header>
                  <BrandMark match={{ industry: club.industry ?? "performance", logo: club.logo }} />
                  <span>
                    <strong>{club.name}</strong>
                    <small>
                      {[club.school, t(club.type)].filter(Boolean).join(" · ")} ·{" "}
                      {t("{date} 연결", { date: formatDay(toIsoDate(new Date(club.linkedAt))) })}
                    </small>
                  </span>
                </header>
                <dl className="council-figures">
                  <div>
                    <dt>{t("다가오는 행사")}</dt>
                    <dd>{club.eventCount}</dd>
                  </div>
                  <div>
                    <dt>{t("답을 기다리는 제안")}</dt>
                    <dd>{club.openProposals}</dd>
                  </div>
                  <div>
                    <dt>{t("확정된 협찬")}</dt>
                    <dd>{club.sponsorships}</dd>
                  </div>
                  <div>
                    <dt>{t("QR 참여 · 쿠폰 · 방문")}</dt>
                    <dd>
                      {club.results.scans} · {club.results.coupons} · {club.results.visits}
                    </dd>
                  </div>
                </dl>
                {club.events.length > 0 ? (
                  <ul className="council-events">
                    {club.events.map((event) => (
                      <li key={event.id}>
                        <strong>{event.name}</strong>
                        <span>
                          {formatPeriod(event.date, event.endDate)}
                          {event.people && ` · ${t("예상 {count}명", { count: event.people.replace(/명$/, "") })}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="field-hint">{t("다가오는 행사가 없어요.")}</p>
                )}
                <div className="council-actions">
                  {removing === club.id ? (
                    <button
                      className="decline-button"
                      onClick={() =>
                        void run(async () => {
                          await api.removeClub(club.id)
                          setData({ ...data, clubs: data.clubs.filter((item) => item.id !== club.id) })
                          onNotice(t("{name}의 연결을 끊었어요.", { name: club.name }))
                        })
                      }
                      type="button"
                    >
                      {t("정말 연결 끊기")}
                    </button>
                  ) : (
                    <button className="cancel-button" onClick={() => setRemoving(club.id)} type="button">
                      {t("연결 끊기")}
                    </button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
