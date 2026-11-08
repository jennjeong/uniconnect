import { useId, useState } from "react"

import { t } from "../i18n"

// 추천 지수(백엔드 lib/matchScore.ts)를 '추천 지수 90'처럼 이름과 숫자를 한 줄로 읽히게
// 보인다. 업종 궁합, 관심사, 실적, 함께한 이력, 응답 준비를 가중해 더한 추천 순서용
// 값이고 성사 확률이 아니라서 퍼센트를 붙이지 않으며, 화면 읽기 프로그램에도 그렇게
// 말한다. 파랑은 행동과 선택에 쓰므로 배지는 중립색이다.
export function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      aria-label={t("추천 지수 {score}. 성사 확률이 아니라 업종 · 태그 · 실적 · 함께한 이력 · 응답 준비로 매긴 추천 순서예요.", { score })}
      className="score-badge"
      role="img"
    >
      <span aria-hidden="true">{t("추천 지수")}</span>
      <strong aria-hidden="true">{score}</strong>
    </span>
  )
}

// 목록 위의 '추천 지수란?'. 눌러서 무엇으로 매기는지 펼친다. 카드마다 같은 설명을
// 되풀이하지 않고 목록에 한 번 둔다. side는 보는 쪽(학생단체는 브랜드를, 브랜드는
// 단체를 본다)으로, 행사가 점수에 들어가는지가 다르다.
export function ScoreNote({ side }: { side: "학생단체" | "브랜드" }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="score-note">
      <button aria-controls={id} aria-expanded={open} className="score-note-toggle" onClick={() => setOpen(!open)} type="button">
        {t("추천 지수란?")}
      </button>
      <div className="score-note-body" hidden={!open} id={id}>
        <p>
          {side === "학생단체"
            ? t("우리 단체 소개(분야 · 관심사)와 브랜드의 업종, 협찬 경험, 함께한 이력, 제안에 답할 준비로 55~98점을 매긴 추천 순서예요.")
            : t("우리 브랜드 소개(업종 · 관심사)와 단체의 분야, 행사 규모, 함께한 이력, 다음 행사까지 남은 날로 55~98점을 매긴 추천 순서예요.")}
        </p>
        <p>
          {side === "학생단체"
            ? t("행사마다 달라지지 않아요. 제안할 때 어느 행사로 제안할지 골라요.")
            : t("단체의 다음 행사를 기준으로 해요. 행사가 45일 안에 있으면 점수가 올라가요.")}
        </p>
        <p>{t("계약이 성사될 확률이나 검증된 예측이 아니에요. 항목별 점수는 상세 정보에서 볼 수 있어요.")}</p>
      </div>
    </div>
  )
}
