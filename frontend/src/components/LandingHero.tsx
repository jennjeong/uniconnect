import { useSiteState } from "../hooks/useSiteState"
import { t } from "../i18n"
import { useExperiment } from "../lib/experiments"
import type { Role } from "../types"
import { Icon } from "./Icon"
import { RoleMark } from "./RoleMark"

// 소개 페이지의 첫 화면. 누구를 위한 서비스인지와 무엇을 주고받는지를 한 문장으로,
// 학생단체와 브랜드의 시작을 따로 두고, 오른쪽에는 이 서비스가 실제로 남기는 것 —
// 학생 행사와 브랜드의 지원 조건이 합의를 거쳐 하나의 협찬 기록이 되는 장면 — 을
// 예시 데이터로 보인다. U자 선이 두 쪽을 잇는다(로고의 U와 연결). 장식 없이 바로
// 읽힌다.
export function LandingHero({
  onSignup,
  onInstall,
}: {
  onSignup: (role: Role) => void
  onInstall?: () => void
}) {
  // A/B 테스트(#347): B는 시작 버튼의 아랫줄을 가입이 무료라는 말로 바꾼다.
  const site = useSiteState()
  const { variant, ready } = useExperiment("landing-entry", site && (site.experiments ?? {}))
  const free = variant === "B"
  // 문구를 정하는 동안(첫 방문, 길어야 0.5초) 자리는 지키고 글자만 감춘다.
  const copy = ready ? undefined : "landing-entry-waiting"
  return (
    <section aria-labelledby="landing-title" className="landing-hero">
      <div className="landing-hero-copy">
        <p className="landing-kicker">{t("대학 학생단체 × 브랜드 협찬")}</p>
        <h1 id="landing-title">
          <span>{t("캠퍼스 행사 협찬을")}</span>
          <span>{t("제안부터 성과까지")}</span>
          <span className="accent">{t("한 장의 기록으로")}</span>
        </h1>
        <p className="landing-lead">
          {t("학생단체는 행사에 맞는 브랜드를 찾고, 브랜드는 쿠폰과 매장 방문으로 결과가 남는 학생 행사를 협찬해요.")}
        </p>
        {/* 두 역할의 시작을 나란히 비교한다. 버튼은 같은 높이와 배치이고, 그 역할이 얻는 결과는
            버튼 바로 아래 한 문장이다(버튼의 이름에 들어가지 않게 aria-describedby로 잇는다). */}
        <div className="landing-entries">
          <div className="landing-entry-cell">
            <button aria-describedby="entry-group-gets" className="landing-entry" onClick={() => onSignup("학생단체")} type="button">
              <RoleMark role="학생단체" size={32} />
              <span>
                <strong>{t("학생단체로 시작")}</strong>
                <small className={copy}>{free ? t("무료로 가입하고 협찬 받기") : t("행사 협찬 받기")}</small>
              </span>
              <Icon name="arrow" size={18} />
            </button>
            <p className="landing-entry-gets" id="entry-group-gets">
              {t("맞는 브랜드를 추천받고, 계약부터 성과까지 한곳에 남겨요.")}
            </p>
          </div>
          <div className="landing-entry-cell">
            <button aria-describedby="entry-brand-gets" className="landing-entry blue" onClick={() => onSignup("브랜드")} type="button">
              <RoleMark role="브랜드" size={32} />
              <span>
                <strong>{t("브랜드로 시작")}</strong>
                <small className={copy}>{free ? t("무료로 가입하고 학생 행사 찾기") : t("학생 행사 협찬하기")}</small>
              </span>
              <Icon name="arrow" size={18} />
            </button>
            <p className="landing-entry-gets" id="entry-brand-gets">
              {t("협찬한 행사의 결과를 쿠폰과 매장 방문 수로 확인해요.")}
            </p>
          </div>
        </div>
        <p className="landing-hero-tools">
          <a className="underline-link" href="#examples">
            {t("가입 전에 예시 화면 둘러보기")}
          </a>
          {onInstall && (
            <button className="underline-link quiet" onClick={onInstall} type="button">
              {t("앱 다운로드")}
            </button>
          )}
        </p>
      </div>

      <figure className="landing-record" aria-label={t("예시 협찬 기록")}>
        <figcaption>
          <span>{t("협찬 기록")}</span>
          <em>{t("예시")}</em>
        </figcaption>
        <ol>
          <li className="from-group">
            <span className="record-step">{t("행사")}</span>
            <strong>{t("가을 버스킹 데이")}</strong>
            <small>{t("삼육대 뮤즈 · 10월 12일 · 예상 160명")}</small>
          </li>
          <li className="from-brand">
            <span className="record-step">{t("지원 조건")}</span>
            <strong>{t("아메리카노 쿠폰 150장 + 현금 20만 원")}</strong>
            <small>{t("오후의 커피 · 행사 3일 전까지 전달")}</small>
          </li>
          <li className="agreed">
            <span className="record-step">{t("합의")}</span>
            <strong>{t("양쪽 계약 확인 · 협찬액 68만 원")}</strong>
            <small>{t("할 일 6개 · 부스 로고 · SNS 게시물 1회")}</small>
          </li>
          <li className="result">
            <span className="record-step">{t("성과")}</span>
            <strong className="record-results">
              <span>{t("QR 스캔 {count}회", { count: 128 })} ·</span>{" "}
              <span>{t("쿠폰 수령 {count}장", { count: 94 })} ·</span>{" "}
              <span>{t("매장 방문 {count}건", { count: 41 })}</span>
            </strong>
            <small>{t("현장에서 집계한 수치예요.")}</small>
          </li>
        </ol>
      </figure>
    </section>
  )
}
