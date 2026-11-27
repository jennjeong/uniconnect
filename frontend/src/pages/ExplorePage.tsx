import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { DemandTable } from "../components/DemandTable"
import { PageIntro } from "../components/PageIntro"
import { TabBar } from "../components/TabBar"
import { eventKinds } from "../data/eventDetails"
import { brandIndustries } from "../data/industries"
import { accountTypeGroups } from "../data/roles"
import { t, tc } from "../i18n"
import { dDayLabel, formatPeriod } from "../lib/date"
import type { EventCase, ExploreEvent, Role } from "../types"

// 고른 조건은 이 탭 동안 남아서, 행사 페이지를 열었다 돌아와도 그대로다(스크롤은 App이
// 히스토리 항목마다 되돌린다).
const filterKey = "uniconnect-explore-filters"
function savedFilters(): { kind: string; groupType: string } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(filterKey) ?? "null") as { kind?: unknown; groupType?: unknown } | null
    return { kind: typeof saved?.kind === "string" ? saved.kind : "전체", groupType: typeof saved?.groupType === "string" ? saved.groupType : "" }
  } catch {
    return { kind: "전체", groupType: "" }
  }
}

// 상태는 색과 글로 함께 보인다. 협찬을 찾는 행사와 이미 협찬사가 정해진 행사.
const statusTone: Record<string, string> = { "매칭 중": "open", "집행 예정": "set", "측정 완료": "done" }

const industryName = (industry: string) => brandIndustries.find(([value]) => value === industry)?.[1] ?? industry

// 행사 둘러보기(/explore): 계정이 볼 수 있는 다른 학생단체의 다가오는 행사를
// 종류와 단체의 종류로 나눠 보여 주며 각각 자기 페이지를 연다. 그 위에는 비슷한
// 행사가 받은 협찬이 있어서 단체가 다른 단체에서 통한 것을 보고 자기 행사를
// 계획한다. 회원(공용 데모 계정 말고)에게는 맨 위에 학교 · 달별 행사 수(DemandTable)가 있어서, 브랜드가
// 언제 어느 학교에 협찬할지 정한다(#344). 브랜드는 행사 일정에서 연다.
export function ExplorePage({
  role,
  member,
  onBack,
  onOpenEvent,
}: {
  role: Role
  member: boolean
  onBack: () => void
  onOpenEvent: (eventId: string) => void
}) {
  const brand = role === "브랜드"
  const [data, setData] = useState<{ events: ExploreEvent[]; cases: EventCase[] } | null>(null)
  const [failed, setFailed] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [kind, setKind] = useState(() => savedFilters().kind)
  const [groupType, setGroupType] = useState(() => savedFilters().groupType)

  useEffect(() => {
    setFailed("")
    api.exploreEvents().then(setData, (error: unknown) => setFailed(errorMessage(error)))
  }, [attempt])

  useEffect(() => {
    try {
      sessionStorage.setItem(filterKey, JSON.stringify({ kind, groupType }))
    } catch {
      // 저장소를 못 써도 목록은 그대로다.
    }
  }, [kind, groupType])
  const filtered = kind !== "전체" || groupType !== ""
  const resetFilters = () => {
    setKind("전체")
    setGroupType("")
  }

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
        title={brand ? t("학생 행사 둘러보기") : t("다른 단체 행사 둘러보기")}
        description={
          brand
            ? t("언제 어느 학교에서 행사가 많은지 보고, 다가오는 행사와 혜택을 살펴요.")
            : t("다른 단체는 어떻게 협찬받았을까요? 행사와 혜택을 보고 우리 기획에 참고해요.")
        }
      />

      {member && <DemandTable />}

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

      {filtered && (
        <p className="explore-applied">
          <span>
            {t("적용한 조건")}: {[kind !== "전체" ? t(kind) : "", groupType ? t(groupType) : ""].filter(Boolean).join(" · ")}
          </span>
          <button className="underline-link" onClick={resetFilters} type="button">
            {t("조건 초기화")}
          </button>
        </p>
      )}

      {failed ? (
        <div className="explore-state" role="alert">
          <p>{t("행사를 불러오지 못했어요.")} {failed}</p>
          <button className="cancel-button" onClick={() => setAttempt((count) => count + 1)} type="button">
            {t("다시 불러오기")}
          </button>
        </div>
      ) : !data ? (
        <p className="day-empty">{t("행사를 불러오고 있어요…")}</p>
      ) : events.length === 0 ? (
        <div className="explore-state">
          <p>{t("아직 등록된 다가오는 행사가 없어요.")}</p>
          <small>{brand ? t("단체 찾기에서 학생단체를 먼저 살펴보세요.") : t("우리 행사를 먼저 등록해 보세요.")}</small>
        </div>
      ) : shown.length === 0 ? (
        <div className="explore-state">
          <p>{t("조건에 맞는 다가오는 행사가 없어요.")}</p>
          <button className="cancel-button" onClick={resetFilters} type="button">
            {t("조건 초기화")}
          </button>
        </div>
      ) : (
        <ul className="post-grid stagger" key={`${kind}-${groupType}`}>
          {shown.map((event, index) => (
            <li key={event.id} style={{ "--i": index } as CSSProperties}>
              {/* 행사명 → 학교 · 단체 · 날짜 → 지원 유형 · 상태 · 남은 날 순으로 훑는다. 행사명이 한 줄을 다 쓰고,
                  상태와 남은 날은 늘 셋째 줄 오른쪽에 있다. */}
              <article className="post-card explore-card">
                <div className="explore-card-top">
                  <h3>
                    <button onClick={() => onOpenEvent(event.id)} type="button">
                      {event.name}
                    </button>
                  </h3>
                </div>
                <p className="explore-card-meta">
                  {[event.group.school, event.group.name + (event.own ? ` · ${t("우리 단체")}` : ""), formatPeriod(event.date, event.endDate)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="explore-card-asks">
                  <span>{event.types.map((type) => t(type)).join(" · ") || t("지원 유형 협의")}</span>
                  <span className="explore-card-state">
                    <span className={`explore-status ${statusTone[event.status] ?? "open"}`}>{t(event.status)}</span>
                    <span className="explore-dday">{dDayLabel(event.date)}</span>
                  </span>
                </p>
                <small className="explore-card-sub">
                  {[event.venue, event.people && t("예상 {count}명", { count: event.people.replace(/명$/, "") })].filter(Boolean).join(" · ")}
                </small>
                {event.intro && <p className="explore-intro">{event.intro}</p>}
                {(event.kind || event.packages.length > 0) && (
                  <div className="post-card-foot">
                    <span className="post-types">
                      {event.kind && <span className="explore-kind">{t(event.kind)}</span>}
                      {event.packages.map((item) => (
                        <span key={item.name}>{item.name}</span>
                      ))}
                    </span>
                  </div>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
