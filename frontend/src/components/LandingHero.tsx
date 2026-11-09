import { t } from "../i18n"
import type { Role } from "../types"
import { Icon } from "./Icon"
import { RoleMark } from "./RoleMark"

// 소개 페이지의 첫 화면. 누구를 위한 서비스인지와 무엇을 주고받는지를 한 문장으로,
// 학생단체와 브랜드의 시작을 따로 두고, 오른쪽에는 이 서비스가 실제로 남기는 것 —
// 학생 행사와 브랜드의 지원 조건이 합의를 거쳐 하나의 협찬 기록이 되는 장면 — 을
// 예시 데이터로 보인다. U자 선이 두 쪽을 잇는다(로고의 U와 연결). 장식 없이 바로
// 읽힌다.
// 예시 협찬 기록의 성과. 학생 행사 한 번에서 현장에서 센 값이다.
const resultFigures = [
  { label: "QR 참여", value: 128 },
  { label: "쿠폰 수령", value: 94 },
  { label: "매장 방문", value: 41 },
]

export function LandingHero({
  onSignup,
  onInstall,
}: {
  onSignup: (role: Role) => void
  onInstall?: () => void
}) {
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
        <div className="landing-entries">
          <button className="landing-entry" onClick={() => onSignup("학생단체")} type="button">
            <RoleMark role="학생단체" size={32} />
            <span>
              <strong>{t("학생단체로 시작")}</strong>
              <small>{t("행사 협찬 받기")}</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>
          <button className="landing-entry blue" onClick={() => onSignup("브랜드")} type="button">
            <RoleMark role="브랜드" size={32} />
            <span>
              <strong>{t("브랜드로 시작")}</strong>
              <small>{t("학생 행사 협찬하기")}</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>
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
            <small>{t("삼육대 뮤즈 · 11월 12일 · 예상 120명")}</small>
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
            {/* 지표명은 왼쪽, 숫자는 오른쪽 한 기준선에. 행 사이에만 얇은 선. */}
            <dl className="record-figures">
              {resultFigures.map((figure) => (
                <div key={figure.label}>
                  <dt>{t(figure.label)}</dt>
                  <dd>{figure.value}</dd>
                </div>
              ))}
            </dl>
            {/* 이 카드에는 매출 수치가 없어 추정 안내는 매출을 보여 주는 리포트에 둔다. */}
            <small className="record-note">{t("현장에서 집계한 수치예요.")}</small>
          </li>
        </ol>
      </figure>
    </section>
  )
}
