import { useContext, useEffect, useId, useRef, type ReactNode } from "react"

import { useDialogFocus } from "../hooks/useDialogFocus"
import { t } from "../i18n"
import type { ModalName } from "../types"
import { GradientBackdrop } from "./GradientBackdrop"
import { Icon } from "./Icon"
import { ClosingContext } from "./Presence"

// 공용 대화창 틀. 흐린 배경 위의 흰 패널에 제목 위 아이콘 라벨과 둥근 닫기
// 버튼이 있다. `banner`가 있으면 제목이 움직이는 남색 ShaderGradient 띠 위에
// 놓인다 (로그인과 가입). 배경 클릭, 닫기 버튼, Escape가 모두 닫는다. Presence
// 안에서는 닫히는 동안 아래로 미끄러진다. 열려 있는 동안 키보드를
// 붙잡고(useDialogFocus), 제목에는 고유한 id가 있어서 하나가 닫히고 다른 하나가
// 열릴 때 id를 같이 쓰지 않는다.
export function Modal({
  name,
  kicker,
  title,
  banner = false,
  onClose,
  children,
}: {
  name: ModalName
  kicker: string
  title: string
  banner?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const closing = useContext(ClosingContext)
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(dialog, !closing)

  useEffect(() => {
    if (closing) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [closing, onClose])

  const heading = (
    <div className="modal-header">
      <span className={banner ? "eyebrow light" : "eyebrow"}>{kicker}</span>
      <h2 id={titleId}>{title}</h2>
    </div>
  )

  return (
    <div
      className={closing ? "modal-backdrop closing" : "modal-backdrop"}
      role="presentation"
      onMouseDown={closing ? undefined : onClose}
    >
      <div
        className={`modal modal-${name}${banner ? " has-banner" : ""}${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialog}
        tabIndex={-1}
      >
        {banner ? (
          <div className="modal-banner has-gradient">
            <GradientBackdrop />
            {heading}
          </div>
        ) : (
          heading
        )}
        <button className="modal-close" aria-label={t("닫기")} onClick={onClose} type="button">
          <Icon name="close" size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}
