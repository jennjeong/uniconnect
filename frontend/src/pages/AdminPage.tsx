import { useCallback, useEffect, useState } from "react"

import { ApiError, api, errorMessage } from "../api"
import { PageIntro } from "../components/PageIntro"
import { PasswordField } from "../components/PasswordField"
import { Pill } from "../components/Pill"
import { TabBar } from "../components/TabBar"
import { locale, t } from "../i18n"
import { formatDateTime } from "../lib/date"
import type { AdminInquiry, PlatformStats } from "../types"

// The operators' token lives in this tab only, and goes when it closes.
const storageKey = "uniconnect-admin-token"

function readToken() {
  try {
    return sessionStorage.getItem(storageKey) ?? ""
  } catch {
    return ""
  }
}

function writeToken(token: string) {
  try {
    if (token) sessionStorage.setItem(storageKey, token)
    else sessionStorage.removeItem(storageKey)
  } catch {
    // Without storage the token lasts until the page reloads.
  }
}

type Tab = "waiting" | "answered"

function InquiryCard({
  inquiry,
  onAnswer,
}: {
  inquiry: AdminInquiry
  onAnswer: (inquiry: AdminInquiry, answer: string) => Promise<void>
}) {
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <article className="admin-card">
      <div className="admin-card-head">
        <span className="admin-category">{t(inquiry.category)}</span>
        <time dateTime={inquiry.createdAt}>{formatDateTime(inquiry.createdAt)}</time>
      </div>
      <p className="admin-from">
        {inquiry.from ? `${inquiry.from.name} · ${t(inquiry.from.role)} · ${inquiry.from.email}` : t("탈퇴한 회원")}
      </p>
      <p className="admin-question">{inquiry.question}</p>
      {inquiry.answer ? (
        <div className="admin-answer">
          <strong>{t("답변")} {inquiry.answeredAt && <small>{formatDateTime(inquiry.answeredAt)}</small>}</strong>
          <p>{inquiry.answer}</p>
        </div>
      ) : (
        <form
          className="admin-answer-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) return
            setBusy(true)
            onAnswer(inquiry, draft.trim()).finally(() => setBusy(false))
          }}
        >
          <textarea
            aria-label={t("답변")}
            maxLength={2000}
            placeholder={t("회원이 '내 질문'에서 보게 될 답변을 적어 주세요.")}
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="primary-button" disabled={busy || !draft.trim()} type="submit">
            {t("답변 보내기")}
          </button>
        </form>
      )}
    </article>
  )
}

// The figures on the operators' screen, in the order they are shown.
const figures: { key: keyof PlatformStats; label: string }[] = [
  { key: "students", label: "가입한 학생단체" },
  { key: "brands", label: "가입한 브랜드" },
  { key: "newThisWeek", label: "이번 주 새 가입" },
  { key: "events", label: "등록된 행사" },
  { key: "upcomingEvents", label: "다가오는 행사" },
  { key: "proposals", label: "보낸 제안" },
  { key: "sponsorships", label: "확정된 협찬" },
  { key: "scans", label: "QR 스캔" },
  { key: "coupons", label: "쿠폰 수령" },
  { key: "visits", label: "매장 방문" },
  { key: "messages", label: "주고받은 메시지" },
  { key: "questionsWaiting", label: "답변 대기 질문" },
]

// Accepted out of the proposals answered so far, as a percentage.
const acceptance = (accepted: number, declined: number) =>
  accepted + declined === 0 ? "-" : `${Math.round((accepted / (accepted + declined)) * 100)}%`

// Real members' figures large, with the demo data's totals under each.
function StatsPanel({ stats }: { stats: PlatformStats }) {
  return (
    <section aria-labelledby="admin-stats-title" className="admin-stats">
      <h2 className="admin-section-title" id="admin-stats-title">
        {t("지표")}
      </h2>
      <p className="field-hint">{t("큰 숫자는 실제 회원의 것이고, 작은 글씨는 데모 계정과 시드 데이터를 더한 값이에요.")}</p>
      <dl className="admin-stat-grid">
        {figures.map(({ key, label }) => (
          <div className="admin-stat" key={key}>
            <dt>{t(label)}</dt>
            <dd>
              <strong>{stats[key].real.toLocaleString(locale)}</strong>
              <small>{t("데모 포함 {count}", { count: stats[key].total.toLocaleString(locale) })}</small>
            </dd>
          </div>
        ))}
        <div className="admin-stat">
          <dt>{t("제안 수락률")}</dt>
          <dd>
            <strong>{acceptance(stats.accepted.real, stats.declined.real)}</strong>
            <small>{t("데모 포함 {count}", { count: acceptance(stats.accepted.total, stats.declined.total) })}</small>
          </dd>
        </div>
      </dl>
    </section>
  )
}

// The operators' screen (/admin, in no menu): with the ADMIN_TOKEN from the
// server's environment, it shows the platform's figures, then lists the
// questions sent from the help center, waiting ones first, and sends answers
// members read under 내 질문.
export function AdminPage({ onNotice }: { onNotice: (message: string) => void }) {
  const [token, setToken] = useState(readToken)
  const [tokenDraft, setTokenDraft] = useState("")
  const [inquiries, setInquiries] = useState<AdminInquiry[] | null>(null)
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [tab, setTab] = useState<Tab>("waiting")
  const [error, setError] = useState("")

  const signOut = useCallback((message = "") => {
    writeToken("")
    setToken("")
    setInquiries(null)
    setStats(null)
    setError(message)
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([api.adminInquiries(token), api.adminStats(token)])
      .then(([listed, counted]) => {
        if (cancelled) return
        writeToken(token)
        setInquiries(listed.inquiries)
        setStats(counted.stats)
        setError("")
      })
      .catch((caught) => {
        if (cancelled) return
        if (caught instanceof ApiError && caught.status === 403) signOut(t("관리자 토큰이 맞지 않아요."))
        else setError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [token, signOut])

  const answer = async (inquiry: AdminInquiry, text: string) => {
    try {
      const result = await api.answerInquiry(token, inquiry.id, text)
      setInquiries((current) =>
        (current ?? []).map((item) => (item.id === inquiry.id ? { ...item, ...result.inquiry } : item)),
      )
      onNotice(t("답변을 보냈어요."))
    } catch (caught) {
      onNotice(errorMessage(caught))
    }
  }

  const waiting = (inquiries ?? []).filter((inquiry) => !inquiry.answer)
  const answered = (inquiries ?? []).filter((inquiry) => inquiry.answer)
  const list = tab === "waiting" ? waiting : answered

  return (
    <section className="page-view admin-page">
      <PageIntro
        eyebrow="Operators"
        title={t("운영자 화면")}
        description={t("서비스 지표를 보고, 도움말 센터의 '관리자에게 질문하기'로 들어온 질문을 확인하고 답해요.")}
        actions={
          inquiries && (
            <Pill onClick={() => signOut()} variant="outline">
              {t("나가기")}
            </Pill>
          )
        }
      />

      {!inquiries ? (
        <form
          className="admin-login"
          onSubmit={(event) => {
            event.preventDefault()
            if (tokenDraft.trim()) setToken(tokenDraft.trim())
          }}
        >
          <PasswordField
            autoComplete="off"
            label={t("관리자 토큰")}
            placeholder={t("서버의 ADMIN_TOKEN")}
            toggleLabel={t("토큰 보기")}
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={!tokenDraft.trim()} type="submit">
            {t("확인")}
          </button>
          <small className="field-hint">{t("토큰은 이 탭에만 기억되고, 탭을 닫으면 지워져요.")}</small>
        </form>
      ) : (
        <>
          {stats && <StatsPanel stats={stats} />}
          <h2 className="admin-section-title">{t("질문")}</h2>
          <TabBar
            items={[
              { value: "waiting", label: <>{t("답변 대기")}<em>{waiting.length}</em></> },
              { value: "answered", label: <>{t("답변 완료")}<em>{answered.length}</em></> },
            ]}
            label={t("질문 상태")}
            onChange={setTab}
            value={tab}
          />
          {list.length === 0 ? (
            <p className="day-empty">{tab === "waiting" ? t("답을 기다리는 질문이 없어요.") : t("아직 답한 질문이 없어요.")}</p>
          ) : (
            <div className="admin-list" key={tab}>
              {list.map((inquiry) => (
                <InquiryCard inquiry={inquiry} key={inquiry.id} onAnswer={answer} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
