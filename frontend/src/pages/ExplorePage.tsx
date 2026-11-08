import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { BrandMark } from "../components/BrandMark"
import { PageIntro } from "../components/PageIntro"
import { TabBar } from "../components/TabBar"
import { eventKinds } from "../data/eventDetails"
import { brandIndustries } from "../data/industries"
import { accountTypeGroups } from "../data/roles"
import { t, tc } from "../i18n"
import { formatPeriod } from "../lib/date"
import type { EventCase, ExploreEvent } from "../types"

const industryName = (industry: string) => brandIndustries.find(([value]) => value === industry)?.[1] ?? industry

// 행사 둘러보기(/explore): 계정이 볼 수 있는 다른 학생단체의 다가오는 행사를
// 종류와 단체의 종류로 나눠 보여 주며 각각 자기 페이지를 연다. 그 위에는 비슷한
// 행사가 받은 협찬이 있어서 단체가 다른 단체에서 통한 것을 보고 자기 행사를
// 계획한다.
export function ExplorePage({ onBack, onOpenEvent }: { onBack: () => void; onOpenEvent: (eventId: string) => void }) {
  const [data, setData] = useState<{ events: ExploreEvent[]; cases: EventCase[] } | null>(null)
  const [failed, setFailed] = useState("")
  const [kind, setKind] = useState("전체")
  const [groupType, setGroupType] = useState("")

  useEffect(() => {
    api.exploreEvents().then(setData, (error: unknown) => setFailed(errorMessage(error)))
  }, [])

  const events = data?.events ?? []
  const kinds = ["전체", ...eventKinds.filter((item) => events.some((event) => event.kind === item))]
  const shown = events.filter(
    (event) => (kind === "전체" || event.kind === kind) && (!groupType || accountTypeGroups.학생단체.find((group) => group.label === groupType)?.types.includes(event.group.type)),
  )
  const cases = (data?.cases ?? []).filter((item) => kind === "전체" || item.kind === kind)

  return (
    <section className="page-view board-page explore-page">
      <PageIntro
        onBack={onBack}
        eyebrow={tc("eyebrow", "행사 둘러보기")}
        title={t("다른 단체 행사 둘러보기")}
        description={t("다른 단체는 어떻게 협찬받았을까요? 행사와 혜택을 보고 우리 기획에 참고해요.")}
      />

      {cases.length > 0 && (
        <section aria-labelledby="explore-cases-title" className="explore-cases">
          <h2 id="explore-cases-title">{t("비슷한 행사의 협찬 사례")}</h2>
          <ul>
            {cases.map((item) => (
              <li key={item.kind}>
                <span className="explore-case-kind">{t(item.kind)}</span>
                <strong>{t("확정된 협찬 {count}건", { count: item.sponsorships })}</strong>
                {item.averagePeople !== undefined && <small>{t("평균 {count}명이 참여", { count: item.averagePeople.toLocaleString("ko-KR") })}</small>}
                {item.industries.length > 0 && (
                  <small>{t("함께한 업종: {list}", { list: item.industries.map((value) => t(industryName(value))).join(", ") })}</small>
                )}
                {item.asks.length > 0 && <small>{t("자주 받은 협찬: {list}", { list: item.asks.join(", ") })}</small>}
              </li>
            ))}
          </ul>
          <p className="field-hint">{t("이름 없이 숫자로만 모았어요.")}</p>
        </section>
      )}

      <div className="match-filters">
        <TabBar chips items={kinds.map((value) => ({ value, label: t(value) }))} label={t("행사 유형")} onChange={setKind} value={kind} />
        <div className="catalog-tools">
          <span className="catalog-select">
            <select aria-label={t("단체 종류")} onChange={(event) => setGroupType(event.target.value)} value={groupType}>
              <option value="">{t("모든 단체")}</option>
              {accountTypeGroups.학생단체.map((group) => (
                <option key={group.label} value={group.label}>
                  {t(group.label)}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {!data ? (
        <p className="day-empty">{failed || t("행사를 불러오고 있어요…")}</p>
      ) : shown.length === 0 ? (
        <p className="day-empty">{t("조건에 맞는 다가오는 행사가 없어요.")}</p>
      ) : (
        <ul className="post-grid stagger" key={`${kind}-${groupType}`}>
          {shown.map((event, index) => (
            <li key={event.id} style={{ "--i": index } as CSSProperties}>
              <article className="post-card">
                <div className="post-card-head">
                  <BrandMark match={{ ...event.group, industry: "performance" }} />
                  <span>
                    <strong>
                      {event.group.name}
                      {event.own ? ` · ${t("우리 단체")}` : ""}
                    </strong>
                    <small>{[event.group.school, t(event.group.type)].filter(Boolean).join(" · ")}</small>
                  </span>
                </div>
                <h3>
                  <button onClick={() => onOpenEvent(event.id)} type="button">
                    {event.name}
                  </button>
                </h3>
                <p className="post-card-event">
                  {[formatPeriod(event.date, event.endDate), event.venue, event.people && t("예상 {count}명", { count: event.people.replace(/명$/, "") })]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {event.intro && <p className="explore-intro">{event.intro}</p>}
                <div className="post-card-foot">
                  <span className="post-types">
                    {event.kind && <span className="explore-kind">{t(event.kind)}</span>}
                    {event.packages.map((item) => (
                      <span key={item.name}>{item.name}</span>
                    ))}
                    {event.promo?.spots.slice(0, 2).map((spot) => (
                      <span key={spot}>{t(spot)}</span>
                    ))}
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
