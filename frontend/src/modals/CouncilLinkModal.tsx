import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import type { CouncilLink } from "../types"

// A club's link to its student councils (내 정보's 학생회 연결): the code the
// council shared links it, three at most, and it can unlink any time. The
// council then sees its events, proposals and results, never its messages,
// contacts or agreements.
export function CouncilLinkModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [councils, setCouncils] = useState<CouncilLink[] | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.councilLinks().then(
      (result) => setCouncils(result.councils),
      (caught: unknown) => setError(errorMessage(caught)),
    )
  }, [])

  const run = async (change: () => Promise<{ councils: CouncilLink[] }>, notice: string) => {
    setBusy(true)
    setError("")
    try {
      setCouncils((await change()).councils)
      onNotice(notice)
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="council-link" kicker="Council" title={t("학생회 연결")} onClose={onClose}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!code.trim()) return setError(t("학생회에서 받은 코드를 입력해 주세요."))
          void run(() => api.linkCouncil(code.trim()), t("학생회에 연결했어요.")).then((done) => done && setCode(""))
        }}
      >
        <p className="auth-lead">
          {t("소속 학생회가 알려 준 코드를 넣으면, 학생회가 우리 단체의 행사와 협찬 현황, 성과 숫자를 볼 수 있어요. 메시지, 연락처, 계약서 내용은 보이지 않고, 언제든 연결을 끊을 수 있어요.")}
        </p>
        {councils && councils.length > 0 && (
          <ul className="device-list">
            {councils.map((council) => (
              <li key={council.id}>
                <span>
                  <strong>{council.name}</strong>
                  <small>{[council.school, t(council.type)].filter(Boolean).join(" · ")}</small>
                </span>
                <button
                  className="cancel-button"
                  disabled={busy}
                  onClick={() => void run(() => api.unlinkCouncil(council.id), t("{name}과 연결을 끊었어요.", { name: council.name }))}
                  type="button"
                >
                  {t("연결 끊기")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label>
          {t("학생회 코드")}
          <input autoComplete="off" onChange={(event) => setCode(event.target.value)} placeholder="ABCD-2345" value={code} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("연결하기")}
        </button>
      </form>
    </Modal>
  )
}
