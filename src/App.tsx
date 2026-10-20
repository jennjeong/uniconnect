import { useEffect, useRef, useState, type ReactNode } from "react"

type IconName = "home" | "spark" | "calendar" | "chart" | "file" | "bell" | "arrow" | "plus" | "users" | "store" | "scan" | "check" | "chevron" | "close"

const icons: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  store: (
    <>
      <path d="M3 9h18l-2-5H5zM5 9v11h14V9M9 20v-6h6v6" />
    </>
  ),
  scan: (
    <>
      <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M8 12h8" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {icons[name]}
    </svg>
  )
}

const navItems: { label: string; icon: IconName }[] = [
  { label: "대시보드", icon: "home" },
  { label: "추천 매칭", icon: "spark" },
  { label: "내 행사", icon: "calendar" },
  { label: "성과 측정", icon: "chart" },
  { label: "리포트", icon: "file" },
]

const matches = [
  {
    name: "오후의 커피",
    category: "카페 · 식음료",
    offer: "쿠폰 150장 + 현금 20만원",
    score: 94,
    color: "#f8d8a6",
    mark: "OC",
    tags: ["대학생 선호", "반경 1.2km"],
  },
  {
    name: "모먼트 스튜디오",
    category: "사진 · 콘텐츠",
    offer: "행사 스냅 촬영 전체",
    score: 88,
    color: "#d8e8ff",
    mark: "MO",
    tags: ["공연 특화", "재협찬 높음"],
  },
  {
    name: "프레시온",
    category: "웰니스 · F&B",
    offer: "에너지 드링크 200개",
    score: 83,
    color: "#d9f0dd",
    mark: "FR",
    tags: ["현물 협찬", "20대 타깃"],
  },
]

const brandMatches = [
  {
    name: "삼육대 뮤즈",
    category: "공연 · 동아리",
    offer: "관객 120명 · 교내 SNS 3개 채널",
    score: 96,
    color: "#ffe1ec",
    mark: "MU",
    tags: ["공연 특화", "11월 27일"],
  },
  {
    name: "노원 크리에이터스",
    category: "콘텐츠 · 연합회",
    offer: "콘텐츠 8편 · 예상 도달 4,200명",
    score: 91,
    color: "#d8e8ff",
    mark: "NC",
    tags: ["콘텐츠 제작", "20대 타깃"],
  },
  {
    name: "서울여대 러너스",
    category: "스포츠 · 동아리",
    offer: "참여자 80명 · 현장 부스 운영",
    score: 84,
    color: "#d9f0dd",
    mark: "SR",
    tags: ["웰니스", "현장 체험"],
  },
]

type EventItem = {
  id: number
  name: string
  date: string
  people: string
  types: string[]
  status: "매칭 중" | "집행 예정" | "측정 완료"
}

const initialEvents: EventItem[] = [
  {
    id: 1,
    name: "2026 뮤즈 종강 공연",
    date: "2026. 11. 27.",
    people: "120명",
    types: ["현금", "제품"],
    status: "매칭 중",
  },
  {
    id: 2,
    name: "가을 버스킹 데이",
    date: "2026. 10. 12.",
    people: "160명",
    types: ["제품"],
    status: "측정 완료",
  },
]

// Accepts "2026. 11. 27.", "2026-11-27", "11월 27일" and similar free-form input.
function monthAndDay(date: string) {
  const numbers = (date.match(/\d+/g) ?? []).filter((part) => part.length <= 2)
  const [month = "-", day = "-"] = numbers.slice(-2)
  return { month, day }
}

function App() {
  const [activeNav, setActiveNav] = useState("대시보드")
  const [role, setRole] = useState<"학생단체" | "브랜드">("학생단체")
  const [activeModal, setActiveModal] =
    useState<"event" | "notifications" | "report" | "qr" | null>(null)
  const [notice, setNotice] = useState("")
  const noticeTimer = useRef<number | undefined>(undefined)
  const [proposed, setProposed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("uniconnect-proposals") || "[]")
    } catch {
      return []
    }
  })
  const [events, setEvents] = useState<EventItem[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("uniconnect-events") ||
          JSON.stringify(initialEvents),
      )
    } catch {
      return initialEvents
    }
  })
  const [eventDraft, setEventDraft] = useState({
    name: role === "학생단체" ? "2026 뮤즈 종강 공연" : "11월 캠퍼스 캠페인",
    people: "120명",
    date: "2026. 11. 27.",
  })
  const [sponsorTypes, setSponsorTypes] = useState(["현금", "제품"])
  const [metrics, setMetrics] = useState({
    scans: 128,
    coupons: 94,
    visits: 41,
  })
  const [notificationsRead, setNotificationsRead] = useState(false)

  const activeMatches = role === "학생단체" ? matches : brandMatches
  const roleName = role === "학생단체" ? "뮤즈 팀" : "오후의 커피"

  useEffect(() => {
    localStorage.setItem("uniconnect-events", JSON.stringify(events))
  }, [events])

  useEffect(() => {
    localStorage.setItem("uniconnect-proposals", JSON.stringify(proposed))
  }, [proposed])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    if (!activeModal) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveModal(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [activeModal])

  const showNotice = (message: string) => {
    window.clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2400)
  }

  const sendProposal = (name: string) => {
    setProposed((current) => [...current, name])
    showNotice(`${name}에 협찬 제안을 보냈어요.`)
  }

  const navigate = (label: string) => {
    setActiveNav(label)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const createEvent = () => {
    if (!eventDraft.name.trim() || !eventDraft.date.trim()) {
      showNotice("행사명과 일정을 입력해 주세요.")
      return
    }
    setEvents((current) => [
      {
        id: Date.now(),
        ...eventDraft,
        types: sponsorTypes,
        status: "매칭 중",
      },
      ...current,
    ])
    setActiveModal(null)
    setActiveNav("내 행사")
    showNotice(
      role === "학생단체"
        ? "행사가 등록되었어요. 추천 매칭을 시작합니다."
        : "캠페인이 등록되었어요. 적합한 단체를 찾습니다.",
    )
  }

  const downloadReport = () => {
    const text = [
      "UniConnect 성과 리포트",
      "행사: 가을 버스킹 데이",
      `QR 스캔: ${metrics.scans}`,
      `쿠폰 수령: ${metrics.coupons}`,
      `매장 방문: ${metrics.visits}`,
      "추정 ROAS: 243%",
    ].join("\n")
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "uniconnect-performance-report.txt"
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // Revoking right after click() can cancel the download in Safari and Firefox.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    showNotice("성과 리포트를 다운로드했어요.")
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol">
            <span>U</span>
          </div>
          <span className="brand-name">uniconnect</span>
        </div>

        <div className="role-switch" aria-label="사용자 유형">
          {(["학생단체", "브랜드"] as const).map((item) => (
            <button
              className={role === item ? "role-button active" : "role-button"}
              key={item}
              onClick={() => {
                setRole(item)
                setProposed([])
                setEventDraft({
                  name:
                    item === "학생단체"
                      ? "2026 뮤즈 종강 공연"
                      : "11월 캠퍼스 캠페인",
                  people: item === "학생단체" ? "120명" : "1,000명",
                  date: "2026. 11. 27.",
                })
                showNotice(`${item} 전용 데이터로 전환했어요.`)
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <nav className="main-nav" aria-label="주요 메뉴">
          <span className="nav-label">MENU</span>
          {navItems.map((item) => (
            <button
              className={
                activeNav === item.label ? "nav-item active" : "nav-item"
              }
              key={item.label}
              onClick={() => navigate(item.label)}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.label === "추천 매칭" && (
                <span className="nav-count">3</span>
              )}
            </button>
          ))}
        </nav>

        <div className="pilot-card">
          <span className="pilot-kicker">MVP PILOT</span>
          <strong>삼육대 파일럿</strong>
          <span>11월 30일까지</span>
          <div className="pilot-progress">
            <span />
          </div>
          <small>전체 목표의 68%</small>
        </div>

        <div className="profile">
          <div className="avatar">S</div>
          <div>
            <strong>
              {role === "학생단체" ? "삼육대 뮤즈" : "오후의 커피"}
            </strong>
            <span>{role === "학생단체" ? "공연 동아리" : "지역 브랜드"}</span>
          </div>
          <Icon name="chevron" size={16} />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">2026 FALL SEMESTER</span>
            <p className="page-title">
              {activeNav === "대시보드" ? `반가워요, ${roleName}` : activeNav}
            </p>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label="알림"
              onClick={() => {
                setActiveModal("notifications")
                setNotificationsRead(true)
              }}
              type="button"
            >
              <Icon name="bell" />
              {!notificationsRead && <span className="notification-dot" />}
            </button>
            <button
              className="primary-button"
              onClick={() => setActiveModal("event")}
              type="button"
            >
              <Icon name="plus" size={18} />
              <span>
                {role === "학생단체" ? "새 행사 등록" : "새 캠페인 등록"}
              </span>
            </button>
          </div>
        </header>

        {activeNav === "대시보드" && (
          <>
            <section className="welcome-panel">
              <div className="welcome-copy">
                <span className="section-kicker">YOUR NEXT CONNECTION</span>
                <p className="welcome-title">
                  {role === "학생단체" ? "좋은 행사는," : "좋은 캠페인은,"}
                  <br />
                  <em>좋은 파트너</em>를 만날 때 커져요.
                </p>
                <p className="welcome-description">
                  {role === "학생단체"
                    ? "다가오는 종강 공연과 잘 맞는 브랜드 3곳을 찾았어요."
                    : "이번 캠페인과 잘 맞는 학생단체 3곳을 찾았어요."}
                  <br />
                  제안부터 성과 리포트까지 한 번에 진행해 보세요.
                </p>
                <button
                  className="text-link"
                  onClick={() => navigate("추천 매칭")}
                  type="button"
                >
                  추천 매칭 확인하기 <Icon name="arrow" size={18} />
                </button>
              </div>
              <div className="connection-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="art-node brand-node">
                  <Icon name="store" size={26} />
                  <span>BRAND</span>
                </div>
                <div className="art-center">
                  <Icon name="spark" size={30} />
                </div>
                <div className="art-node group-node">
                  <Icon name="users" size={26} />
                  <span>GROUP</span>
                </div>
                <span className="spark-dot dot-one" />
                <span className="spark-dot dot-two" />
                <span className="spark-dot dot-three" />
              </div>
            </section>

            <section className="workflow-section">
              <div className="section-heading-row">
                <div>
                  <span className="section-kicker dark">
                    SPONSORSHIP JOURNEY
                  </span>
                  <p className="section-title">내 협찬 진행 현황</p>
                </div>
                <button
                  className="subtle-link"
                  onClick={() => navigate("내 행사")}
                  type="button"
                >
                  전체 보기 <Icon name="chevron" size={15} />
                </button>
              </div>
              <div className="workflow-card">
                {[
                  ["check", "행사 등록", "완료"],
                  ["spark", "매칭·제안", "진행 중"],
                  ["calendar", "집행 관리", "11.27 예정"],
                  ["scan", "성과 측정", "대기"],
                  ["file", "리포트", "대기"],
                ].map(([icon, label, status], index) => (
                  <div
                    className={`workflow-step ${index === 1 ? "current" : ""}`}
                    key={label}
                  >
                    <div className="step-icon">
                      <Icon name={icon as IconName} size={19} />
                    </div>
                    <div>
                      <span>0{index + 1}</span>
                      <strong>{label}</strong>
                      <small>{status}</small>
                    </div>
                    {index < 4 && (
                      <div className="step-line">
                        <span />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="stats-grid">
              <article className="stat-card">
                <div className="stat-top">
                  <span>추천 브랜드</span>
                  <Icon name="spark" size={18} />
                </div>
                <strong>12</strong>
                <small>
                  이번 주 <em>+3곳</em>
                </small>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span>진행 중 협찬</span>
                  <Icon name="calendar" size={18} />
                </div>
                <strong>2</strong>
                <small>제안 검토 중 1건</small>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span>예상 협찬 가치</span>
                  <Icon name="chart" size={18} />
                </div>
                <strong>₩680K</strong>
                <small>현물 환산 포함</small>
              </article>
              <article className="stat-card scan-card">
                <div className="stat-top">
                  <span>누적 QR 참여</span>
                  <Icon name="scan" size={18} />
                </div>
                <strong>428</strong>
                <small>
                  평균 참여율 <em>36%</em>
                </small>
              </article>
            </section>

            <section className="content-grid" id="matches">
              <div className="matches-panel">
                <div className="section-heading-row">
                  <div>
                    <span className="section-kicker dark">SMART MATCH</span>
                    <p className="section-title">종강 공연 추천 매칭</p>
                  </div>
                  <span className="updated-at">오늘 10:24 업데이트</span>
                </div>
                <div className="match-list">
                  {activeMatches.map((match) => {
                    const isProposed = proposed.includes(match.name)
                    return (
                      <article className="match-card" key={match.name}>
                        <div
                          className="match-logo"
                          style={{ backgroundColor: match.color }}
                        >
                          {match.mark}
                        </div>
                        <div className="match-details">
                          <div className="match-title-row">
                            <strong>{match.name}</strong>
                            <span>{match.category}</span>
                          </div>
                          <p>{match.offer}</p>
                          <div className="tag-row">
                            {match.tags.map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        </div>
                        <div className="score">
                          <span>매칭 적합도</span>
                          <strong>
                            {match.score}
                            <small>%</small>
                          </strong>
                        </div>
                        <button
                          className={
                            isProposed
                              ? "proposal-button done"
                              : "proposal-button"
                          }
                          disabled={isProposed}
                          onClick={() => sendProposal(match.name)}
                          type="button"
                        >
                          {isProposed ? (
                            <>
                              <Icon name="check" size={16} /> 제안 완료
                            </>
                          ) : (
                            "제안하기"
                          )}
                        </button>
                      </article>
                    )
                  })}
                </div>
              </div>

              <aside className="performance-panel">
                <div className="section-heading-row compact">
                  <div>
                    <span className="section-kicker dark">PERFORMANCE</span>
                    <p className="section-title">최근 행사 성과</p>
                  </div>
                  <button
                    className="more-button"
                    aria-label="성과 더보기"
                    onClick={() => navigate("리포트")}
                    type="button"
                  >
                    •••
                  </button>
                </div>
                <div className="event-summary">
                  <div>
                    <strong>가을 버스킹 데이</strong>
                    <span>2026. 10. 12.</span>
                  </div>
                  <span className="complete-badge">측정 완료</span>
                </div>
                <div className="chart-area">
                  <div className="chart-y">
                    <span>150</span>
                    <span>100</span>
                    <span>50</span>
                    <span>0</span>
                  </div>
                  <div className="bars">
                    {[
                      ["QR 스캔", 88, "128"],
                      ["쿠폰 수령", 66, "94"],
                      ["매장 방문", 32, "41"],
                    ].map(([label, height, value]) => (
                      <div className="bar-item" key={label}>
                        <span className="bar-value">{value}</span>
                        <div className="bar-track">
                          <span style={{ height: `${height}%` }} />
                        </div>
                        <small>{label}</small>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="report-highlight">
                  <div className="mini-icon">
                    <Icon name="chart" size={18} />
                  </div>
                  <div>
                    <span>추정 ROAS</span>
                    <strong>243%</strong>
                  </div>
                  <button
                    aria-label="리포트 열기"
                    onClick={() => setActiveModal("report")}
                    type="button"
                  >
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
              </aside>
            </section>
          </>
        )}

        {activeNav === "추천 매칭" && (
          <section className="page-view">
            <div className="view-intro match-intro">
              <div>
                <span className="section-kicker">SMART MATCH</span>
                <p>
                  {role === "학생단체"
                    ? "내 행사에 맞는 브랜드를 찾았어요"
                    : "캠페인에 맞는 학생단체를 찾았어요"}
                </p>
                <small>
                  행사 정보, 타깃, 거리와 지난 성과를 함께 분석한 결과예요.
                </small>
              </div>
              <span className="result-count">
                {activeMatches.length}개 추천
              </span>
            </div>
            <div className="full-match-grid">
              {activeMatches.map((match, index) => {
                const isProposed = proposed.includes(match.name)
                return (
                  <article className="full-match-card" key={match.name}>
                    <div className="rank">0{index + 1}</div>
                    <div
                      className="match-logo large"
                      style={{ backgroundColor: match.color }}
                    >
                      {match.mark}
                    </div>
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
                    <div className="match-score-ring">
                      <strong>{match.score}</strong>
                      <span>% 일치</span>
                    </div>
                    <button
                      className={
                        isProposed ? "proposal-button done" : "primary-button"
                      }
                      disabled={isProposed}
                      onClick={() => sendProposal(match.name)}
                      type="button"
                    >
                      {isProposed ? (
                        <>
                          <Icon name="check" size={16} /> 제안 완료
                        </>
                      ) : (
                        "협찬 제안 보내기"
                      )}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {activeNav === "내 행사" && (
          <section className="page-view">
            <div className="section-heading-row view-heading">
              <div>
                <span className="section-kicker dark">EVENTS & CAMPAIGNS</span>
                <p className="section-title">
                  {role === "학생단체" ? "등록한 행사" : "등록한 캠페인"}
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setActiveModal("event")}
                type="button"
              >
                <Icon name="plus" size={17} /> 새로 등록
              </button>
            </div>
            <div className="event-grid">
              {events.map((event) => (
                <article className="event-card" key={event.id}>
                  <div className="event-date">
                    <span>{monthAndDay(event.date).month}</span>
                    <strong>{monthAndDay(event.date).day}</strong>
                  </div>
                  <div className="event-card-copy">
                    <span
                      className={`status-chip status-${event.status.replace(" ", "")}`}
                    >
                      {event.status}
                    </span>
                    <strong>{event.name}</strong>
                    <p>
                      예상 참여 {event.people} · {event.types.join(" · ")} 협찬
                    </p>
                  </div>
                  <div className="event-card-actions">
                    <button
                      className="cancel-button"
                      onClick={() => {
                        setActiveNav(
                          event.status === "측정 완료" ? "리포트" : "추천 매칭",
                        )
                        showNotice(`${event.name} 상세 흐름을 열었어요.`)
                      }}
                      type="button"
                    >
                      상세 보기
                    </button>
                    <button
                      className="delete-button"
                      aria-label={`${event.name} 삭제`}
                      onClick={() => {
                        setEvents((current) =>
                          current.filter((item) => item.id !== event.id),
                        )
                        showNotice("목록에서 삭제했어요.")
                      }}
                      type="button"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeNav === "성과 측정" && (
          <section className="page-view measurement-view">
            <div className="view-intro measurement-intro">
              <div>
                <span className="section-kicker">LIVE ATTRIBUTION</span>
                <p>현장 반응을 실시간으로 측정해요</p>
                <small>
                  고유 QR과 쿠폰 데이터를 행사 성과로 안전하게 집계합니다.
                </small>
              </div>
              <button
                className="primary-button"
                onClick={() => setActiveModal("qr")}
                type="button"
              >
                <Icon name="scan" size={18} /> 현장 QR 열기
              </button>
            </div>
            <div className="live-metrics">
              {[
                ["QR 스캔", metrics.scans, "scan"],
                ["쿠폰 수령", metrics.coupons, "file"],
                ["매장 방문", metrics.visits, "store"],
              ].map(([label, value, icon]) => (
                <article className="live-card" key={label as string}>
                  <div className="live-icon">
                    <Icon name={icon as IconName} />
                  </div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>가을 버스킹 데이</small>
                </article>
              ))}
            </div>
            <div className="measurement-console">
              <div>
                <span className="section-kicker dark">MVP DEMO CONTROL</span>
                <p className="section-title">측정 이벤트 테스트</p>
                <small>
                  파일럿에서는 실제 QR·쿠폰 로그가 자동으로 반영됩니다.
                </small>
              </div>
              <div className="console-actions">
                <button
                  onClick={() =>
                    setMetrics((m) => ({ ...m, scans: m.scans + 1 }))
                  }
                  type="button"
                >
                  QR 스캔 +1
                </button>
                <button
                  onClick={() =>
                    setMetrics((m) => ({ ...m, coupons: m.coupons + 1 }))
                  }
                  type="button"
                >
                  쿠폰 수령 +1
                </button>
                <button
                  onClick={() =>
                    setMetrics((m) => ({ ...m, visits: m.visits + 1 }))
                  }
                  type="button"
                >
                  방문 확인 +1
                </button>
              </div>
            </div>
          </section>
        )}

        {activeNav === "리포트" && (
          <section className="page-view">
            <div className="section-heading-row view-heading">
              <div>
                <span className="section-kicker dark">PERFORMANCE REPORTS</span>
                <p className="section-title">성과 리포트</p>
              </div>
              <button
                className="primary-button"
                onClick={downloadReport}
                type="button"
              >
                리포트 다운로드
              </button>
            </div>
            <div className="report-overview">
              <article className="report-hero">
                <span>가을 버스킹 데이 · 2026. 10. 12.</span>
                <p>
                  협찬 성과가 목표보다
                  <br />
                  <em>43% 높았어요.</em>
                </p>
                <button
                  className="text-link"
                  onClick={() => setActiveModal("report")}
                  type="button"
                >
                  상세 데이터 보기 <Icon name="arrow" size={18} />
                </button>
              </article>
              <div className="report-metric-grid">
                <article>
                  <span>도달 인원</span>
                  <strong>1,240</strong>
                  <small>목표 대비 112%</small>
                </article>
                <article>
                  <span>QR 참여율</span>
                  <strong>{Math.round((metrics.scans / 350) * 100)}%</strong>
                  <small>{metrics.scans}명 참여</small>
                </article>
                <article>
                  <span>방문 전환율</span>
                  <strong>
                    {Math.round((metrics.visits / metrics.scans) * 100)}%
                  </strong>
                  <small>{metrics.visits}명 방문</small>
                </article>
                <article>
                  <span>추정 ROAS</span>
                  <strong>243%</strong>
                  <small>협찬 가치 68만원</small>
                </article>
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
        {navItems.map((item) => (
          <button
            className={activeNav === item.label ? "active" : ""}
            key={item.label}
            onClick={() => navigate(item.label)}
            type="button"
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label.replace("추천 ", "")}</span>
          </button>
        ))}
      </nav>

      {activeModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setActiveModal(null)}
        >
          <div
            className={`modal modal-${activeModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="section-kicker dark">
                  {activeModal === "event" && "NEW CONNECTION"}
                  {activeModal === "notifications" && "NOTIFICATIONS"}
                  {activeModal === "report" && "PERFORMANCE"}
                  {activeModal === "qr" && "LIVE QR"}
                </span>
                <p id="modal-title">
                  {activeModal === "event" &&
                    (role === "학생단체" ? "새 행사 등록" : "새 캠페인 등록")}
                  {activeModal === "notifications" && "새로운 소식"}
                  {activeModal === "report" && "성과 상세"}
                  {activeModal === "qr" && "현장 참여 QR"}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="닫기"
                onClick={() => setActiveModal(null)}
                type="button"
              >
                <Icon name="close" />
              </button>
            </div>

            {activeModal === "event" && (
              <>
                <label>
                  {role === "학생단체" ? "행사명" : "캠페인명"}
                  <input
                    value={eventDraft.name}
                    onChange={(event) =>
                      setEventDraft((draft) => ({
                        ...draft,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="form-row">
                  <label>
                    예상 참여 인원
                    <input
                      value={eventDraft.people}
                      onChange={(event) =>
                        setEventDraft((draft) => ({
                          ...draft,
                          people: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    일정
                    <input
                      value={eventDraft.date}
                      onChange={(event) =>
                        setEventDraft((draft) => ({
                          ...draft,
                          date: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div
                  className="field-group"
                  role="group"
                  aria-labelledby="sponsor-type-label"
                >
                  <span id="sponsor-type-label">원하는 협찬 유형</span>
                  <div className="choice-row">
                    {["현금", "제품", "서비스"].map((type) => (
                      <button
                        className={
                          sponsorTypes.includes(type)
                            ? "choice active"
                            : "choice"
                        }
                        key={type}
                        onClick={() =>
                          setSponsorTypes((current) =>
                            current.includes(type)
                              ? current.filter((item) => item !== type)
                              : [...current, type],
                          )
                        }
                        type="button"
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="modal-actions">
                  <button
                    className="cancel-button"
                    onClick={() => setActiveModal(null)}
                    type="button"
                  >
                    취소
                  </button>
                  <button
                    className="primary-button"
                    onClick={createEvent}
                    type="button"
                  >
                    등록하고 매칭 받기
                  </button>
                </div>
              </>
            )}

            {activeModal === "notifications" && (
              <div className="notification-list">
                <button
                  onClick={() => {
                    setActiveModal(null)
                    navigate("추천 매칭")
                  }}
                  type="button"
                >
                  <span className="notification-icon">
                    <Icon name="spark" size={18} />
                  </span>
                  <span>
                    <strong>새 추천 매칭 3건</strong>
                    <small>종강 공연과 잘 맞는 파트너를 찾았어요.</small>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
                <button
                  onClick={() => {
                    setActiveModal(null)
                    navigate("리포트")
                  }}
                  type="button"
                >
                  <span className="notification-icon green">
                    <Icon name="chart" size={18} />
                  </span>
                  <span>
                    <strong>성과 리포트가 완성됐어요</strong>
                    <small>가을 버스킹 데이 · ROAS 243%</small>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            )}

            {activeModal === "report" && (
              <div className="report-detail">
                <div className="report-detail-score">
                  <span>추정 ROAS</span>
                  <strong>243%</strong>
                  <small>목표 대비 +43%</small>
                </div>
                <div className="report-detail-rows">
                  <div>
                    <span>QR 스캔</span>
                    <strong>{metrics.scans}명</strong>
                  </div>
                  <div>
                    <span>쿠폰 수령</span>
                    <strong>{metrics.coupons}명</strong>
                  </div>
                  <div>
                    <span>방문 확인</span>
                    <strong>{metrics.visits}명</strong>
                  </div>
                  <div>
                    <span>예상 협찬 가치</span>
                    <strong>680,000원</strong>
                  </div>
                </div>
                <button
                  className="primary-button wide"
                  onClick={downloadReport}
                  type="button"
                >
                  리포트 다운로드
                </button>
              </div>
            )}

            {activeModal === "qr" && (
              <div className="qr-content">
                <div
                  className="qr-code"
                  role="img"
                  aria-label="가상 현장 참여 QR 코드"
                >
                  {Array.from({ length: 64 }, (_, index) => (
                    <span
                      className={(index * 7 + (index % 5)) % 3 ? "filled" : ""}
                      key={index}
                    />
                  ))}
                </div>
                <strong>가을 버스킹 데이</strong>
                <span>UNICONNECT-EVENT-1012</span>
                <button
                  className="primary-button wide"
                  onClick={() => {
                    setMetrics((current) => ({
                      ...current,
                      scans: current.scans + 1,
                    }))
                    showNotice("테스트 스캔이 기록됐어요.")
                  }}
                  type="button"
                >
                  테스트 스캔 기록
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className="toast">
          <Icon name="check" size={18} />
          {notice}
        </div>
      )}
    </div>
  )
}

export default App
